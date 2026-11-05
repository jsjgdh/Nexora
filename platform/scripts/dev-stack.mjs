#!/usr/bin/env node
/* Boots the whole platform on this machine, without Docker.
 *
 *   cd platform
 *   npm run dev:stack
 *
 * What it starts, in the order it starts it:
 *
 *   1. two Postgres databases, one per service that owns data (auth, billing),
 *      served over the Postgres wire protocol so the ordinary `pg` driver
 *      connects to them unchanged;
 *   2. the five services (auth, curriculum, execution, billing, gateway), each
 *      from its own build, each applying its own forward-only migrations at
 *      boot exactly as it does in the compose stack;
 *   3. the learner app's environment, so the front door stops being in local
 *      mode.
 *
 * Why the database is not Postgres-the-program: this machine has no Docker
 * daemon and no Postgres install, and a local stack that needs one is a local
 * stack nobody runs. The database here is PGlite (Postgres compiled to
 * WebAssembly) behind a socket server that speaks the Postgres wire protocol,
 * so every line of service code (`pg`, `Pool`, `DATABASE_URL`, plain SQL) is
 * the same code that runs against a real Postgres. What changes is only where
 * the bytes live: inside this process instead of in a container.
 *
 * The one thing that is genuinely different, and it is stated rather than
 * hidden: PGlite is one database per instance and cannot `CREATE DATABASE`, so
 * the two service databases are two instances on two ports. The isolation
 * between them is the same isolation the compose stack has.
 *
 * Secrets are generated here, at run time, and written to gitignored files.
 * Nothing secret is ever written into a tracked file.
 *
 * Flags:
 *   --with-frontend  also start the SvelteKit app (needs its npm install done)
 *   --reset-db       drop the local databases first and start from nothing
 *   --no-build       do not build the services even if they look stale
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "..", "nexora-svelte");

/* The ports the compose stack uses, so a local run and a deployed one agree on
   where things are. The two database ports are local-only: nothing outside
   this machine should be able to reach them. */
const PORTS = {
  gateway: 8080,
  auth: 8101,
  curriculum: 8102,
  execution: 8104,
  billing: 8106,
};
const DB_PORTS = { authdb: 55432, billingdb: 55433 };

/* The origin the learner app is served from in a plain local run. The gateway
   answers CORS for exactly this origin, and the auth service builds the links
   in its mail against this origin, so a different port means a different value
   in both places. */
const APP_URL = "http://localhost:5173";
const FRONTEND_URL = APP_URL;
const GATEWAY_URL = `http://127.0.0.1:${PORTS.gateway}`;

const ENV_FILE = join(ROOT, ".env.local");
const APP_ENV_FILE = join(APP, ".env");
const DATA_DIR = join(ROOT, ".local", "pg");

/* The same denylist the services use (service-kit's isPlaceholderSecret), so a
   value copied out of .env.example is replaced here rather than reaching a
   service that will refuse it. */
const PLACEHOLDER = /(change[ _-]?me|changeme|replace[ _-]?me|placeholder)/i;

function randomSecret() {
  return randomBytes(32).toString("hex");
}

function usableSecret(value) {
  return typeof value === "string" && value.length >= 32 && !PLACEHOLDER.test(value);
}

/* ---------- the env file ---------- */

/**
 * Read a .env file into ordered key/value pairs.
 *
 * A hand-rolled reader rather than a dependency: the file is written and read
 * by one script, and a value may legitimately contain spaces, JSON or an `=`
 * (BILLING_PLANS_JSON does), so the value is everything after the first `=`.
 */
function parseEnv(text) {
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    entries.push([key, value]);
  }
  return entries;
}

function toMap(entries) {
  return new Map(entries);
}

async function readEnvFile(path) {
  try {
    return parseEnv(await readFile(path, "utf8"));
  } catch {
    return [];
  }
}

function renderEnvFile(entries, header) {
  const body = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  return `${header}\n${body}\n`;
}

/**
 * The environment the local stack runs with.
 *
 * The values that point at other services are forced to the local addresses:
 * this stack is the only thing running, and a leftover compose hostname
 * (`http://auth:8101`) would fail with a name that resolves nowhere. Everything
 * else the file already had is kept, so a real Dodo key or a Kinde
 * configuration survives a run.
 */
