<script lang="ts">
  import { LANDSCAPE } from "$lib/content/site";

  /* Where the rest of the market stops.
   *
   * The research's §1 audit, with the names taken off. Five categories, each
   * with the thing it structurally cannot do, and then the one line this
   * product sits on.
   *
   * The categories are described, not dismissed. A reader who has just paid
   * for a video library is not being told they were sold a bad product; they
   * are being told what that shape of product is for, and where it ends. */
</script>

<div class="grid gap-px border border-rule bg-rule lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
  <div class="bg-panel p-6 sm:p-8">
    <ul>
      {#each LANDSCAPE.kinds as kind (kind.name)}
        <li class="border-t border-rule py-5 first:border-t-0 first:pt-0 last:pb-0">
          <p class="text-[15px] font-semibold text-ink">{kind.name}</p>
          <p class="mt-1.5 max-w-[52ch] text-[14.5px] leading-relaxed text-muted">{kind.leaves}</p>
        </li>
      {/each}
    </ul>
  </div>

  <div class="bg-panel p-6 sm:p-8">
    <p class="stamp text-faint">where this one sits</p>
    <p class="reading mt-4 max-w-[38ch] text-[16px] leading-relaxed text-ink">{LANDSCAPE.ours}</p>
  </div>
</div>
