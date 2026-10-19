<script lang="ts">
  import { enhance } from "$app/forms";
  import Button from "$lib/components/Button.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import { PRIVACY_CONTACT, SECURITY_CONTACT } from "$lib/legal";

  /** The two fields the form collects. The page owns them; the card only
      renders and posts them. */
  type ContactForm = { email: string; message: string };

  export let form: ContactForm = { email: "", message: "" };
  export let message: string = "";
  export let ok: boolean = false;
  export let error: string | null = null;
  export let showPreview: boolean = false;
  export let subject: string = "";
  export let securitySubject: string = "";

  function privacySubject(): string {
    return subject && subject !== ""
      ? subject
      : "Subject: Privacy inquiry, Nexora";
  }

  function securitySubjectLine(): string {
    return securitySubject && securitySubject !== ""
      ? securitySubject
      : "Subject: Security report, Nexora";
  }

  function mailtoFor(
    intent: "privacy" | "security",
    email: string,
    privacySubjectString: string,
    securitySubjectString: string,
  ): string {
    if (intent === "security") {
      return securitySubjectString && securitySubjectString !== ""
        ? securitySubjectString
        : `mailto:${SECURITY_CONTACT}?subject=${encodeURIComponent("Security report, Nexora")}`;
    }
    return privacySubjectString && privacySubjectString !== ""
      ? privacySubjectString
      : `mailto:${PRIVACY_CONTACT}?subject=${encodeURIComponent("Privacy inquiry, Nexora")}`;
  }

  let intent: "privacy" | "security" = "privacy";

  $: intent =
    securitySubjectLine() && securitySubjectLine() !== ""
      ? ("security" as const)
      : ("privacy" as const);

  function previewIntent() {
    window.location.href = mailtoFor(
      intent,
      form.email,
      privacySubject(),
      securitySubjectLine(),
    );
  }

  $: form =
    privacySubject()
      ? ({ ...form, message: message, email: form.email })
      : { email: form.email, message: form.message };
</script>

<form
  method="POST"
  action="?/send"
  use:enhance={() => {
    return async ({ update }) => {
      update({
        reset: false,
      });
      const response = await fetch("?/send", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: form.email,
          subject: subject,
          securitySubject: securitySubject,
          message: form.message,
        }),
      });
      if (response.ok) {
        ok = true;
        form = { email: "", message: "" };
        error = null;
      } else {
        error = "Your message could not be sent. Please try again or email us directly.";
        ok = false;
      }
    };
  }}
  class="relative"
>
  <input type="hidden" name="intent" value={intent} />
  <input type="hidden" name="subject" value={subject} />
  <input type="hidden" name="securitySubject" value={securitySubject} />

  <div
    class="rounded-sm border border-rule bg-ground p-4 text-[13.5px] text-muted"
    role="status"
    aria-live="polite"
  >
    <p class="font-semibold text-ink">
      {ok ? "Message accepted." : error ?? "Send a message"}
    </p>
    {#if !ok}
      <p class="mt-1">
        Reply to {form.email || "the address you give us"} when we act on it.
      </p>
    {/if}

    {#if intent === "security"}
      <p class="mt-1 text-[12px] text-faint">
        This message will be sent to the security contact address.
      </p>
    {:else if privacySubject() !== ""}
      <p class="mt-1 text-[12px] text-faint">
        This message will be sent to the privacy contact address.
      </p>
    {/if}
  </div>

  <div class="mt-4 grid gap-4 sm:grid-cols-2">
    <div>
      <label for="contact-email" class="block text-[13px] font-medium text-ink">
        Your email
      </label>
      <input
        id="contact-email"
        name="email"
        type="email"
        autocomplete="email"
        bind:value={form.email}
        placeholder="you@example.com"
        class="mt-1 w-full rounded-sm border border-control bg-transparent px-3 py-2 text-[14px] text-ink transition-[border-color] duration-150 focus:border-accent"
        aria-label="Your email address"
        required
      />
    </div>
    <div>
      <label for="contact-subject" class="block text-[13px] font-medium text-ink">
        Subject
      </label>
      <input
        id="contact-subject"
        name="subject"
        type="text"
        autocomplete="off"
        bind:value={subject}
        placeholder="What is this about?"
        class="mt-1 w-full rounded-sm border border-control bg-transparent px-3 py-2 text-[14px] text-ink transition-[border-color] duration-150 focus:border-accent"
        aria-label="Subject for your message"
      />
    </div>
  </div>

  <div class="mt-4">
    <label for="contact-message" class="block text-[13px] font-medium text-ink">
      Message
    </label>
    <textarea
      id="contact-message"
      name="message"
      bind:value={form.message}
      rows="5"
      placeholder="Describe your request or report in plain text…"
      class="mt-1 w-full resize-y rounded-sm border border-control bg-transparent px-3 py-2 text-[14px] text-ink transition-[border-color] duration-150 focus:border-accent"
      aria-label="Your message"
      required
    ></textarea>
  </div>

  {#if showPreview}
    <div class="mt-4 rounded-sm border border-rule bg-raised p-3 text-[13px] text-muted">
      <p class="font-semibold text-ink">Preview of your message:</p>
      <p class="mt-1 text-[12.5px] leading-relaxed text-faint">
        To: {intent === "security" ? SECURITY_CONTACT : PRIVACY_CONTACT}
        <br />
        Subject: {intent === "security" ? securitySubjectLine() : privacySubject()}
        <br />
        From: {form.email}
        <br />
        {form.message}
      </p>
    </div>
  {/if}

  <div class="mt-4 flex flex-wrap gap-2">
    <Button type="submit" variant="primary">
      {ok ? "Message sent" : "Send message"}
    </Button>
    <Button type="button" variant="ghost" onclick={previewIntent}>
      Open mailer
    </Button>
    {#if subject || securitySubject || form.email}
      <Button
        type="button"
        variant="quiet"
        onclick={() => {
          intent = intent === "security" ? ("privacy" as const) : ("security" as const);
        }}
      >
        {intent === "security" ? "Privacy" : "Security"}
      </Button>
    {/if}
  </div>
</form>
