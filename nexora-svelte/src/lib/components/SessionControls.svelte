<script lang="ts">
  import { clerkConfigured, signOutThisDevice } from "$lib/sign-out";
  import { session } from "$lib/session.svelte";
  import Button from "$lib/components/Button.svelte";
  import Plate from "$lib/components/Plate.svelte";

  /* The session controls, in one place.
   *
   * Sign out and sign out everywhere are the two actions that end a session,
   * and they now live on two pages: the account home and the sign-in page.
   * A second copy of a security control is a second copy to get wrong, so the
   * control is this component and both pages render it.
   *
   * Two details are inherited from the version this replaces, and both matter.
   *
   * The first is the two-click shape. "Sign out everywhere" ends the sessions
   * on devices the learner is not holding, so it cannot be undone from here
   * and it is confirmed by a second click rather than by a checkbox a stray
   * tap could reach.
   *
   * The second is where the answer is printed. Ending every session signs this
   * page out too, so the note about what happened has to live outside the
   * signed-in branch. This component is therefore mounted by its parents
   * outside that branch, and it renders the note itself.
   *
   * The answer is reported even when it is bad news, because the sessions it
   * ends are on devices the learner cannot see. A silent failure would let
   * them believe the other devices were signed out when they are not. */

  /** The plate the control sits in, when the page wants one. */
  let {
    label = "",
    title = "",
    body = "",
  }: {
    label?: string;
    title?: string;
    body?: string;
  } = $props();

  /** Armed by one click, performed by the next. */
  let confirmEverywhere = $state(false);
  let everywhereBusy = $state(false);
  let everywhereError = $state<string | null>(null);
  let everywhereNote = $state<string | null>(null);

  async function signOut() {
    await signOutThisDevice();
  }

  async function signOutEverywhere() {
    if (!confirmEverywhere) {
      confirmEverywhere = true;
      everywhereError = null;
      return;
    }
    confirmEverywhere = false;
    everywhereBusy = true;
    everywhereError = null;
    everywhereNote = null;
    try {
      const ended = await session.logoutEverywhere();
      everywhereNote =
        ended > 0
          ? `Every session for this account is ended (${ended} ended just now). Sign in again wherever you need to.`
          : "Every session for this account is ended. Sign in again wherever you need to.";
    } catch (err) {
      everywhereError = err instanceof Error ? err.message : "Could not end your other sessions.";
    } finally {
      everywhereBusy = false;
    }
  }
</script>

<!-- The two buttons, so the plate and the bare form render the same control. -->
{#snippet Controls()}
  <div class="flex flex-wrap items-center gap-3">
    <Button variant="ghost" onclick={signOut}>Sign out</Button>
    {#if !clerkConfigured}
      <Button variant="quiet" disabled={everywhereBusy} onclick={signOutEverywhere}>
        {everywhereBusy
          ? "Ending every session"
          : confirmEverywhere
            ? "Click again to end every session"
            : "Sign out everywhere"}
      </Button>
    {/if}
  </div>
  <p class="mt-4 text-[12.5px] leading-relaxed text-faint">
    {#if clerkConfigured}
      Sessions on this account are managed by Clerk, so ending them on every device is done from
      its dashboard. Signing out here ends this device.
    {:else}
      "Sign out everywhere" ends every session on this account, every tab and every device,
      including this one, for a device you no longer hold or trust.
    {/if}
  </p>
{/snippet}

<!-- The outcome of the last action, printed outside the signed-in branch on
     purpose: the action signs this page out, and the learner still has to
     read what happened. -->
{#if everywhereNote}
  <p class="border border-approved px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="status">
    {everywhereNote}
  </p>
{/if}
{#if everywhereError}
  <p class="border border-removed px-4 py-3 text-[13.5px] leading-relaxed text-ink" role="alert">
    {everywhereError}
  </p>
{/if}

{#if session.restoring}
  <p class="text-[13.5px] leading-relaxed text-muted">Checking your session.</p>
{:else if session.loggedIn}
  {#if title}
    <Plate>
      <p class="stamp text-[11px] text-faint">{label}</p>
      <h2 class="mt-3 text-[19px] text-ink">{title}</h2>
      {#if body}
        <p class="mt-3 text-[13.5px] leading-relaxed text-muted">{body}</p>
      {/if}
      <div class="mt-5 border-t border-rule pt-5">
        {@render Controls()}
      </div>
    </Plate>
  {:else}
    {@render Controls()}
  {/if}
{/if}
