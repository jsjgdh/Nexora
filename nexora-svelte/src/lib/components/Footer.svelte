<script lang="ts">
  import { FOOTER_LINKS, BRAND, MASTHEAD } from "$lib/content/site";
  import { LEGAL_LINKS } from "$lib/legal";
  import type { ReleaseState } from "$lib/release";

  /* The title block.
   *
   * A drawing ends with a title block: a ruled set of cells, each one holding
   * one fact about the thing on the sheet — what it is, what it is called,
   * which revision, what it is not. A site that is arguing for evidence
   * should end the way a drawing ends, and it should hold the same discipline:
   * four cells, one job each, and nothing in them that is not true.
   *
   * The block is ruled by the cells themselves: the container carries the top
   * and left rules, every cell carries a bottom and a right one, and there is
   * no gap — so the grid reads as one table at one, two or four columns
   * without the borders ever doubling up.
   *
   * There is no newsletter the product cannot send, no social account that
   * does not exist, and no "made with" badge. The legal row is a cell of the
   * block rather than a line beneath it, because those documents have to be
   * reachable from every page — a policy you cannot find is the same as no
   * policy — and a title block is exactly where a drawing keeps its
   * revisions. The list comes from `$lib/legal`, so the footer and the
   * sitemap cannot disagree about which documents exist. */

  let year = new Date().getFullYear();

  /* The download, and the label the release state gives it.
   *
   * The link is the first thing in the cell because it is the first thing a
   * reader might want, and the label is the state's, so the footer cannot
   * promise a build that is not published while the hero is telling the
   * truth. */
  let { release }: { release: ReleaseState } = $props();
</script>

<footer class="border-t border-rule">
  <div class="mx-auto max-w-[1320px] px-5 py-14 sm:px-8 sm:py-20">
    <!-- The measurement scale: the tick rule the block sits on. It is drawn
         from a gradient, so it costs no request and no image. -->
    <div class="scale" aria-hidden="true"></div>

    <div class="grid border-t border-l border-rule bg-panel sm:grid-cols-2 lg:grid-cols-4">
      <div class="border-r border-b border-rule p-6">
        <p class="display text-[clamp(1.5rem,3.2vw,2.1rem)] text-ink">{BRAND}</p>
        <p class="mt-3 max-w-[26ch] text-[14px] leading-relaxed text-muted">
          {MASTHEAD.descriptor}.
        </p>
        <p class="num mt-4 text-[11.5px] text-faint">{MASTHEAD.status}</p>
        <p class="stamp mt-5 text-[11px] text-faint">signed receipts, not badges</p>
      </div>

      <div class="border-r border-b border-rule p-6">
        <p class="stamp text-[11px] text-faint">the product</p>
        <ul class="mt-3">
          <li>
            <a
              href="/download"
              class="inline-flex min-h-[44px] items-center text-[14.5px] text-muted transition-[color,background-color,border-color] duration-200 hover:text-accent"
            >
            {release.label}
          </a>
          </li>
          {#each FOOTER_LINKS as link (link.href)}
            <!-- 44px tall like every other control here, and taller than the
                 line of type it prints: a row of 20px link text is a row of
                 targets a thumb misses, and the footer is where a phone reaches
                 last. -->
            <li>
              <a
                href={link.href}
                class="inline-flex min-h-[44px] items-center text-[14.5px] text-muted transition-[color,background-color,border-color] duration-200 hover:text-accent"
              >
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div class="border-r border-b border-rule p-6">
        <p class="stamp text-[11px] text-faint">the documents</p>
        <ul class="mt-3">
          {#each LEGAL_LINKS as link (link.href)}
            <li>
              <a
                href={link.href}
                class="inline-flex min-h-[44px] items-center text-[14.5px] text-muted transition-[color,background-color,border-color] duration-200 hover:text-accent"
              >
                {link.label}
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div class="border-r border-b border-rule p-6">
        <p class="stamp text-[11px] text-faint">the record</p>
        <p class="reading mt-3 max-w-[32ch] text-[15px] leading-relaxed text-muted">
          Every finished phase leaves a receipt anyone can re-derive, at
          <a
            href="/verify"
            class="text-ink underline decoration-rule-strong underline-offset-4 transition-[color,background-color,border-color] duration-200 hover:text-accent"
          >
            /verify
          </a>, with no account.
        </p>
        <p class="num mt-5 text-[11.5px] text-faint">© {year}</p>
      </div>
    </div>
  </div>
</footer>
