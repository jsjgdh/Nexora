<script lang="ts">
  import { MICRO_FACTS } from "$lib/content/site";

  /* The three facts under the buttons.
   *
   * A person standing in front of a download button is hesitating about three
   * things, and they are the same three for everybody: what does it cost, do
   * I have to sign up, and what happens to the work I have already done.
   *
   * So those three are answered, in the order the questions arrive, and each
   * answer is a fact about the product rather than a promise about it.
   */
  type Props = { audience: string };

  let { audience }: Props = $props();

  const facts = $derived(
    audience === "employer" ? MICRO_FACTS.employer : MICRO_FACTS.learner
  );
</script>

<ul class="facts">
  {#each facts as fact (fact)}
    <li>
      <span class="tick" aria-hidden="true"></span>
      {fact}
    </li>
  {/each}
</ul>

<style>
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-6);
    margin: var(--space-6) 0 0;
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--color-muted);
  }

  /* A tick, drawn rather than a character, so it is the same mark wherever it
     appears and it does not depend on the reader's font having the glyph. */
  .tick {
    position: relative;
    width: 9px;
    height: 9px;
    flex: none;
  }

  .tick::before {
    content: "";
    position: absolute;
    left: 1px;
    top: 4px;
    width: 4px;
    height: 4px;
    border-right: 1.5px solid var(--color-added);
    border-bottom: 1.5px solid var(--color-added);
    transform: rotate(45deg);
  }
</style>
