<script lang="ts">
  import type { WebContainer } from "@webcontainer/api";
  import Button from "$lib/components/Button.svelte";
  import { cn } from "$lib/format";
  import PageHead from "$lib/components/PageHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* Prototype lab: WebContainer spike for Stage 6 / P1 planning.
     Unlisted route (no nav link): /lab/containers */

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

  let lines = $state<LogLine[]>([]);
  let phase = $state<"idle" | "working" | "ready" | "failed">("idle");
  let previewUrl = $state<string | null>(null);
  let evalOut = $state<string | null>(null);
  let files = $state<string[]>([]);

  const diag =
    typeof window === "undefined"
      ? null
      : {
          isolated: window.crossOriginIsolated,
          sab: typeof SharedArrayBuffer !== "undefined",
          chromium:
            /Chrome|Chromium|Edg/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent),
          online: navigator.onLine,
          ua: navigator.userAgent,
        };

  function log(kind: LogLine["kind"], text: string) {
    lines = [...lines.slice(-80), { kind, text }];
  }

  async function boot() {
    if (phase === "working" || phase === "ready") return;
    phase = "working";
    previewUrl = null;
    evalOut = null;
    lines = [];
    try {
      log("info", "Importing @webcontainer/api…");
      const { WebContainer } = await import("@webcontainer/api");
      log("info", "Booting container (expensive, one at a time)…");
      const wc: WebContainer = await WebContainer.boot({ coep: "credentialless" });
      wc.on("server-ready", (_port, url) => {
        log("ok", `Server ready → ${url}`);
        previewUrl = url;
        phase = "ready";
      });
      wc.on("error", (e) => log("err", `Container error: ${e.message}`));

      log("info", "Mounting project files…");
      await wc.mount({ "server.js": { file: { contents: SERVER_JS } } });
      const root = await wc.fs.readdir("/");
      files = root;
      log("ok", `Filesystem live: / contains ${root.join(", ") || "(empty)"}`);

      log("info", "Evaluating node -e (pure compute, no server)…");
      const evalProc = await wc.spawn("node", [
        "-e",
        "const xs=[1,2,3,4]; console.log(JSON.stringify({sum: xs.reduce((a,b)=>a+b,0), node: process.version}))",
      ]);
      let out = "";
      evalProc.output.pipeTo(
        new WritableStream({
          write(d) {
            out += d;
          },
        })
      );
      const evalCode = await evalProc.exit;
      log(evalCode === 0 ? "ok" : "err", `node -e exited ${evalCode}: ${out.trim()}`);
      evalOut = out.trim();

      log("info", "Starting node server.js (preview URL arrives via server-ready)…");
      const srv = await wc.spawn("node", ["server.js"]);
      srv.output.pipeTo(
        new WritableStream({
          write(d) {
            log("out", String(d).trim());
          },
        })
      );
    } catch (e: unknown) {
      phase = "failed";
      const msg = e instanceof Error ? e.message : String(e);
      log("err", `Boot failed: ${msg}`);
      log("err", likelyCause(e));
    }
  }

  function likelyCause(e: unknown): string {
    const msg = String(e instanceof Error ? e.message : e);
    if (/SharedArrayBuffer|isolat/i.test(msg))
      return "Cause: page is not cross-origin isolated — check COOP/COEP headers and hard-reload.";
    if (/network|fetch|load/i.test(msg))
      return "Cause: likely network or content-blocker — the runtime loads from the StackBlitz CDN and needs its proxies reachable. Try disabling cookie/ad blockers.";
    if (/browser|support/i.test(msg))
      return "Cause: likely browser support — use a recent Chromium-based browser.";
    return "Cause unknown — see the log line above and webcontainers.io troubleshooting.";
  }
</script>

<!-- Unlisted and not part of the curriculum: kept out of the sitemap and marked
     noindex here, so the two agree and a crawler never indexes a prototype. -->
<PageHead
  title={pageTitle("Container lab")}
  description="An internal prototype: a Node server running inside the browser tab. Unlisted, and not part of the curriculum."
  path="/lab/containers"
  noindex
/>

