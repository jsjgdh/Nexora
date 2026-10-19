<script lang="ts">
  import { env } from "$env/dynamic/public";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* Public receipt check: a third party with a receipt pastes it and gets
     an answer two ways. First, this page re-derives the Ed25519 signature
     locally against the platform's published key — no account, no request
     that could mint, and nothing the platform says taken on trust. Second,
     the platform's own /verify answer, as corroboration and as the path for
     receipts that predate the published key. Either half alone is stated as
     such; neither borrows the other's authority. */

  const BASE = ((env.PUBLIC_API_URL as string | undefined) ?? "").replace(/\/$/, "");

  let raw = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);
  let result = $state<null | {
    valid: boolean;
    fresh: boolean;
    kind?: string;
    issuedAt?: string;
    language?: string;
    exitCode?: number | null;
    runner?: string;
    challengeId?: string;
    graphSha256?: string;
    checks?: { checkId: string; passed: boolean; reason: string }[];
    reason?: string;
    verifiedBy?: string;
    offlineVerifiable?: boolean;
  }>(null);
  let local = $state<null | { valid: boolean | null; note: string }>(null);

  /* The exact bytes the platform signed for a code run (mirrors contracts runReceiptPayload).
     The order of these keys is the contract: the platform signs this exact
     serialisation, so a field added, dropped or reordered on either side
     silently breaks every local verification while the server answer keeps
     working. `scripts/verify.ts` asserts the two orders are equal. */
  function payloadOfRun(receipt: any): string {
    return JSON.stringify({
      v: 1,
      // Identity first when bound, omitted entirely when not — old receipts
      // verify on their original bytes. The spread names no key of its own,
      // so the order gate below keeps reading the static keys.
      ...(receipt.facts.userId === undefined ? {} : { userId: receipt.facts.userId }),
      issuedAt: receipt.issuedAt,
      language: receipt.facts.language,
      command: receipt.facts.command,
      files: receipt.facts.files.map((f: any) => [f.path, f.sha256]),
      stdout: receipt.facts.stdout,
      stderr: receipt.facts.stderr,
      exitCode: receipt.facts.exitCode,
      timedOut: receipt.facts.timedOut,
      truncated: receipt.facts.truncated,
      durationMs: receipt.facts.durationMs,
      phase: receipt.facts.phase,
      diagnostics: receipt.facts.diagnostics.map((d: any) => [d.kind, d.file, d.line, d.column, d.message]),
      runner: receipt.facts.runner,
    });
  }

  /* The exact bytes the platform signed for a design verdict (mirrors contracts
     designReceiptPayload). Same order-is-the-contract rule as above. */
  function payloadOfDesign(receipt: any): string {
    return JSON.stringify({
      v: 1,
      // Identity first when bound, omitted entirely when not — old receipts
      // verify on their original bytes. The spread names no key of its own,
      // so the order gate below keeps reading the static keys.
      ...(receipt.facts.userId === undefined ? {} : { userId: receipt.facts.userId }),
      kind: "design",
      issuedAt: receipt.issuedAt,
      challengeId: receipt.facts.challengeId,
      graphSha256: receipt.facts.graphSha256,
      checks: receipt.facts.checks.map((c: any) => [c.checkId, c.passed, c.reason]),
      runner: receipt.facts.runner,
    });
  }

  /* A receipt is either a code run or a design verdict — the signed bytes
     differ, so the kind picks the builder. */
  function payloadOf(receipt: any): string {
    return receipt?.facts?.kind === "design" ? payloadOfDesign(receipt) : payloadOfRun(receipt);
  }

  function b64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function pemToBytes(pem: string): Uint8Array {
    const body = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
    return b64ToBytes(body);
  }

  /** Re-derive the Ed25519 signature locally. Null means "could not check locally". */
  async function verifyLocally(receipt: any): Promise<boolean | null> {
    try {
      if (!receipt?.sigEd || typeof receipt.sigEd !== "string") return null;
      if (!BASE) return null;
      if (!globalThis.crypto?.subtle) return null;
      const keyRes = await fetch(`${BASE}/api/execute/verify-key`);
      if (!keyRes.ok) return null;
      const { algorithm, publicKey } = await keyRes.json();
      if (algorithm !== "Ed25519" || typeof publicKey !== "string") return null;
      const key = await crypto.subtle.importKey(
        "spki",
        pemToBytes(publicKey).buffer as ArrayBuffer,
        { name: "Ed25519" },
        false,
        ["verify"]
      );
      return await crypto.subtle.verify(
        "Ed25519",
        key,
        b64ToBytes(receipt.sigEd).buffer as ArrayBuffer,
        new TextEncoder().encode(payloadOf(receipt))
      );
    } catch {
      return null;
    }
  }

  async function verify() {
    busy = true;
    error = null;
    result = null;
    local = null;
    try {
      let receipt: unknown;
      try {
        receipt = JSON.parse(raw);
      } catch {
        throw new Error("That is not valid JSON — paste the full receipt object.");
      }
      if (!BASE) throw new Error("Verification needs a running platform (PUBLIC_API_URL is not set).");
      // Local first: the stranger's own derivation, independent of the platform.
      const localValid = await verifyLocally(receipt);
      local =
        localValid === null
          ? {
              valid: null,
              note: "No local check: this receipt predates the published key, or this browser cannot verify Ed25519 — the platform answer below stands alone.",
            }
          : localValid
            ? {
                valid: true,
                note: "Verified in this browser against the platform's published key — no platform answer taken on trust.",
              }
            : { valid: false, note: "The local signature check failed — this receipt was not signed by the published key." };
      const res = await fetch(`${BASE}/api/execute/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt }),
      });
      const data = (await res.json().catch(() => null)) as (typeof result & { message?: string }) | null;
      if (!res.ok)
        throw new Error(
          (data as { message?: string } | null)?.message ?? `Verification refused (HTTP ${res.status}).`
        );
      result = data as typeof result;
    } catch (e) {
      error = e instanceof Error ? e.message : "Verification failed.";
    } finally {
      busy = false;
    }
  }
</script>

<PageHead
  title={pageTitle("Verify a receipt")}
  description="Paste a NEXORA receipt (a code run or a design verdict) and the platform answers whether it issued it."
  path="/verify"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["Check the receipt", "without trusting us."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="mt-7 max-w-[56ch] font-serif text-[clamp(1.05rem,2vw,1.45rem)] leading-snug text-muted">
    A receipt proves the platform ran a program or re-judged a design, not that a learner claims it did. This page checks
    its signature in your own browser, against the platform's published key, and the platform
    answers too. Neither half borrows the other's authority.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <div class="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
    <Plate crosshair>
      <label for="receipt" class="stamp block text-faint">receipt json</label>
      <textarea
        id="receipt"
        bind:value={raw}
        placeholder="Paste the full receipt object here"
        class="nice-scroll mt-3 h-64 w-full resize-y border border-control bg-raised p-4 font-mono text-[12.5px] leading-relaxed text-ink placeholder:text-faint"
      ></textarea>

      <div class="mt-5 flex flex-wrap items-center gap-3">
        <Button onclick={verify} busy={busy} disabled={raw.trim().length === 0}>
          {busy ? "Checking…" : "Verify receipt"}
        </Button>
        <p class="stamp text-[11px] text-faint">
          nothing is uploaded until you press it
        </p>
      </div>

      {#if error}
        <p class="mt-5 border-l border-removed pl-4 text-[13.5px] leading-relaxed text-ink" role="alert">
          {error}
        </p>
      {/if}

      {#if local}
        <div
          class="mt-5 border px-4 py-4 text-[13.5px] leading-relaxed"
          class:border-added={local.valid === true}
          class:border-removed={local.valid === false}
          class:border-rule={local.valid === null}
          role="status"
        >
          {#if local.valid === true}
            <p class="font-semibold text-added">Offline check passed. Signed by the published key.</p>
          {:else if local.valid === false}
            <p class="font-semibold text-removed">Offline check failed.</p>
          {:else}
            <p class="font-semibold text-ink">No offline check.</p>
          {/if}
          <p class="mt-2 text-muted">{local.note}</p>
        </div>
      {/if}

      {#if result}
        <div
          class="mt-4 border px-4 py-4 text-[13.5px] leading-relaxed"
          class:border-added={result.valid}
          class:border-rule={!result.valid}
          role="status"
        >
          {#if result.valid}
            <p class="font-semibold text-added">Valid. Issued by this platform.</p>
            <ul class="mt-3 grid gap-1.5 text-muted">
              <li>Issued: <span class="num text-[12.5px] text-ink">{result.issuedAt}</span></li>
              {#if result.kind === "design"}
                <li>Design challenge: <span class="num text-[12.5px] text-ink">{result.challengeId}</span></li>
                <li>Graph: <span class="num text-[12.5px] text-ink">{result.graphSha256?.slice(0, 16)}…</span></li>
              {/if}
              {#if result.language}<li>Language: {result.language}</li>{/if}
              {#if result.exitCode !== undefined}<li>Exit code: {result.exitCode}</li>{/if}
              {#if result.runner}<li>Runner: {result.runner}</li>{/if}
              <li>Freshness: {result.fresh ? "within 30 minutes" : "older than 30 minutes"}</li>
            </ul>
            {#if result.kind === "design" && result.checks}
              <ul class="mt-3 grid gap-1.5">
                {#each result.checks as c}
                  <li class="font-mono text-[12.5px] {c.passed ? 'text-added' : 'text-removed'}">
                    {c.passed ? "pass" : "fail"} · {c.checkId}
                  </li>
                {/each}
              </ul>
            {/if}          {:else}
            <p class="font-semibold text-removed">Not valid.</p>
          {/if}
          {#if result.reason}<p class="mt-3 text-muted">{result.reason}</p>{/if}
          {#if result.verifiedBy}
            <p class="mt-3 text-[12.5px] text-faint">
              Platform verification: {result.verifiedBy === "ed25519" ? "Ed25519 signature" : "HMAC signature"}{result.offlineVerifiable
                ? ", also re-derivable offline"
                : ""}.
            </p>
          {/if}
        </div>
      {/if}
    </Plate>

    <div class="grid content-start gap-6">
      <Plate>
        <p class="stamp text-[11px] text-faint">what this checks</p>
        <ul class="mt-4 grid gap-4">
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">The signature.</span> Ed25519 over the exact bytes the platform
            signed, derived here from the published key.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">The file hash.</span> A code receipt is bound to the sha256 of the file
            it judged, so a receipt cannot be re-pointed at other work. A design
            receipt is bound the same way to the graph it judged.
          </li>
          <li class="text-[13.5px] leading-relaxed text-muted">
            <span class="text-ink">Freshness.</span> Whether the run is recent enough to mean what it
            says, stated rather than assumed.
          </li>
        </ul>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">what it cannot tell you</p>
        <p class="mt-4 text-[13.5px] leading-relaxed text-muted">
          Whether the work is good, or whose hands wrote it. A code receipt is evidence that a program
          ran and what it printed; a design receipt is evidence that the platform re-derived the
          structural checks over a graph, nothing more, and we do not imply more.
        </p>
      </Plate>
    </div>
  </div>

  <div class="mt-16">
    <SectionHead
      title="A verdict you cannot re-derive is a badge."
      caption="This page takes no account and writes nothing. If the signature fails, it says so, and if the platform is unreachable, it says that instead of guessing."
    />
  </div>
</div>