function stackEnv(existing) {
  const env = toMap(existing);
  const forced = {
    NODE_ENV: "development",
    GATEWAY_PORT: String(PORTS.gateway),
    FRONTEND_URL,
    TRUST_PROXY: "0",
    AUTH_URL: `http://127.0.0.1:${PORTS.auth}`,
    CURRICULUM_URL: `http://127.0.0.1:${PORTS.curriculum}`,
    EXECUTION_URL: `http://127.0.0.1:${PORTS.execution}`,
    BILLING_URL: `http://127.0.0.1:${PORTS.billing}`,
    /* Local by default, but a developer testing Kinde keeps the mode they set:
       the gateway and the site must agree, and silently forcing local would
       make the site's Kinde door point at a gateway that cannot verify it. */
    AUTH_MODE: env.get("AUTH_MODE") === "kinde" ? "kinde" : "local",
    /* The origin the site is served from. The auth service builds the links it
       would mail (a password reset, an address confirmation) against this
       value, and refuses to issue a token when it is missing: a link that
       points at a host that is not this product is a token in somebody else's
       inbox. The same value goes into nexora-svelte/.env. */
    PUBLIC_SITE_URL: APP_URL,
    /* The notice is required by policy in a production deployment. A local
       stack holds a real account, so the policy is switched on here too: a
       registration without the terms, the privacy notice and the age
       affirmation is refused, exactly as it is in production. */
    NEXORA_REQUIRE_CONSENT: "1",
    EXECUTION_RUNNER: "subprocess",
    EXECUTION_CONCURRENCY: "2",
    EXECUTION_DAILY_QUOTA: "200",
    EXECUTION_DEFAULT_TIMEOUT_MS: "8000",
    AUTH_DATABASE_URL: `postgres://nexora:nexora@127.0.0.1:${DB_PORTS.authdb}/authdb`,
    BILLING_DATABASE_URL: `postgres://nexora:nexora@127.0.0.1:${DB_PORTS.billingdb}/billingdb`,
  };
  for (const [key, value] of Object.entries(forced)) env.set(key, value);

  /* Two secrets that are refused at boot when they are placeholders, and
     which must be the same value for every service in the mesh. Generated
     here, once, and kept in the file so a second run does not invalidate the
     tokens the first one issued. */
  for (const key of ["AUTH_JWT_SECRET", "INTERNAL_API_KEY"]) {
    if (!usableSecret(env.get(key))) env.set(key, randomSecret());
  }
  return env;
}

async function writeStackEnv() {
  const existing = await readEnvFile(ENV_FILE);
  const env = stackEnv(existing);
  const header = [
    "# Written by `npm run dev:stack` in platform/. Every value here is for a",
    "# local run on this machine and is gitignored. The two secrets are",
    "# generated at run time; do not copy them anywhere.",
  ].join("\n");
  await writeFile(ENV_FILE, renderEnvFile([...env], header), "utf8");
  return env;
}

/* The half of Kinde the learner app owns. The issuer and audience are here
   too: the site validates the access token against the same issuer the gateway
   trusts, and the session bridge refuses to hand out a token whose subject
   disagrees with the ID token. */
const KINDE_APP_KEYS = [
  "KINDE_ISSUER_URL",
  "KINDE_CLIENT_ID",
  "KINDE_CLIENT_SECRET",
  "KINDE_REDIRECT_URL",
  "KINDE_POST_LOGIN_REDIRECT_URL",
  "KINDE_POST_LOGOUT_REDIRECT_URL",
  "KINDE_AUDIENCE",
  "KINDE_SCOPE",
  "KINDE_AUTH_WITH_PKCE",
  "KINDE_COOKIE_DOMAIN",
  "KINDE_CONNECTION_GOOGLE",
  "KINDE_CONNECTION_GITHUB",
  "KINDE_CONNECTION_DISCORD",
];

