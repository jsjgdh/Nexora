<script lang="ts">
  import { EFFECTIVE_DATE, OPERATOR_READY } from "$lib/legal";

  /* The status line every legal document carries, in one place.
   *
   * Two states, and the distinction is the point. Once the operator's details
   * are real (`OPERATOR_READY`), the document prints the date it took effect.
   * Until then it says so plainly, because a legal document that looks final
   * while the responsible party is still unnamed is worse than one that admits
   * it is a draft. Same discipline as the download page, which prints "not
   * published" rather than a dead link. */
</script>

{#if OPERATOR_READY}
  <p class="num text-[11.5px] text-faint">in force from {EFFECTIVE_DATE}</p>
{:else}
  <p class="mt-3 border-l border-rule pl-3 text-[12.5px] leading-relaxed text-muted">
    <span class="text-ink">Draft. Not yet in force.</span> The operator's legal name and a monitored
    contact address are still placeholders, so this document is published early and labelled honestly
    rather than dated as final. Nothing here is a claim that a live, reviewed policy exists.
  </p>
{/if}
