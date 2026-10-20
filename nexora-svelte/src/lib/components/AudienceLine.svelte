<script lang="ts">
  import { AUDIENCE_LINE } from "$lib/content/site";

  /* Who this page is for, in one line.
   *
   * The line sits above the headline because a reader who does not recognise
   * themselves in it should know that in the first second, rather than after
   * reading the whole poster. It is a statement about the reader and not a
   * claim about the product, so it can be as blunt as it needs to be.
   *
   * It changes with the audience switch, because a hiring manager and a
   * learner are not looking for the same thing, and a line that only fits one
   * of them would be a line for the wrong person.
   */
  type Props = { audience: string };

  let { audience }: Props = $props();

  const line = $derived(
    audience === "employer" ? AUDIENCE_LINE.employer : AUDIENCE_LINE.learner
  );
</script>

<p class="audience">
  <span class="lamp" aria-hidden="true"></span>
  {line}
</p>

<style>
  .audience {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    border: 1px solid var(--color-rule);
    border-radius: 999px;
    /* Opaque on purpose. A translucent pill over a moving background is a
       contrast that depends on what is behind it, and the text on it is the
       second thing a reader looks at. */
    background: var(--color-panel);
    padding: var(--space-2) var(--space-4);
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-muted);
  }

  /* The one lamp on the page that is not a state. It says "this is live and
     aimed at you", and it is the only thing on the page that breathes. */
  .lamp {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 999px;
    background: var(--color-added);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-added) 50%, transparent);
    animation: pulse 2.4s ease-out infinite;
  }

  @keyframes pulse {
    70% {
      box-shadow: 0 0 0 9px transparent;
    }
  }
</style>