/**
 * The learner app's own environment: the addresses that take it out of local
 * mode, and the account door the stack is actually running.
 *
 * PUBLIC_API_URL is the browser's route to the gateway, and GATEWAY_URL is
 * this server's route to the same gateway. In a plain local run they are the
 * same address, because there is no container boundary in between. Any other
 * key the file already had is kept.
 *
 * The account door follows the stack's AUTH_MODE. Leaving the site in local
 * mode while the gateway expects Kinde tokens produces a sign-in that mints a
 * token the gateway refuses, and the failure looks like a broken password
 * rather than a mismatched configuration. In local mode the Kinde values are
 * removed so a stale door cannot survive a mode switch.
 */
async function writeAppEnv(stack) {
  const existing = await readEnvFile(APP_ENV_FILE);
  const env = toMap(existing);
  env.set("PUBLIC_API_URL", GATEWAY_URL);
  env.set("GATEWAY_URL", GATEWAY_URL);
  /* The origin the site is served from. The auth service builds the links in
     its mail against this value, so the two halves agree on where a learner
     is sent. */
  env.set("PUBLIC_SITE_URL", APP_URL);
  /* adapter-node's own view of the origin. The dev server derives it correctly,
     but a production build started from this file needs it for the same-origin
     session bridge. */
  env.set("ORIGIN", APP_URL);
  const kinde = stack.get("AUTH_MODE") === "kinde";
  env.set("PUBLIC_AUTH_PROVIDER", kinde ? "kinde" : "local");
  for (const key of KINDE_APP_KEYS) {
    if (kinde) {
      const value = stack.get(key);
      if (value) env.set(key, value);
      else env.delete(key);
    } else {
      env.delete(key);
    }
  }
  const header = [
    "# Written by `npm run dev:stack` in platform/. Gitignored.",
    "# PUBLIC_API_URL is the browser's route to the gateway; GATEWAY_URL is this",
    "# server's route to the same gateway. They are the same address in a local",
    "# run because there is no container boundary in between.",
    "# PUBLIC_SITE_URL is the origin this site is served from. The auth service",
    "# builds the links in its mail against the same value.",
    "# ORIGIN is the same origin as adapter-node sees it, for same-origin checks.",
    "# PUBLIC_AUTH_PROVIDER and the KINDE_* values mirror the platform's",
    "# AUTH_MODE, so the door the site draws is the door the gateway verifies.",
  ].join("\n");
  await writeFile(APP_ENV_FILE, renderEnvFile([...env], header), "utf8");
}

/* ---------- the database ---------- */

async function startDatabase(name, port) {
  const dataDir = join(DATA_DIR, name);
  await mkdir(dataDir, { recursive: true });
  const db = await PGlite.create({ dataDir });
  const server = new PGLiteSocketServer({
    db,
    port,
    host: "127.0.0.1",
    /* Every service opens a pool of ten connections, and the pool is what
       asks for them, so the server has to allow more than one. Queries are
       serialized inside the instance, which is slower than a real Postgres
       and perfectly correct for a local stack. */
    maxConnections: 16,
  });
  await server.start();
  return { name, port, db, server, dataDir };
}

