<script lang="ts">
  import Button from "./Button.svelte";

  /* The launch list.
   *
   * The desktop build is not published, so the reader who is convinced has
   * nowhere to go. This is the somewhere: one field, one message, when the
   * build is published. One address, no list to be added to, and a reply
   * removes you, because that is what the privacy notice promises.
   *
   * It appears inside the closing band on petrol as well as on paper, so it
   * takes a tone rather than assuming the page ground. */

  type Props = {
    variant?: string;
    tone?: "default" | "inverse";
  };

  let { variant, tone = "default" }: Props = $props();

  let email = $state("");
  let status = $state<"idle" | "sending" | "sent" | "error">("idle");
  let error = $state("");

  async function join(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (status === "sending") return;
    status = "sending";
    error = "";
    try {
      const response = await fetch("/api/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "launch",
          email: email.trim(),
          message: variant
            ? `Tell me when the desktop build is published. (headline: ${variant})`
            : "Tell me when the desktop build is published.",
        }),
      });
      if (!response.ok) throw new Error("not sent");
      status = "sent";
      email = "";
    } catch {
      status = "error";
      error = "That did not go through. Try again, or write to launch@nexora.dev.";
    }
  }
</script>

<form onsubmit={join} class="launch" data-launch-list data-tone={tone}>
  <label for="launch-email" class="field-label launch-label">your email</label>
  <div class="launch-row">
    <input
      id="launch-email"
      type="email"
      autocomplete="email"
      bind:value={email}
      placeholder="you@example.com"
      required
      aria-describedby="launch-note"
      class="field-input launch-input"
    />
    <Button
      type="submit"
      variant={tone === "inverse" ? "inverse" : "primary"}
      busy={status === "sending"}
      disabled={status === "sent"}
    >
      {status === "sent" ? "On the list" : "Tell me when it ships"}
    </Button>
  </div>

  <p id="launch-note" class="launch-note" aria-live="polite">
    {#if status === "sent"}
      One message, when the desktop build is published. Nothing else, and a reply to that
      message removes you.
    {:else if status === "error"}
      <span class="error">{error}</span>
    {:else}
      One message, when the desktop build is published. Nothing else, and a reply to that
      message removes you.
    {/if}
  </p>
</form>

<style>
  .launch {
    max-width: 46ch;
  }

  .launch-label {
    color: var(--color-faint);
  }

  .launch-row {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .launch-input {
    width: auto;
    min-width: 14rem;
    flex: 1 1 14rem;
  }

  .launch-note {
    margin-top: var(--space-3);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--color-faint);
  }

  .error {
    color: var(--color-fail);
  }

  [data-tone="inverse"] .launch-label {
    color: color-mix(in srgb, var(--color-on-accent) 70%, transparent);
  }

  [data-tone="inverse"] .launch-input {
    background: transparent;
    border-color: color-mix(in srgb, var(--color-on-accent) 45%, transparent);
    color: var(--color-on-accent);
  }

  [data-tone="inverse"] .launch-input::placeholder {
    color: color-mix(in srgb, var(--color-on-accent) 60%, transparent);
  }

  [data-tone="inverse"] .launch-note {
    color: color-mix(in srgb, var(--color-on-accent) 75%, transparent);
  }

  /* On the petrol band the failure ink would be the plate's own contrast
     problem; the message carries the news and the label colour stays legible. */
  [data-tone="inverse"] .error {
    color: var(--color-on-accent);
    font-weight: 600;
  }
</style>
