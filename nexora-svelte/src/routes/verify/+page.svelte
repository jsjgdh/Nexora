<script lang="ts">
  import { env } from "$env/dynamic/public";
  import Button from "$lib/components/Button.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import SectionHead from "$lib/components/SectionHead.svelte";
  import { pageTitle } from "$lib/seo";

  /* Public receipt check: a third party with a receipt pastes it and gets an
     answer two ways. First, this page re-derives the Ed25519 signature locally
     against the platform's published key, with no account and no request that
     could mint. Second, the platform's own /verify answer, as corroboration
     and as the path for receipts that predate the published key. Either half
     alone is stated as such; neither borrows the other's authority. */

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
      ...(receipt.facts.userId === undefined ? {} : { userId: receipt.facts.userId }),
      kind: "design",
      issuedAt: receipt.issuedAt,
      challengeId: receipt.facts.challengeId,
      graphSha256: receipt.facts.graphSha256,
      checks: receipt.facts.checks.map((c: any) => [c.checkId, c.passed, c.reason]),
      runner: receipt.facts.runner,
    });
  }

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
        throw new Error("That is not valid JSON. Paste the full receipt object.");
      }
      if (!BASE) throw new Error("Verification needs a running platform (PUBLIC_API_URL is not set).");
      const localValid = await verifyLocally(receipt);
      local =
        localValid === null
          ? {
              valid: null,
              note: "No local check: this receipt predates the published key, or this browser cannot verify Ed25519. The platform answer below stands alone.",
            }
          : localValid
            ? {
                valid: true,
                note: "Verified in this browser against the platform's published key. No platform answer was taken on trust.",
              }
            : {
                valid: false,
                note: "The local signature check failed. This receipt was not signed by the published key.",
              };
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
  description="Paste a NEXORA receipt, a code run or a design verdict, and the platform answers whether it issued it."
  path="/verify"
/>

<section class="verify-hero">
  <div class="container-page">
    <h1 class="display verify-title">Check the receipt<br />without trusting us.</h1>
    <p class="verify-lede">
      A receipt proves the platform ran a program or re-judged a design, not that a learner claims
      it did. This page checks its signature in your own browser, against the platform's published
      key, and the platform answers too. Neither half borrows the other's authority.
    </p>
  </div>
</section>

