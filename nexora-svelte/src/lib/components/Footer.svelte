<script lang="ts">
  import { FOOTER_LINKS, BRAND } from "$lib/content/site";
  import { inView } from "$lib/motion";

  /* The close.
   *
   * The last thing on the page is the product's whole claim at poster scale,
   * because a front door that ends on a legal line has wasted its most-read
   * position. Under it, one row of real links and nothing else: no newsletter
   * the product cannot send, no social account that does not exist, no
   * "made with" badge. */

  let year = new Date().getFullYear();
</script>

<footer class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-16 sm:px-8 sm:py-20">
    <p class="display max-w-[24ch] text-[clamp(1.75rem,5.2vw,4rem)] text-ink" use:inView>
      <span class="line-mask" data-shown="false"><span>Not finished.</span></span>
      <span class="line-mask" data-shown="false"><span>Proven.</span></span>
    </p>

    <div class="mt-14 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-rule pt-4">
      <span class="stamp text-[12px] font-semibold tracking-[0.14em] text-ink">{BRAND}</span>
      {#each FOOTER_LINKS as link (link.href)}
        <!-- 44px tall like every other control here, and taller than the line of
             type it prints: a row of 20px link text is a row of targets a thumb
             misses, and the footer is where a phone reaches last. -->
        <a
          href={link.href}
          class="inline-flex min-h-[44px] items-center text-[12.5px] text-faint transition-[color,background-color,border-color] duration-200 hover:text-accent"
        >
          {link.label}
        </a>
      {/each}
      <span class="num ml-auto text-[11.5px] text-faint">© {year}</span>
    </div>
  </div>
</footer>
