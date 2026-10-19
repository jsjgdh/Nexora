<script lang="ts">
  import Button from "./Button.svelte";

  /* The launch list.
   *
   * The desktop build is not published, so the visitor who has been convinced
   * has nowhere to go. This is the somewhere: one field, one message, when
   * the build is published.
   *
   * It is deliberately the smallest thing that can be true. One address, one
   * message, and a way out. No list to be added to, no preferences to manage
   * and nothing to read afterwards, because the privacy notice promises
   * exactly that: a promise the site breaks on its own front page is worth
   * nothing.
   *
   * The address goes to the studio's mailbox, where a person keeps it. The
   * privacy notice says so in the sentence that would otherwise claim a
   * process, because this is the one thing here that a person holds rather
   * than the platform. */

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
          message: "Tell me when the desktop build is published.",
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

<form onsubmit={join} class="max-w-[46ch]" data-launch-list>
  <label for="launch-email" class="stamp block text-faint">your email</label>
  <div class="mt-3 flex flex-wrap items-center gap-3">
    <input
      id="launch-email"
      type="email"
      autocomplete="email"
      bind:value={email}
      placeholder="you@example.com"
      required
      aria-describedby="launch-note"
      class="num min-h-[44px] w-full min-w-[16rem] flex-1 border border-control bg-raised px-3 py-2 text-[14px] text-ink placeholder:text-faint"
    />
    <Button type="submit" busy={status === "sending"} disabled={status === "sent"}>
      {status === "sent" ? "On the list" : "Tell me when it ships"}
    </Button>
  </div>

  <p id="launch-note" class="mt-3 text-[12.5px] leading-relaxed text-faint" aria-live="polite">
    {#if status === "sent"}
      One message, when the desktop build is published. Nothing else, and a reply to that
      message removes you.
    {:else if status === "error"}
      <span class="text-removed">{error}</span>
    {:else}
      One message, when the desktop build is published. Nothing else, and a reply to that
      message removes you.
    {/if}
  </p>
</form>