/** Wait until the database answers, or say plainly that it did not. */
async function waitForDatabase(entry, timeoutMs = 30_000) {
  const pool = new Pool({
    connectionString: `postgres://nexora:nexora@127.0.0.1:${entry.port}/${entry.name}`,
    max: 1,
  });
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  try {
    while (Date.now() < deadline) {
      try {
        const res = await pool.query("SELECT 1 AS ok");
        if (res.rows[0]?.ok === 1) return;
      } catch (err) {
        lastError = err;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    await pool.end();
  }
  throw new Error(`the ${entry.name} database did not answer within ${timeoutMs}ms: ${lastError?.message ?? "no reply"}`);
}

/* ---------- the services ---------- */

const SERVICES = [
  { name: "auth", port: PORTS.auth, dir: "auth", needsDatabase: "authdb" },
  { name: "curriculum", port: PORTS.curriculum, dir: "curriculum" },
  { name: "execution", port: PORTS.execution, dir: "execution" },
  { name: "billing", port: PORTS.billing, dir: "billing", needsDatabase: "billingdb" },
  { name: "gateway", port: PORTS.gateway, dir: "gateway" },
];

function serviceEnv(env, service) {
  const child = { ...process.env, ...Object.fromEntries(env) };
  child.PORT = String(service.port);
  if (service.needsDatabase) {
    child.DATABASE_URL = env.get(
      service.needsDatabase === "authdb" ? "AUTH_DATABASE_URL" : "BILLING_DATABASE_URL"
    );
  }
  return child;
}

function startService(service, env) {
  const entry = join(ROOT, "services", service.dir, "dist", "index.js");
  if (!existsSync(entry)) {
    throw new Error(`${service.name} is not built: ${entry} does not exist. Run: npm run build`);
  }
  const child = spawn(process.execPath, [join(ROOT, "scripts", "run-service.mjs"), entry], {
    cwd: ROOT,
    env: serviceEnv(env, service),
    /* stdin is a pipe, and it is the backstop: when this process goes away the
       pipe closes and the service exits with it (see scripts/run-service.mjs). */
    stdio: ["pipe", "inherit", "inherit"],
  });
  return { service, child };
}

async function waitForHealth(started, timeoutMs = 60_000) {
  const { service, child } = started;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${service.name} exited with code ${child.exitCode} before it became healthy`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${service.port}/health/live`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `${service.name} did not become healthy within ${timeoutMs}ms: ${lastError?.message ?? "no reply"}`
  );
}

/* ---------- the build ---------- */

/**
 * Whether a workspace's build is older than its sources.
 *
 * The services are run from their build, not from TypeScript, so a stale
 * build is a stack that serves yesterday's code. Comparing the newest source
 * file with the built entry point is enough to notice, and it saves a
 * rebuild on every run.
 */
function buildIsStale(workspace) {
  const distEntry = join(ROOT, workspace, "dist", "index.js");
  if (!existsSync(distEntry)) return true;
  const srcDir = join(ROOT, workspace, "src");
  if (!existsSync(srcDir)) return false;
  return newestMtime(srcDir) > statOf(distEntry);
}

function statOf(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSyncSafe(dir)) {
    const full = join(dir, entry);
    if (isDirectory(full)) newest = Math.max(newest, newestMtime(full));
    else newest = Math.max(newest, statOf(full));
  }
  return newest;
}

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/* The workspaces, in the order they depend on each other: the contracts are
   the vocabulary, the service kit is the chassis, and the services are what
   is run. */
const WORKSPACES = [
  "packages/contracts",
  "packages/service-kit",
  ...SERVICES.map((s) => `services/${s.dir}`),
];

function tsc(workspace) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", join(ROOT, workspace, "tsconfig.json")],
      { cwd: ROOT, stdio: "inherit" }
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`the build of ${workspace} failed with code ${code}`))
    );
  });
}

async function runBuild() {
  for (const workspace of WORKSPACES) await tsc(workspace);
}

/* ---------- the stack ---------- */

function parseArgs(argv) {
  const parsed = { withFrontend: false, resetDb: false, build: true, help: false };
  for (const arg of argv) {
    if (arg === "--with-frontend") parsed.withFrontend = true;
    else if (arg === "--reset-db") parsed.resetDb = true;
    else if (arg === "--no-build") parsed.build = false;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`unknown flag "${arg}"`);
  }
  return parsed;
}

const USAGE = `usage: dev:stack [--with-frontend] [--reset-db] [--no-build]

  --with-frontend  also start the SvelteKit app in ../nexora-svelte
  --reset-db       drop the local databases and start from nothing
  --no-build       do not build the services, even if they look stale
`;

const children = [];
const databases = [];
let shuttingDown = false;

