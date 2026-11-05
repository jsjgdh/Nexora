<script lang="ts">
  import { BRAND } from "$lib/content/site";
  import { COURSE_PAGES, coursePhases } from "$lib/content/courses";
  import { LEGAL_LINKS } from "$lib/legal";
  import type { ReleaseState } from "$lib/release";
  import { actionClass } from "$lib/ui";

  /* The footer is a back cover, not a second home page. One statement, the
     action, then the index a reader needs to leave by. */

  let { release }: { release: ReleaseState } = $props();
  const year = new Date().getFullYear();

  const productLinks = $derived([
    { href: "/download", label: release.label },
    { href: "/verify", label: "Verify a receipt" },
    { href: "/pricing", label: "Pricing" },
  ]);

  const audienceLinks = [
    { href: "/employers", label: "For hiring" },
    { href: "/universities", label: "For teaching" },
    { href: "/teach", label: "Cohorts" },
    { href: "/teach/join", label: "Join a cohort" },
  ];
</script>

<footer class="site-footer">
  <div class="container-page footer-top">
    <div class="footer-statement">
      <a href="/" class="wordmark" aria-label="NEXORA, home">
        <span class="mark" aria-hidden="true"></span>
        <span class="word">{BRAND}</span>
      </a>
      <p class="display statement">Build the judgment. Keep the record.</p>
    </div>
    <div class="footer-action">
      <p class="reading release-note">{release.note}</p>
      <a href="/download" class={actionClass("primary", "md")}>{release.label}</a>
    </div>
  </div>

  <div class="container-page footer-index">
    <div class="index-block index-courses">
      <p class="stamp index-label">Courses</p>
      <ul class="course-list">
        {#each COURSE_PAGES as course (course.slug)}
          <li>
            <a href={`/courses/${course.slug}`}>
              <span>{course.title}</span>
              <span class="num count">{coursePhases(course).length}</span>
            </a>
          </li>
        {/each}
      </ul>
    </div>

    <div class="index-block">
      <p class="stamp index-label">Product</p>
      <ul>
        {#each productLinks as link (link.href)}
          <li><a href={link.href}>{link.label}</a></li>
        {/each}
      </ul>
    </div>

    <div class="index-block">
      <p class="stamp index-label">For</p>
      <ul>
        {#each audienceLinks as link (link.href)}
          <li><a href={link.href}>{link.label}</a></li>
        {/each}
      </ul>
    </div>

    <div class="index-block">
      <p class="stamp index-label">Documents</p>
      <ul>
        {#each LEGAL_LINKS as link (link.href)}
          <li><a href={link.href}>{link.label}</a></li>
        {/each}
      </ul>
    </div>
  </div>

  <div class="container-page credits">
    <p>
      Language marks:
      <a href="https://github.com/voodootikigod/logo.js" target="_blank" rel="noreferrer">JavaScript</a>
      by Christopher Williams (<a href="https://opensource.org/license/mit" target="_blank" rel="noreferrer">MIT</a>),
      <a href="https://github.com/rust-lang/rust-artwork" target="_blank" rel="noreferrer">Rust</a>
      by the Rust project (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>),
      <a href="https://github.com/ziglang/logo" target="_blank" rel="noreferrer">Zig</a>
      by the Zig project (<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>),
      <a href="https://ocaml.org" target="_blank" rel="noreferrer">OCaml</a>
      by the OCaml project (public domain), and the
      <a href="https://go.dev/doc/gopher/" target="_blank" rel="noreferrer">Go gopher</a>
      by Renee French (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>, cropped to the face).
      SQL and API are set in plain type.
    </p>
  </div>

  <div class="container-page colophon">
    <p>A course inside a real IDE. The code decides, and the record can be checked.</p>
    <p class="num">© {year} NEXORA</p>
  </div>
</footer>

<style>
  .site-footer {
    background: var(--color-panel);
    border-top: 1px solid var(--color-rule);
    position: relative;
  }

  .site-footer::before {
    content: "";
    position: absolute;
    top: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--color-accent) 55%, transparent) 50%,
      transparent
    );
  }

  .footer-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
    padding-block: clamp(3.5rem, 6vw, 5.5rem);
    align-items: end;
  }

  @media (min-width: 900px) {
    .footer-top {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
      gap: var(--space-16);
    }
  }

  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    color: var(--color-ink);
    text-decoration: none;
  }

  .mark {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    background: var(--color-ink);
    color: var(--color-panel);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
  }

  .mark::before {
    content: "N";
  }

  .word {
    font-family: var(--font-display);
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .statement {
    margin-top: var(--space-6);
    max-width: 16ch;
    font-size: var(--text-section);
    color: var(--color-ink);
  }

  .footer-action {
    display: grid;
    gap: var(--space-4);
    justify-items: start;
  }

  .release-note {
    max-width: 46ch;
    font-size: 14px;
    line-height: 1.6;
    color: var(--color-muted);
  }

  .footer-index {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-8);
    padding-block: var(--space-8) var(--space-10);
    border-top: 1px solid var(--color-rule);
  }

  @media (min-width: 640px) {
    .footer-index {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 1024px) {
    .footer-index {
      grid-template-columns: minmax(0, 1.5fr) repeat(3, minmax(0, 0.8fr));
      gap: var(--space-10);
    }
  }

  .index-label {
    color: var(--color-faint);
    margin-bottom: var(--space-2);
  }

  .index-block ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .index-block a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--color-muted);
    font-size: 14px;
    text-decoration: none;
    transition: color var(--dur-1) var(--ease-out);
  }

  .index-block a:hover {
    color: var(--color-accent);
  }

  .course-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    column-gap: var(--space-6);
  }

  @media (min-width: 420px) {
    .course-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .course-list a {
    justify-content: space-between;
    width: 100%;
    gap: var(--space-3);
  }

  .count {
    font-size: 11px;
    color: var(--color-faint);
  }

  .credits {
    padding-block: var(--space-4) 0;
    font-family: var(--font-mono);
    font-size: 10.5px;
    line-height: 1.6;
    color: var(--color-faint);
  }

  .credits p {
    max-width: 96ch;
  }

  .credits a {
    color: var(--color-muted);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .credits a:hover {
    color: var(--color-ink);
  }

  .colophon {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-6);
    padding-block: var(--space-5);
    border-top: 1px solid var(--color-rule);
    color: var(--color-faint);
    font-size: 12.5px;
  }
</style>
