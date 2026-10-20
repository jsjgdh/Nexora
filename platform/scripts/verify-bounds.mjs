/* The two P0 items of TODO section 1 that are about bounds and limits:
   compile-time abuse bounds, and the single-instance limit story.
 *
 * Compile-time abuse bounds
 *   A submission over a size limit is refused before any runner sees it, and
 *   a run that goes past its wall clock or its CPU budget is killed — the
 *   whole process tree, so nothing keeps burning after the answer is sent.
 *   The proof is over HTTP against the real execution service, with a real Go
 *   toolchain, and the "nothing is left running" half is proved by a marker
 *   file a grandchild would have written had it survived.
 *
 * Limits and quotas
 *   The rate caps, the anonymous cap, the whole-platform budget and the
 *   dependency breaker all live in the one gateway process, and the platform
 *   runs one gateway, so their counters are the product's counters. The proof
 *   is over HTTP against the real gateway process, with a stub upstream that
 *   can be broken on purpose.
 *
 * The database is real: a PGlite instance (Postgres compiled to WebAssembly)
 * behind a socket server, with the identity service's own migrations applied
 * in order. The learner whose quota is enforced is a row in it, and the token
 * the gateway accepts is the one the identity service signed.
 *
 * Runs as `node --test scripts/verify-bounds.mjs`. */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { createService } from "@nexora/service-kit";
import { registerAuthRoutes } from "../services/auth/dist/routes.js";
import { registerExecutionRoutes } from "../services/execution/dist/routes.js";
import { JobQueue } from "../services/execution/dist/queue.js";
import { Quotas } from "../services/execution/dist/quotas.js";
import { buildDockerArgs } from "../services/execution/dist/runners/docker.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const MESH_KEY = "test-mesh-key-0123456789abcdef0123456789";
const JWT_SECRET = "test-jwt-secret-0123456789abcdef0123456789abcdef";
process.env.INTERNAL_API_KEY = MESH_KEY;
process.env.AUTH_JWT_SECRET = JWT_SECRET;
process.env.LOG_LEVEL = "warn";

/** A port the operating system picks. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function listenOn(server, port) {
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- the platform under test ---------- */

let db;
let socketServer;
let pool;
let authApp;
let execApp;
let authPort;
let execPort;
let goCache;
const gateways = [];
let learner = null;

const asUser = (id) => ({ "x-user-id": id, "x-internal-key": MESH_KEY });

/**
 * A path in the form a Go source can hold without escaping: forward
 * slashes, which Windows accepts, and no backslashes for the compiler to
 * read as escape sequences.
 */
const markerPath = (name) => join(tmpdir(), name).replace(/\\/g, "/");

/** The identity service's own migrations, in the order it applies them. */
async function migrate() {
  const dir = join(root, "services", "auth", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pool.query(readFileSync(join(dir, file), "utf8"));
  }
}

/**
 * A Go program that writes a marker file and keeps running.
 *
 * The marker is written by a grandchild, not by the program itself: the
 * parent starts a child that waits and then writes the file, then the parent
 * sleeps. A runner that kills only the direct child leaves the grandchild
 * alive, and the marker appears after the request was answered. The marker
 * path is absolute because the runner's working directory is a temp
 * directory it deletes.
 */
function markerProgram(marker, waitSeconds = 3) {
  return `package main

import (
	"os/exec"
	"time"
)

func main() {
	// The child waits, then writes the marker. It is a separate process, so
	// only a runner that kills the whole tree stops it.
	child := exec.Command("cmd", "/c", "ping -n ${waitSeconds} 127.0.0.1 > nul & echo x > \\"${marker}\\"")
	_ = child.Start()
	time.Sleep(10 * time.Minute)
}
`;
}

/** A Go program that writes a marker file and exits. */
function quickMarkerProgram(marker) {
  return `package main

import (
	"os"
)

func main() {
	_ = os.WriteFile("${marker}", []byte("ran"), 0644)
	println("done")
}
`;
}