async function shutdown(code) {
  /* Set first: the children are about to exit, and their exit handlers must
     not each decide that the stack has failed and start another shutdown. */
  shuttingDown = true;
  for (const { child } of children) {
    /* Closing stdin is the polite signal: the service wrapper sees the end of
       the pipe and exits. */
    try {
      child.stdin?.end();
    } catch {
      /* a service that has already gone needs no goodbye */
    }
  }
  for (const { child } of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  await new Promise((r) => setTimeout(r, 500));
  for (const { child } of children) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  for (const entry of databases) {
    try {
      await entry.server.stop();
      await entry.db.close();
    } catch {
      /* a database that will not close politely must not stop the exit */
    }
  }
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (args.resetDb) {
    await rm(DATA_DIR, { recursive: true, force: true });
    process.stdout.write("local databases dropped\n");
  }

  const env = await writeStackEnv();
  await writeAppEnv(env);
  process.stdout.write(
    `wrote ${ENV_FILE} and ${APP_ENV_FILE} (both gitignored; the two secrets are generated)\n`
  );

  for (const [name, port] of Object.entries(DB_PORTS)) {
    const entry = await startDatabase(name, port);
    databases.push(entry);
    await waitForDatabase(entry);
    process.stdout.write(`database ${name} listening on 127.0.0.1:${port}\n`);
  }

  if (args.build) {
    const stale = WORKSPACES.filter((w) => buildIsStale(w));
    if (stale.length > 0) {
      process.stdout.write(`building ${stale.join(", ")}\n`);
      await runBuild();
    }
  }

  for (const service of SERVICES) {
    const started = startService(service, env);
    children.push(started);
    started.child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      process.stderr.write(`\n${service.name} exited (code ${code}, signal ${signal}) - stopping the stack\n`);
      void shutdown(1);
    });
  }

  for (const service of SERVICES) {
    await waitForHealth(children.find((c) => c.service.name === service.name));
    process.stdout.write(`${service.name} healthy on http://127.0.0.1:${service.port}\n`);
  }

  const app = APP;
  if (args.withFrontend) {
    if (!existsSync(join(app, "node_modules"))) {
      process.stdout.write("the learner app has no node_modules - run `npm ci` in nexora-svelte first\n");
    } else {
      /* npm is started through its own cli script, not through npm.cmd: on
         Windows a .cmd cannot be spawned without a shell, and a shell would
         need its own quoting rules. npm_execpath is the cli script npm itself
         is running, so this is the same npm. */
      const npmCli = process.env.npm_execpath;
      const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
      const npmArgs = npmCli ? [npmCli] : [];
      let child = null;
      try {
        child = spawn(command, [...npmArgs, "run", "dev", "--", "--port", "5173", "--strictPort"], {
          cwd: app,
          stdio: ["ignore", "inherit", "inherit"],
          env: { ...process.env },
        });
      } catch (err) {
        process.stdout.write(
          `the learner app could not be started (${err instanceof Error ? err.message : String(err)}) - ` +
            "start it by hand with: cd nexora-svelte && npm run dev\n"
        );
      }
      if (child) {
        children.push({ service: { name: "frontend" }, child });
        child.on("exit", (code, signal) => {
          if (shuttingDown) return;
          process.stderr.write(`\nfrontend exited (code ${code}, signal ${signal}) - stopping the stack\n`);
          void shutdown(1);
        });
        process.stdout.write(
          `frontend starting on ${APP_URL} (it must be this origin: the gateway answers CORS for it and nothing else)\n`
        );
      }
    }
  }

  process.stdout.write(
    [
      "",
      "The platform is up.",
      "",
      `  gateway      ${GATEWAY_URL}          the only public surface`,
      `  auth         http://127.0.0.1:${PORTS.auth}`,
      `  curriculum   http://127.0.0.1:${PORTS.curriculum}`,
      `  execution    http://127.0.0.1:${PORTS.execution}`,
      `  billing      http://127.0.0.1:${PORTS.billing}`,
      `  authdb       postgres://nexora:nexora@127.0.0.1:${DB_PORTS.authdb}/authdb`,
      `  billingdb    postgres://nexora:nexora@127.0.0.1:${DB_PORTS.billingdb}/billingdb`,
      "",
      `  learner app  cd nexora-svelte && npm run dev   ->  ${FRONTEND_URL}`,
      "               (its .env now points at the gateway; /auth draws the door",
      "                this stack verifies, local password or Kinde)",
      "",
      "  Ctrl-C stops everything.",
      "",
    ].join("\n")
  );
}

process.on("SIGINT", () => {
  shuttingDown = true;
  process.stdout.write("\nstopping the stack\n");
  void shutdown(0);
});
process.on("SIGTERM", () => {
  shuttingDown = true;
  void shutdown(0);
});

await main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  await shutdown(1);
});
