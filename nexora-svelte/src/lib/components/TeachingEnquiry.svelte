<script lang="ts">
  import Button from "./Button.svelte";
  import { TEACHING_ENQUIRY } from "$lib/content/site";

  /* The teaching enquiry.
   *
   * The same shape as the hiring enquiry, and the same promises: a name, a
   * work email, and what the reader actually needs to say. Nothing else,
   * because anything else on a form like this is a thing a person has to keep
   * true later, and a person cannot be checked.
   *
   * It posts through the same `/api/mail` endpoint as every other channel,
   * with its own kind, so the message reaches the teaching mailbox and not
   * the hiring one. The endpoint owns the address; this form never names it.
   *
   * The privacy treatment is the same one the hiring form gives: the message
   * is used to answer the question and for nothing else, it is not added to a
   * list, and it is deleted when the thread is over or when the sender asks.
   *
   * No response time is promised, here or on the page: a time a reader can
   * hold us to is a commitment about a person answering a mailbox. The copy
   * says what is true of the mechanism instead.
   *
   * When the mail provider is not configured, the page says so and gives the
   * address instead, because a form that cannot send must not pretend to be
   * a way to reach us. */

  type Props = {
    /** Whether the server has a mail provider configured. */
    mailConfigured: boolean;
  };

  let { mailConfigured }: Props = $props();

  let name = $state("");
  let email = $state("");
  let need = $state("");
  let status = $state<"idle" | "sending" | "sent" | "error">("idle");
  let error = $state("");

  async function send(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (status === "sending" || !mailConfigured) return;
    status = "sending";
    error = "";
    try {
      const response = await fetch("/api/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "teaching",
          email: email.trim(),
          message: `Name: ${name.trim()}\nTeaching and students: ${need.trim()}`,
        }),
      });
      if (!response.ok) throw new Error("not sent");
      status = "sent";
      name = "";
      email = "";
      need = "";
    } catch {
      status = "error";
      error = TEACHING_ENQUIRY.failed;
    }
  }
</script>

<form onsubmit={send} class="max-w-[52ch]" data-teaching-enquiry>
  <div class="grid gap-4">
    <div>
      <label for="teaching-name" class="stamp block text-faint">{TEACHING_ENQUIRY.name}</label>
      <input
        id="teaching-name"
        type="text"
        autocomplete="name"
        bind:value={name}
        required
        aria-describedby="teaching-note"
        class="num mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink"
      />
    </div>

    <div>
      <label for="teaching-email" class="stamp block text-faint">{TEACHING_ENQUIRY.email}</label>
      <input
        id="teaching-email"
        type="email"
        autocomplete="email"
        bind:value={email}
        required
        aria-describedby="teaching-note"
        class="num mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink"
      />
    </div>

    <div>
      <label for="teaching-need" class="stamp block text-faint">{TEACHING_ENQUIRY.need}</label>
      <textarea
        id="teaching-need"
        rows="4"
        bind:value={need}
        required
        aria-describedby="teaching-note"
        class="num mt-2 w-full border border-control bg-raised px-3 py-2 text-[14px] leading-relaxed text-ink"
      ></textarea>
    </div>
  </div>

  <div class="mt-6 flex flex-wrap items-center gap-3">
    <Button type="submit" busy={status === "sending"} disabled={status === "sent" || !mailConfigured}>
      {status === "sent" ? "Sent" : TEACHING_ENQUIRY.submit}
    </Button>
  </div>

  <p id="teaching-note" class="mt-4 text-[12.5px] leading-relaxed text-faint" aria-live="polite">
    {#if status === "sent"}
      {TEACHING_ENQUIRY.sent}
    {:else if status === "error"}
      <span role="alert" class="text-removed">{error}</span>
    {:else if !mailConfigured}
      {TEACHING_ENQUIRY.notConfigured}
    {:else}
      {TEACHING_ENQUIRY.privacy}
    {/if}
  </p>
</form>