<div class="mx-auto max-w-3xl px-4 py-6 sm:py-8">
  <p class="text-xs font-bold tracking-widest text-accent uppercase">Lab · prototype</p>
  <h1 class="mt-1 text-2xl font-bold sm:text-3xl">WebContainer spike</h1>
  <p class="mt-1 text-sm leading-relaxed text-muted">
    Evaluates in-browser Node for future backend missions. Boots on click only — booting is
    expensive and a single instance runs at a time. Needs network (StackBlitz CDN) and works best
    in Chromium.
  </p>

  <div class="mt-4 rounded-xl border border-rule bg-panel p-4">
    <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Environment</h2>
    {#if !diag}
      <p class="mt-1 text-sm text-muted">Loading…</p>
    {:else}
      <ul class="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
        <li class="flex items-center gap-2 rounded-lg border border-rule bg-panel px-2.5 py-1.5">
          {@render diagGlyph(diag.isolated)}
          <span>
            <span class="block font-mono text-xs font-semibold">crossOriginIsolated: {diag.isolated ? "yes" : "no"}</span>
            <span class="block text-[11px] text-muted">COOP/COEP headers active</span>
          </span>
        </li>
        <li class="flex items-center gap-2 rounded-lg border border-rule bg-panel px-2.5 py-1.5">
          {@render diagGlyph(diag.sab)}
          <span>
            <span class="block font-mono text-xs font-semibold">SharedArrayBuffer: {diag.sab ? "yes" : "no"}</span>
            <span class="block text-[11px] text-muted">threading primitive present</span>
          </span>
        </li>
        <li class="flex items-center gap-2 rounded-lg border border-rule bg-panel px-2.5 py-1.5">
          {@render diagGlyph(diag.chromium)}
          <span>
            <span class="block font-mono text-xs font-semibold">Chromium engine: {diag.chromium ? "yes" : "no"}</span>
            <span class="block text-[11px] text-muted">best-supported runtime</span>
          </span>
        </li>
        <li class="flex items-center gap-2 rounded-lg border border-rule bg-panel px-2.5 py-1.5">
          {@render diagGlyph(diag.online)}
          <span>
            <span class="block font-mono text-xs font-semibold">Network online: {diag.online ? "yes" : "no"}</span>
            <span class="block text-[11px] text-muted">CDN + proxies required</span>
          </span>
        </li>
      </ul>
      <p class="mt-2 break-all font-mono text-[11px] text-muted">{diag.ua}</p>
    {/if}
  </div>

  <div class="mt-3 flex flex-wrap gap-2">
    <Button onclick={boot} disabled={phase === "working" || phase === "ready"}>
      {#if phase === "idle"}Boot container{/if}
      {#if phase === "working"}Booting…{/if}
      {#if phase === "ready"}Container running{/if}
      {#if phase === "failed"}Retry boot{/if}
    </Button>
    {#if phase === "ready"}
      <span
        class="inline-flex items-center rounded-lg border border-added/50 px-3 py-2 text-sm font-semibold text-added"
        role="status"
      >
        Live
      </span>
    {/if}
  </div>

  {#if lines.length > 0}
    <div class="mt-3 rounded-xl border border-rule bg-panel p-4">
      <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Log</h2>
      <ol class="nice-scroll mt-2 max-h-64 space-y-1 overflow-y-auto font-mono text-xs leading-relaxed" aria-live="polite">
        {#each lines as l}
          <li
            class={cn(
              l.kind === "err" && "text-removed",
              l.kind === "ok" && "text-added",
              l.kind === "out" && "text-muted",
              l.kind === "info" && "text-ink"
            )}
          >
            {l.text}
          </li>
        {/each}
      </ol>
    </div>
  {/if}

  {#if evalOut || files.length > 0}
    <div class="mt-3 rounded-xl border border-rule bg-panel p-4 text-sm">
      <h2 class="text-sm font-bold tracking-wider text-muted uppercase">Evidence</h2>
      {#if evalOut}
        <p class="mt-2 font-mono text-[13px]">
          <span class="text-muted">node -e → </span>{evalOut}
        </p>
      {/if}
      {#if files.length > 0}
        <p class="mt-1 font-mono text-[13px]">
          <span class="text-muted">readdir / → </span>{files.join(", ")}
        </p>
      {/if}
    </div>
  {/if}

  {#if previewUrl}
    <div class="mt-3 overflow-hidden rounded-xl border border-rule bg-panel">
      <p class="border-b border-rule px-4 py-2 font-mono text-xs text-muted">Preview · {previewUrl}</p>
      <iframe title="WebContainer server preview" src={previewUrl} class="h-64 w-full bg-white"></iframe>
    </div>
  {/if}

  <p class="mt-4 text-xs leading-relaxed text-muted">
    Prototype use only — no commercial license needed for this evaluation. For-profit production use
    of the WebContainer API requires a license (see webcontainers.io/enterprise), and the runtime
    depends on StackBlitz hosted infrastructure.
  </p>
</div>

{#snippet diagGlyph(ok: boolean)}
  <span
    aria-hidden="true"
    class={cn(
      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
      ok ? "bg-added/15 text-added" : "bg-removed/15 text-removed"
    )}
  >
    {ok ? "✓" : "✗"}
  </span>
{/snippet}