<section class="section-pad">
  <div class="container-page verify-grid">
    <form class="verify-form card" onsubmit={(event) => { event.preventDefault(); verify(); }}>
      <div class="form-head">
        <div>
          <p class="stamp form-label">Receipt JSON</p>
          <h2 class="form-title">Paste the whole object.</h2>
        </div>
        <span class="tag">No account</span>
      </div>

      <label for="receipt" class="sr-only">Receipt JSON</label>
      <textarea
        id="receipt"
        bind:value={raw}
        placeholder="Paste the full receipt object here"
        spellcheck="false"
        autocomplete="off"
        class="receipt-input nice-scroll"
      ></textarea>

      <div class="form-actions">
        <Button type="submit" busy={busy} disabled={raw.trim().length === 0}>
          {busy ? "Checking" : "Verify receipt"}
        </Button>
        <p class="form-note num">Nothing is uploaded until you press it.</p>
      </div>

      {#if error}
        <p class="message message-fail" role="alert">
          <span class="message-title">Could not check this receipt.</span>
          <span>{error}</span>
        </p>
      {/if}

      {#if local}
        <div class="message" data-state={local.valid === true ? "pass" : local.valid === false ? "fail" : "neutral"} role="status">
          {#if local.valid === true}
            <p class="message-title">Offline check passed. Signed by the published key.</p>
          {:else if local.valid === false}
            <p class="message-title">Offline check failed.</p>
          {:else}
            <p class="message-title">No offline check.</p>
          {/if}
          <p class="message-body">{local.note}</p>
        </div>
      {/if}

      {#if result}
        <div class="message" data-state={result.valid ? "pass" : "fail"} role="status">
          {#if result.valid}
            <p class="message-title">Valid. Issued by this platform.</p>
            <dl class="result-rows num">
              <div><dt>Issued</dt><dd>{result.issuedAt}</dd></div>
              {#if result.kind === "design"}
                <div><dt>Challenge</dt><dd>{result.challengeId}</dd></div>
                <div><dt>Graph</dt><dd>{result.graphSha256?.slice(0, 16)}…</dd></div>
              {/if}
              {#if result.language}<div><dt>Language</dt><dd>{result.language}</dd></div>{/if}
              {#if result.exitCode !== undefined}<div><dt>Exit code</dt><dd>{result.exitCode}</dd></div>{/if}
              {#if result.runner}<div><dt>Runner</dt><dd>{result.runner}</dd></div>{/if}
              <div><dt>Freshness</dt><dd>{result.fresh ? "within 30 minutes" : "older than 30 minutes"}</dd></div>
            </dl>
            {#if result.kind === "design" && result.checks}
              <ul class="result-checks">
                {#each result.checks as c}
                  <li data-pass={c.passed ? "true" : "false"}>
                    <span class="num">{c.passed ? "pass" : "fail"}</span>
                    {c.checkId}
                  </li>
                {/each}
              </ul>
            {/if}
          {:else}
            <p class="message-title">Not valid.</p>
          {/if}
          {#if result.reason}<p class="message-body">{result.reason}</p>{/if}
          {#if result.verifiedBy}
            <p class="message-fine">
              Platform verification: {result.verifiedBy === "ed25519" ? "Ed25519 signature" : "HMAC signature"}{result.offlineVerifiable
                ? ", also re-derivable offline"
                : ""}.
            </p>
          {/if}
        </div>
      {/if}
    </form>

    <aside class="verify-notes">
      <div class="note-card card">
        <p class="stamp note-label">What this checks</p>
        <ul>
          <li>
            <h3>The signature</h3>
            <p>Ed25519 over the exact bytes the platform signed, derived here from the published key.</p>
          </li>
          <li>
            <h3>The file hash</h3>
            <p>A code receipt is bound to the sha256 of the file it judged, so a receipt cannot be re-pointed at other work. A design receipt is bound the same way to the graph it judged.</p>
          </li>
          <li>
            <h3>Freshness</h3>
            <p>Whether the run is recent enough to mean what it says, stated rather than assumed.</p>
          </li>
        </ul>
      </div>

      <div class="note-card card">
        <p class="stamp note-label">What it cannot tell you</p>
        <p class="note-body">
          Whether the work is good, or whose hands wrote it. A code receipt is evidence that a
          program ran and what it printed. A design receipt is evidence that the platform
          re-derived the structural checks over a graph, nothing more, and we do not imply more.
        </p>
      </div>
    </aside>
  </div>
</section>

<section class="verify-close">
  <div class="container-page">
    <SectionHead
      title="A verdict you cannot re-derive is a badge."
      caption="This page takes no account and writes nothing. If the signature fails, it says so, and if the platform is unreachable, it says that instead of guessing."
      wide
    />
  </div>
</section>

<style>
  .verify-hero {
    padding-block: clamp(3.5rem, 7vw, 6rem) clamp(2.5rem, 5vw, 4rem);
    border-bottom: 1px solid var(--color-rule);
    background:
      radial-gradient(50% 70% at 12% 15%, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent 65%);
  }

  .verify-title {
    margin-top: var(--space-5);
    font-size: var(--text-page);
    line-height: 0.95;
    letter-spacing: -0.055em;
  }

  .verify-lede {
    margin-top: var(--space-5);
    max-width: 56ch;
    font-size: clamp(1.05rem, 1.7vw, 1.25rem);
    line-height: 1.6;
    color: var(--color-muted);
  }

  .verify-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5);
    align-items: start;
  }

  @media (min-width: 980px) {
    .verify-grid {
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr);
      gap: var(--space-6);
    }
  }

  .verify-form {
    padding: var(--space-5);
  }

  @media (min-width: 640px) {
    .verify-form {
      padding: var(--space-6);
    }
  }

  .form-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .form-label {
    color: var(--color-faint);
  }

  .form-title {
    margin-top: var(--space-2);
    font-family: var(--font-display);
    font-size: 1.35rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--color-ink);
  }

  .receipt-input {
    display: block;
    width: 100%;
    height: 16rem;
    margin-top: var(--space-5);
    padding: var(--space-4);
    resize: vertical;
    border: 1px solid var(--color-control);
    border-radius: var(--radius-sm);
    background: var(--color-raised);
    color: var(--color-ink);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.65;
    caret-color: var(--color-accent);
  }

  .receipt-input::placeholder {
    color: var(--color-faint);
  }

  .receipt-input:focus {
    border-color: var(--color-accent);
  }

  .form-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  .form-note {
    font-size: 9.5px;
    color: var(--color-faint);
  }

  .message {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-4);
    padding: var(--space-4);
    border: 1px solid var(--color-rule-strong);
    border-radius: var(--radius-sm);
    background: var(--color-ground);
  }

  .message[data-state="pass"] {
    border-color: color-mix(in srgb, var(--color-pass) 45%, var(--color-rule));
    background: color-mix(in srgb, var(--color-pass) 6%, var(--color-panel));
  }

  .message[data-state="fail"],
  .message-fail {
    border-color: color-mix(in srgb, var(--color-fail) 45%, var(--color-rule));
    background: color-mix(in srgb, var(--color-fail) 5%, var(--color-panel));
  }

  .message-title {
    font-family: var(--font-display);
    font-size: 0.98rem;
    font-weight: 600;
    color: var(--color-ink);
  }

  .message[data-state="pass"] .message-title {
    color: var(--color-pass);
  }

  .message[data-state="fail"] .message-title,
  .message-fail .message-title {
    color: var(--color-fail);
  }

  .message-body {
    max-width: 62ch;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .message-fine {
    font-family: var(--font-mono);
    font-size: 9.5px;
    line-height: 1.6;
    color: var(--color-faint);
  }

  .result-rows {
    display: grid;
    gap: 0.25rem;
    font-size: 10.5px;
  }

  .result-rows div {
    display: grid;
    grid-template-columns: 6rem minmax(0, 1fr);
    gap: var(--space-2);
  }

  .result-rows dt {
    color: var(--color-faint);
  }

  .result-rows dd {
    margin: 0;
    color: var(--color-ink);
    overflow-wrap: anywhere;
  }

  .result-checks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.2rem;
  }

  .result-checks li {
    display: flex;
    gap: 0.5rem;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--color-pass);
  }

  .result-checks li[data-pass="false"] {
    color: var(--color-fail);
  }

  .verify-notes {
    display: grid;
    gap: var(--space-4);
  }

  .note-card {
    padding: var(--space-5);
  }

  .note-label {
    color: var(--color-faint);
  }

  .note-card ul {
    list-style: none;
    margin: var(--space-4) 0 0;
    padding: 0;
    border-top: 1px solid var(--color-rule);
  }

  .note-card li {
    padding-block: var(--space-3);
    border-bottom: 1px solid var(--color-rule);
  }

  .note-card h3 {
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-ink);
  }

  .note-card p {
    margin-top: var(--space-1);
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--color-muted);
  }

  /* The paragraph rule above is `.note-card p`, an element on top of a class,
     so a bare `.note-body` loses to it on specificity. Raising this selector
     by one class is the fix; `!important` would be the wrong tool, because
     the next person to add a paragraph here would have to reach for it too. */
  .note-card .note-body {
    margin-top: var(--space-3);
  }

  .verify-close {
    padding-block: clamp(4rem, 7vw, 6rem);
    background: var(--color-raised);
    border-top: 1px solid var(--color-rule);
  }
</style>
