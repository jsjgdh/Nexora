"use client";

import React, { useState } from "react";
import type { WebContainer } from "@webcontainer/api";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/format";

/* Prototype lab: WebContainer spike for Stage 6 / P1 planning.
   Unlisted route (no nav link): /lab/containers
   - Boots a real in-browser Node runtime, mounts files, runs a server,
     and shows the preview URL — the shape Stage 6 backend missions need.
   - Prototype/POC use needs no commercial license; for-profit production
     use does (webcontainers.io/enterprise). This page is the former.
   - Requires network (StackBlitz CDN + proxies) and a Chromium browser;
     failures are reported with causes, never silently. */

const SERVER_JS = `import http from 'node:http';
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<h1>Hello from inside a WebContainer</h1><p>Served by Node ' + process.version + ', running in your browser tab.</p>');
});
server.listen(3111, () => console.log('ready'));
`;

interface LogLine {
  kind: "info" | "ok" | "err" | "out";
  text: string;
}

export default function ContainersLabPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [phase, setPhase] = useState<"idle" | "working" | "ready" | "failed">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [evalOut, setEvalOut] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [diag] = useState(() =>
    typeof window === "undefined"
      ? null
      : {
          isolated: window.crossOriginIsolated,
          sab: typeof SharedArrayBuffer !== "undefined",
          chromium: /Chrome|Chromium|Edg/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent),
          online: navigator.onLine,
          ua: navigator.userAgent,
        }
  );

  const log = (kind: LogLine["kind"], text: string) =>
    setLines((prev) => [...prev.slice(-80), { kind, text }]);

  const boot = async () => {
    if (phase === "working" || phase === "ready") return;
    setPhase("working");
    setPreviewUrl(null);
    setEvalOut(null);
    setLines([]);
    try {
      log("info", "Importing @webcontainer/api…");
      const { WebContainer } = await import("@webcontainer/api");
      log("info", "Booting container (expensive, one at a time)…");
      const wc: WebContainer = await WebContainer.boot({ coep: "credentialless" });
      wc.on("server-ready", (_port, url) => {
        log("ok", `Server ready → ${url}`);
        setPreviewUrl(url);
        setPhase("ready");
      });
      wc.on("error", (e) => log("err", `Container error: ${e.message}`));

      log("info", "Mounting project files…");
      await wc.mount({ "server.js": { file: { contents: SERVER_JS } } });
      const root = await wc.fs.readdir("/");
      setFiles(root);
      log("ok", `Filesystem live: / contains ${root.join(", ") || "(empty)"}`);

      log("info", "Evaluating node -e (pure compute, no server)…");
      const evalProc = await wc.spawn("node", [
        "-e",
        "const xs=[1,2,3,4]; console.log(JSON.stringify({sum: xs.reduce((a,b)=>a+b,0), node: process.version}))",
      ]);
      let out = "";
      evalProc.output.pipeTo(
        new WritableStream({ write: (d) => { out += d; } })
      );
      const evalCode = await evalProc.exit;
      log(evalCode === 0 ? "ok" : "err", `node -e exited ${evalCode}: ${out.trim()}`);
      setEvalOut(out.trim());

      log("info", "Starting node server.js (preview URL arrives via server-ready)…");
      const srv = await wc.spawn("node", ["server.js"]);
      srv.output.pipeTo(new WritableStream({ write: (d) => log("out", String(d).trim()) }));
      // server-ready event flips phase to ready; no await on srv.exit (long-lived).
    } catch (e: any) {
      setPhase("failed");
      log("err", `Boot failed: ${e?.message ?? String(e)}`);
      log("err", likelyCause(e));
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <p className="text-xs font-bold tracking-widest text-mint uppercase">Lab · prototype</p>
      <h1 className="mt-1 text-2xl font-bold sm:text-3xl">WebContainer spike</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Evaluates in-browser Node for future backend missions. Boots on click only — booting is
        expensive and a single instance runs at a time. Needs network (StackBlitz CDN) and works
        best in Chromium.
      </p>

      <Card className="mt-4 p-4">
        <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Environment</h2>
        {!diag ? (
          <p className="mt-1 text-sm text-muted">Loading…</p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
            <DiagRow ok={diag.isolated} label="crossOriginIsolated" hint="COOP/COEP headers active" />
            <DiagRow ok={diag.sab} label="SharedArrayBuffer" hint="threading primitive present" />
            <DiagRow ok={diag.chromium} label="Chromium engine" hint="best-supported runtime" />
            <DiagRow ok={diag.online} label="Network online" hint="CDN + proxies required" />
          </ul>
        )}
        <p className="mt-2 break-all font-mono text-[11px] text-muted/70">{diag?.ua}</p>
      </Card>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={boot} disabled={phase === "working" || phase === "ready"}>
          {phase === "idle" && "Boot container"}
          {phase === "working" && "Booting…"}
          {phase === "ready" && "Container running"}
          {phase === "failed" && "Retry boot"}
        </Button>
        {phase === "ready" && (
          <span className="inline-flex items-center rounded-lg border border-success/50 px-3 py-2 text-sm font-semibold text-success" role="status">
            Live
          </span>
        )}
      </div>

      {lines.length > 0 && (
        <Card className="mt-3 p-4">
          <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Log</h2>
          <ol className="nice-scroll mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed" aria-live="polite">
            {lines.map((l, i) => (
              <li
                key={i}
                className={cn(
                  l.kind === "err" && "text-error",
                  l.kind === "ok" && "text-success",
                  l.kind === "out" && "text-muted",
                  l.kind === "info" && "text-ink"
                )}
              >
                {l.text}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {(evalOut || files.length > 0) && (
        <Card className="mt-3 p-4 text-sm">
          <h2 className="text-sm font-bold tracking-wider text-muted uppercase">Evidence</h2>
          {evalOut && (
            <p className="mt-2 font-mono text-[13px]">
              <span className="text-muted">node -e → </span>
              {evalOut}
            </p>
          )}
          {files.length > 0 && (
            <p className="mt-1 font-mono text-[13px]">
              <span className="text-muted">readdir / → </span>
              {files.join(", ")}
            </p>
          )}
        </Card>
      )}

      {previewUrl && (
        <Card className="mt-3 overflow-hidden">
          <p className="border-b border-line px-4 py-2 font-mono text-xs text-muted">
            Preview · {previewUrl}
          </p>
          <iframe title="WebContainer server preview" src={previewUrl} className="h-64 w-full bg-white" />
        </Card>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Prototype use only — no commercial license needed for this evaluation. For-profit
        production use of the WebContainer API requires a license (see webcontainers.io/enterprise),
        and the runtime depends on StackBlitz hosted infrastructure.
      </p>
    </div>
  );
}

function DiagRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-line bg-[#0c1218] px-2.5 py-1.5">
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
          ok ? "bg-success/15 text-success" : "bg-error/15 text-error"
        )}
      >
        {ok ? "✓" : "✗"}
      </span>
      <span>
        <span className="block font-mono text-xs font-semibold">{label}: {ok ? "yes" : "no"}</span>
        <span className="block text-[11px] text-muted">{hint}</span>
      </span>
    </li>
  );
}

function likelyCause(e: any): string {
  const msg = String(e?.message ?? e);
  if (/SharedArrayBuffer|isolat/i.test(msg))
    return "Cause: page is not cross-origin isolated — check COOP/COEP headers and hard-reload.";
  if (/network|fetch|load/i.test(msg))
    return "Cause: likely network or content-blocker — the runtime loads from the StackBlitz CDN and needs its proxies reachable. Try disabling cookie/ad blockers.";
  if (/browser|support/i.test(msg))
    return "Cause: likely browser support — use a recent Chromium-based browser.";
  return "Cause unknown — see the log line above and webcontainers.io troubleshooting.";
}
