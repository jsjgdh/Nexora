<script lang="ts">
  import Button from "./Button.svelte";
  import { HIRING_ENQUIRY } from "$lib/content/site";

  /* The hiring enquiry.
   *
   * The hiring page had no way for an employer to reach anyone, and a page
   * that says "there is no cohort behind this yet" and then gives nobody a
   * way to write is a page that has finished the argument and hung up. So the
   * page gets one real path: a short form that sends through the same
   * endpoint as the launch list, to a mailbox a person reads.
   *
   * It is deliberately the smallest thing that can be true: a name, a work
   * email, and what the role is. No company size, no phone number, no
   * scheduling link, and nothing that would have to be kept true by a person
   * we cannot check.
   *
   * The privacy treatment is the launch list's: the message is used to answer
   * the question and for nothing else, it is not added to a list, and it is
   * deleted when the thread is over or when the sender asks. The privacy
   * notice says the same thing in the same words, and the suite checks that
   * both places still say it.
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
          kind: "employer",
          email: email.trim(),
          message: `Name: ${name.trim()}\nHiring for: ${need.trim()}`,
        }),
      });
      if (!response.ok) throw new Error("not sent");
      status = "sent";
      name = "";
      email = "";
      need = "";
    } catch {
      status = "error";
      error = HIRING_ENQUIRY.failed;
    }
  }
</script>

<form onsubmit={send} class="max-w-[52ch]" data-hiring-enquiry>
  <div class="grid gap-4">
    <div>
      <label for="hiring-name" class="stamp block text-faint">{HIRING_ENQUIRY.name}</label>
      <input
        id="hiring-name"
        type="text"
        autocomplete="name"
        bind:value={name}
        required
        aria-describedby="hiring-note"
        class="num mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink"
      />
    </div>

    <div>
      <label for="hiring-email" class="stamp block text-faint">{HIRING_ENQUIRY.email}</label>
      <input
        id="hiring-email"
        type="email"
        autocomplete="email"
        bind:value={email}
        required
        aria-describedby="hiring-note"
        class="num mt-2 min-h-[44px] w-full border border-control bg-raised px-3 py-2 text-[14px] text-ink"
      />
    </div>

    <div>
      <label for="hiring-need" class="stamp block text-faint">{HIRING_ENQUIRY.need}</label>
      <textarea
        id="hiring-need"
        rows="4"
        bind:value={need}
        required
        aria-describedby="hiring-note"
        class="num mt-2 w-full border border-control bg-raised px-3 py-2 text-[14px] leading-relaxed text-ink"
      ></textarea>
    </div>
  </div>

  <div class="mt-6 flex flex-wrap items-center gap-3">
    <Button type="submit" busy={status === "sending"} disabled={status === "sent" || !mailConfigured}>
      {status === "sent" ? "Sent" : HIRING_ENQUIRY.submit}
    </Button>
  </div>

  <p id="hiring-note" class="mt-4 text-[12.5px] leading-relaxed text-faint" aria-live="polite">
    {#if status === "sent"}
      {HIRING_ENQUIRY.sent}
    {:else if status === "error"}
      <span class="text-removed">{error}</span>
    {:else if !mailConfigured}
      {HIRING_ENQUIRY.notConfigured}
    {:else}
      {HIRING_ENQUIRY.privacy}
    {/if}
  </p>
</form>