/** A Go program that starts CPU-burning child processes and waits. */
function cpuProgram() {
  return `package main

import (
	"fmt"
	"os"
	"os/exec"
	"time"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "hog" {
		x := 0
		for {
			for i := 0; i < 1000000; i++ {
				x += i
			}
			if x == -1 {
				fmt.Println(x)
			}
		}
	}
	exe, err := os.Executable()
	if err != nil {
		return
	}
	for i := 0; i < 8; i++ {
		child := exec.Command(exe, "hog")
		_ = child.Start()
	}
	time.Sleep(10 * time.Minute)
}
`;
}

/** Start the real gateway, as its own process, the way the deployment does. */
async function startGateway(extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [join(root, "services", "gateway", "dist", "index.js")], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      FRONTEND_URL: "http://localhost:3000",
      AUTH_JWT_SECRET: JWT_SECRET,
      INTERNAL_API_KEY: MESH_KEY,
      LOG_LEVEL: "warn",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.resume();
  child.stderr?.resume();
  const gw = { port, child, base: `http://127.0.0.1:${port}` };
  gateways.push(gw);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the gateway did not start (exit ${child.exitCode})`);
    try {
      const res = await fetch(`${gw.base}/health/live`);
      if (res.ok) return gw;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error("the gateway did not answer on its port in time");
}

/* ---------- the suite ---------- */

describe("the bounds and the limits, proved over HTTP", () => {
  before(async () => {
    const pgPort = await freePort();
    db = await PGlite.create();
    socketServer = new PGLiteSocketServer({ db, port: pgPort, host: "127.0.0.1", maxConnections: 8 });
    await socketServer.start();
    pool = new Pool({ connectionString: `postgres://nexora:nexora@127.0.0.1:${pgPort}/postgres`, max: 4 });
    await migrate();

    authApp = await createService("test-auth-bounds");
    registerAuthRoutes(authApp, pool);
    authPort = await freePort();
    await authApp.listen({ port: authPort, host: "127.0.0.1" });

    execApp = await createService("test-execution-bounds");
    registerExecutionRoutes(execApp, {
      queue: new JobQueue(2),
      quotas: new Quotas(2, 2),
      runner: "subprocess",
    });
    execPort = await freePort();
    await execApp.listen({ port: execPort, host: "127.0.0.1" });

    /* A warm Go build cache, so a Go program in this suite starts in
       milliseconds instead of paying for the standard library. The cache is
       content-addressed, which is why the runner is allowed to share one. */
    goCache = mkdtempSync(join(tmpdir(), "nexora-gocache-"));
    const warm = mkdtempSync(join(tmpdir(), "nexora-warm-"));
    const warmFile = join(warm, "main.go");
    writeFileSync(warmFile, quickMarkerProgram(markerPath("nexora-warm-marker.txt")));
    execFileSync("go", ["build", "-o", join(warm, "warm.exe"), warmFile], {
      env: { ...process.env, GOCACHE: goCache, GOPATH: join(warm, "gopath"), GOTOOLCHAIN: "local", CGO_ENABLED: "0" },
    });
    process.env.EXECUTION_GO_CACHE = goCache;

    /* A real learner, in the real database, with a token the identity
       service signed. The gateway verifies the same secret. */
    const registered = await fetch(`http://127.0.0.1:${authPort}/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": MESH_KEY },
      body: JSON.stringify({ email: "bounds@example.com", password: "a-long-enough-password-123" }),
    });
    assert.equal(registered.status, 201, "the learner is created in the real database");
    const body = await registered.json();
    learner = { id: body.user.id, token: body.tokens.accessToken };
    const { rows } = await pool.query("SELECT id, email FROM users WHERE id = $1", [learner.id]);
    assert.equal(rows.length, 1, "and the row is in the database, not only in the answer");
  });

  after(async () => {
    for (const gw of gateways) {
      try {
        gw.child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
    await execApp?.close();
    await authApp?.close();
    await pool?.end();
    await socketServer?.stop();
    await db?.close();
    if (goCache) rmSync(goCache, { recursive: true, force: true });
  });

  /* ---------- item 1: compile-time abuse bounds ---------- */

  describe("an oversized submission is refused before any runner sees it", () => {
    it("a submission over the total size limit is refused, and the program never ran", async () => {
      const marker = markerPath(`nexora-marker-${Date.now()}.txt`);
      const program = quickMarkerProgram(marker);
      // Three files under the per-file ceiling, together over the total
      // ceiling. The per-file limit alone cannot be reached through the
      // public route: the wire schema caps a file at the same number.
      const files = [
        { path: "main.go", content: program },
        { path: "a.go", content: "// padding\n".repeat(23_000) },
        { path: "b.go", content: "// padding\n".repeat(23_000) },
        { path: "c.go", content: "// padding\n".repeat(23_000) },
      ];
      const res = await fetch(`http://127.0.0.1:${execPort}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", ...asUser("u-bounds") },
        body: JSON.stringify({ language: "go", files }),
      });
      assert.equal(res.status, 400, "the submission is refused");
      const body = await res.json();
      assert.equal(body.error.code, "bad_request");
      assert.match(body.error.message, /too large/i, "and the message says what was wrong");
      await sleep(1500);
      assert.equal(existsSync(marker), false, "the program never ran, so the runner never saw it");
    });

    it("a file over the wire ceiling is refused, and the program never ran", async () => {
      const marker = markerPath(`nexora-marker-${Date.now()}.txt`);
      const res = await fetch(`http://127.0.0.1:${execPort}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", ...asUser("u-bounds") },
        body: JSON.stringify({
          language: "go",
          files: [{ path: "main.go", content: quickMarkerProgram(marker) + "// padding\n".repeat(40_000) }],
        }),
      });
      assert.equal(res.status, 400, "the submission is refused");
      await sleep(1500);
      assert.equal(existsSync(marker), false, "and nothing ran");
    });

    it("a Go submission with too many imports is refused before the compiler sees it", async () => {
      const imports = Array.from({ length: 41 }, (_, i) => `\t"fmt"\n`).join("");
      const res = await fetch(`http://127.0.0.1:${execPort}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", ...asUser("u-bounds") },
        body: JSON.stringify({
          language: "go",
          files: [{ path: "main.go", content: `package main\n\nimport (\n${imports})\n\nfunc main() {}\n` }],
        }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.error.message, /imports 41 packages; the limit is 40/);
    });

    it("a Go program of the shape a learner's code has is still accepted", async () => {
      // The bounds must not eat ordinary work: a program with a handful of
      // imports runs.
      const res = await fetch(`http://127.0.0.1:${execPort}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", ...asUser("u-bounds-a") },
        body: JSON.stringify({
          language: "go",
          files: [
            {
              path: "main.go",
              content: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("ok") }\n',
            },
          ],
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.exitCode, 0);
      assert.equal(body.stdout.trim(), "ok");
      assert.equal(body.bound, null, "and no bound was hit");
    });
  });

  describe("a run that goes past its bound is killed, and nothing survives it", () => {
    it("a run past the wall clock is killed, the answer says so, and the tree dies with it", async () => {
      const marker = markerPath(`nexora-marker-${Date.now()}.txt`);
      const res = await fetch(`http://127.0.0.1:${execPort}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", ...asUser("u-bounds-b") },
        body: JSON.stringify({
          language: "go",
          files: [{ path: "main.go", content: markerProgram(marker, 3) }],
          limits: { timeoutMs: 1500 },
        }),
      });
      assert.equal(res.status, 200, "the run is answered, not hung");
      const body = await res.json();
      assert.equal(body.bound, "wall", "the answer says which bound was hit");
      assert.equal(body.timedOut, true);
      assert.equal(body.exitCode, null, "a killed run has no exit code");
      assert.ok(body.durationMs < 15_000, "and the answer came promptly");
      // The grandchild would have written the marker three seconds in. It
      // must not exist: the whole tree was killed, not just the program.
      await sleep(5000);
      assert.equal(existsSync(marker), false, "nothing was left running behind the answer");
    });

    it("a build that burns more CPU than its budget is killed, and the answer says so", async (t) => {
      // The bound is on the CPU the whole tree uses, so it can only be
      // observed where the tree can use more than one core.
      if (cpus().length < 8) {
        t.skip(`this host has ${cpus().length} cores; the CPU bound needs a tree that can use several`);
        return;
      }
      const res = await fetch(`http://127.0.0.1:${execPort}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json", ...asUser("u-bounds-c") },
        body: JSON.stringify({
          language: "go",
          files: [{ path: "main.go", content: cpuProgram() }],
          limits: { timeoutMs: 6000 },
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.bound, "cpu", "the answer names the CPU budget, not the clock");
      assert.equal(body.timedOut, false, "the wall clock was not what stopped it");
      assert.equal(body.exitCode, null);
      assert.ok(body.durationMs < 6000, "and it was stopped before the wall clock ran out");
    });
  });

  describe("the docker tier carries its own bounds", () => {
    it("the command the docker runner builds caps the CPU, the memory and the network", () => {
      const job = {
        language: "go",
        files: [],
        command: ["go", "run", "main.go"],
        stdin: "",
        timeoutMs: 20_000,
        memoryMb: 128,
        outputKb: 64,
      };
      const args = buildDockerArgs(job, "/tmp/work", "/tmp/work/cid");
      assert.ok(args.includes("--cpus"), "the container has a CPU cap");
      assert.equal(args[args.indexOf("--cpus") + 1], "0.5", "of half a core");
      assert.ok(args.includes("--memory"), "and a memory cap");
      assert.equal(args[args.indexOf("--memory") + 1], "128m");
      assert.equal(args[args.indexOf("--network") + 1], "none", "and no network");
      assert.ok(args.includes("--cidfile"), "and it writes down its container id, so a timeout can stop the container itself");
    });
  });

  /* ---------- item 2: the limits and the quotas ---------- */

  describe("the gateway's anonymous cap", () => {
    it("requests over the anonymous cap are refused with 429 and a retry hint", async () => {
      const stub = createHttpServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
      const stubPort = await freePort();
      await listenOn(stub, stubPort);
      const gw = await startGateway({
        AUTH_URL: `http://127.0.0.1:${stubPort}`,
        CURRICULUM_URL: `http://127.0.0.1:${stubPort}`,
        EXECUTION_URL: `http://127.0.0.1:${stubPort}`,
        BILLING_URL: `http://127.0.0.1:${stubPort}`,
        GATEWAY_ANON_LIMIT: "2",
        GATEWAY_GLOBAL_LIMIT: "1000",
        GATEWAY_LIMIT_WINDOW_MS: "1000",
      });
      try {
        const statuses = [];
        let refused = null;
        for (let i = 0; i < 4; i++) {
          const res = await fetch(`${gw.base}/api/curriculum/ide/manifest`);
          statuses.push(res.status);
          if (res.status === 429 && !refused) {
            refused = { headers: res.headers, body: await res.json() };
          }
        }
        assert.deepEqual(statuses, [200, 200, 429, 429], "the cap is exact: two allowed, the rest refused");
        assert.equal(refused.body.error.code, "anonymous_rate_limited");
        assert.ok(refused.headers.get("retry-after"), "and the answer says when to come back");
        const retry = Number(refused.headers.get("retry-after"));
        assert.ok(retry > 0 && retry <= 2, "and the hint is the window that is left");
      } finally {
        await new Promise((r) => stub.close(r));
      }
    });
  });

  describe("every public path goes through the gateway's limiter", () => {
    it("the cap counts the API paths, the unknown paths and the public paths alike", async () => {
      const stub = createHttpServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
      const stubPort = await freePort();
      await listenOn(stub, stubPort);
      const gw = await startGateway({
        AUTH_URL: `http://127.0.0.1:${authPort}`,
        CURRICULUM_URL: `http://127.0.0.1:${stubPort}`,
        EXECUTION_URL: `http://127.0.0.1:${stubPort}`,
        BILLING_URL: `http://127.0.0.1:${stubPort}`,
        GATEWAY_GLOBAL_LIMIT: "3",
        GATEWAY_ANON_LIMIT: "1000",
        GATEWAY_LIMIT_WINDOW_MS: "1000",
      });
      const token = learner.token;
      const paths = [
        "/api/curriculum/ide/manifest",
        "/api/execute/verify",
        "/api/auth/me",
        "/api/nothing-here",
      ];
      try {
        for (const path of paths) {
          // Wait for the window to roll, so each path starts from a whole
          // budget and the refusal below can only be that path's own doing.
          await sleep(1100);
          const statuses = [];
          for (let i = 0; i < 5; i++) {
            const res = await fetch(`${gw.base}${path}`, { headers: { authorization: `Bearer ${token}` } });
            statuses.push(res.status);
          }
          assert.ok(
            statuses.slice(0, 3).every((s) => s !== 429),
            `${path} is answered normally under the cap: ${statuses.join(",")}`
          );
          assert.deepEqual(statuses.slice(3), [429, 429], `${path} is counted by the limiter like any other`);
        }
      } finally {
        await new Promise((r) => stub.close(r));
      }
    });
  });

  describe("the whole-platform budget", () => {
    it("the edge sheds load with 429 and a retry hint when the platform budget is spent", async () => {
      const stub = createHttpServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
      const stubPort = await freePort();
      await listenOn(stub, stubPort);
      const gw = await startGateway({
        AUTH_URL: `http://127.0.0.1:${authPort}`,
        CURRICULUM_URL: `http://127.0.0.1:${stubPort}`,
        EXECUTION_URL: `http://127.0.0.1:${stubPort}`,
        BILLING_URL: `http://127.0.0.1:${stubPort}`,
        GATEWAY_EDGE_LIMIT: "3",
        GATEWAY_GLOBAL_LIMIT: "1000",
        GATEWAY_ANON_LIMIT: "1000",
        GATEWAY_LIMIT_WINDOW_MS: "1000",
      });
      try {
        const statuses = [];
        let refused = null;
        for (let i = 0; i < 6; i++) {
          const res = await fetch(`${gw.base}/api/curriculum/ide/manifest`, {
            headers: { authorization: `Bearer ${learner.token}` },
          });
          statuses.push(res.status);
          if (res.status === 429 && !refused) {
            refused = { headers: res.headers, body: await res.json() };
          }
        }
        assert.deepEqual(statuses.slice(0, 3), [200, 200, 200], "the budget covers the first requests");
        assert.ok(statuses.slice(3).every((s) => s === 429), "and then the edge sheds load");
        assert.equal(refused.body.error.code, "edge_overloaded");
        assert.ok(refused.headers.get("retry-after"), "with a retry hint");
      } finally {
        await new Promise((r) => stub.close(r));
      }
    });
  });

  describe("the dependency breaker", () => {
    it("opens when the dependency stops answering, refuses traffic, and closes when it comes back", async () => {
      let broken = true;
      let hits = 0;
      const stub = createHttpServer((req, res) => {
        hits += 1;
        if (broken) {
          // The dependency is down: the connection dies without an answer.
          req.socket.destroy();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
      const stubPort = await freePort();
      await listenOn(stub, stubPort);
      const gw = await startGateway({
        // The identity service is real: the token carries a jti, so the edge
        // asks the identity service about it before it forwards anything.
        // The execution service is the dependency that is down.
        AUTH_URL: `http://127.0.0.1:${authPort}`,
        CURRICULUM_URL: `http://127.0.0.1:${stubPort}`,
        EXECUTION_URL: `http://127.0.0.1:${stubPort}`,
        BILLING_URL: `http://127.0.0.1:${stubPort}`,
        GATEWAY_BREAKER_FAILURES: "2",
        GATEWAY_BREAKER_COOLDOWN_MS: "1500",
        GATEWAY_GLOBAL_LIMIT: "1000",
        GATEWAY_ANON_LIMIT: "1000",
      });
      try {
        // Two failures in a row open the breaker.
        const first = await fetch(`${gw.base}/api/execute/capabilities`, {
          headers: { authorization: `Bearer ${learner.token}` },
        });
        assert.equal(first.status, 502, "a dead dependency is a bad gateway while the breaker is still closed");
        const second = await fetch(`${gw.base}/api/execute/capabilities`, {
          headers: { authorization: `Bearer ${learner.token}` },
        });
        assert.equal(second.status, 502);

        const hitsBefore = hits;
        const third = await fetch(`${gw.base}/api/execute/capabilities`, {
          headers: { authorization: `Bearer ${learner.token}` },
        });
        assert.equal(third.status, 503, "the breaker is open, and the answer is a refusal");
        const refused = await third.json();
        assert.equal(refused.error.code, "dependency_unavailable");
        assert.ok(third.headers.get("retry-after"), "and it says when to come back");
        assert.equal(hits, hitsBefore, "the dependency was not called at all: the refusal is not a forwarded failure");

        // The breaker is visible to an operator.
        const deep = await (await fetch(`${gw.base}/health/deep`)).json();
        assert.equal(deep.breaker.dependencies["/api/execute"].state, "open");

        // The dependency comes back. After the cooldown one probe is let
        // through, and the traffic flows again.
        broken = false;
        await sleep(1600);
        const recovered = await fetch(`${gw.base}/api/execute/capabilities`, {
          headers: { authorization: `Bearer ${learner.token}` },
        });
        assert.equal(recovered.status, 200, "the probe found the dependency back");
        const deep2 = await (await fetch(`${gw.base}/health/deep`)).json();
        assert.equal(deep2.breaker.dependencies["/api/execute"].state, "closed");
      } finally {
        await new Promise((r) => stub.close(r));
      }
    });
  });

  describe("the per-account quota and the single-process decision", () => {
    it("the daily quota of an account is enforced, through the gateway, on the public path", async () => {
      const gw = await startGateway({
        AUTH_URL: `http://127.0.0.1:${authPort}`,
        CURRICULUM_URL: `http://127.0.0.1:${authPort}`,
        EXECUTION_URL: `http://127.0.0.1:${execPort}`,
        BILLING_URL: `http://127.0.0.1:${authPort}`,
      });
      const run = () =>
        fetch(`${gw.base}/api/execute/execute`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${learner.token}` },
          body: JSON.stringify({
            language: "go",
            files: [{ path: "main.go", content: 'package main\n\nimport "fmt"\n\nfunc main() { fmt.Println("ok") }\n' }],
          }),
        });
      const first = await run();
      assert.equal(first.status, 200, "the account's first run is served");
      const second = await run();
      assert.equal(second.status, 200, "and its second");
      const third = await run();
      assert.equal(third.status, 429, "and the third is over the daily quota");
      const refused = await third.json();
      assert.equal(refused.error.code, "quota_reached");
      assert.match(refused.error.message, /daily execution quota/i);
      assert.equal(third.headers.get("x-execution-daily-remaining"), "0", "and the answer says nothing is left");
    });

    it("the edge states that its caps are the product's caps, because there is one of it", async () => {
      const gw = await startGateway({});
      const deep = await (await fetch(`${gw.base}/health/deep`)).json();
      assert.equal(deep.limits.scope, "single-process");
      assert.match(deep.limits.decision, /one gateway/i);
      assert.ok(deep.limits.global.max > 0, "and the caps it holds are named");
      assert.ok(deep.limits.anonymous.max > 0);
      assert.ok(deep.limits.edge.max > 0);
    });
  });
});
