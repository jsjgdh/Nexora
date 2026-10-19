<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import { pageTitle } from "$lib/seo";
  import { LEGAL_ENTITY, PRIVACY_CONTACT, SUBPROCESSORS } from "$lib/legal";

  /* The subprocessor list — the one page that renders `$lib/legal`'s
   * `SUBPROCESSORS` array.
   *
   * It is deliberately the single rendering of that data rather than a table
   * retyped into markup: the privacy notice points here, and a data processing
   * agreement points here, so if the list lived in two places one of them would
   * eventually describe a company the other had dropped.
   *
   * The page also carries the change notice. A subprocessor list is only worth
   * having if a customer can rely on learning about a change *before* it takes
   * effect, so the rule is stated on the page rather than implied: a provider
   * appears here first. `location` is each provider's own published processing
   * location, printed with it so a reader can see the transfer question without
   * having to ask. */
</script>

<PageHead
  title={pageTitle("Subprocessors")}
  description="The companies that process NEXORA data on the operator's behalf, what each one touches, and where it processes it."
  path="/subprocessors"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
  <Headline
    as="h1"
    lines={["Who else touches", "the data."]}
    class="text-[clamp(2rem,5.6vw,4.2rem)] text-ink"
  />
  <p class="mt-7 max-w-[56ch] font-serif text-[clamp(1.05rem,2vw,1.45rem)] leading-snug text-muted">
    A short, named list of the companies that process data for this service, what each one is allowed
    to touch, and where it does so — published so it can be read and challenged, not so it can be
    taken on trust.
  </p>
</div>

<div class="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8 sm:pb-28">
  <Plate crosshair>
    <p class="stamp text-[11px] text-faint">subprocessors</p>
    <DocStatus />

    <p class="mt-6 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
      A subprocessor is another company that handles personal data on our behalf, under our
      instructions, because it does a job we do not do ourselves — checking an identity, taking a
      payment, hosting the installer download. Each one is bound by a contract with
      <span class="text-ink">{LEGAL_ENTITY}</span> that limits it to the job it was engaged for, and
      each appears in this list only once those data processing terms are in place. We do not sell
      data and we do not share it for advertising.
    </p>

    <div class="mt-8 grid gap-6 text-[13.5px] leading-relaxed text-muted">
      {#each SUBPROCESSORS as p (p.name)}
        <div class="border-t border-rule pt-4">
          <h2 class="text-[14.5px] font-semibold text-ink">{p.name}</h2>
          <dl class="mt-2 grid gap-1.5">
            <div class="flex flex-wrap gap-x-2">
              <dt class="text-faint">purpose</dt>
              <dd class="text-muted">{p.purpose}</dd>
            </div>
            <div class="flex flex-wrap gap-x-2">
              <dt class="text-faint">data it touches</dt>
              <dd class="text-muted">{p.data}</dd>
            </div>
            <div class="flex flex-wrap gap-x-2">
              <dt class="text-faint">processing location</dt>
              <dd class="num text-muted">{p.location}</dd>
            </div>
          </dl>
        </div>
      {/each}
    </div>

    <div class="mt-10 grid gap-8 border-t border-rule pt-6 text-[13.5px] leading-relaxed text-muted">
      <section>
        <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Where the data goes</h2>
        <p class="mt-3">
          These providers are not all in one country, so using the service can involve transferring
          personal data across a border. Where that happens, the transfer rests on the provider's own
          contractual safeguards, and the location each one publishes is printed beside it in the list
          above so the question can be answered without asking us.
        </p>
      </section>

      <section>
        <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">How changes are announced</h2>
        <p class="mt-3">
          <span class="text-ink">This page is the notice.</span> A new subprocessor is added here
          before it begins processing anything, and a material change is announced to signed-in
          accounts rather than only recorded here. If you are assessing this service, the list you are
          reading is the list in force.
        </p>
      </section>

      <section>
        <h2 class="display text-[clamp(1.15rem,2vw,1.5rem)] text-ink">Asking about a DPA</h2>
        <p class="mt-3">
          A data processing agreement is available for customers who need one — its scope, transfer
          safeguards and outstanding items are published on the
          <a class="text-accent underline" href="/dpa">DPA page</a>; the entity to name is
          <span class="text-ink">{LEGAL_ENTITY}</span>, and requests go to
          <span class="text-ink">{PRIVACY_CONTACT}</span>. What is collected in the first place, and
          the rights that come with it, is set out in the
          <a class="text-accent underline" href="/privacy">privacy notice</a>; the rules for using the
          service are in the <a class="text-accent underline" href="/terms">terms</a>; how the data is
          protected is on the <a class="text-accent underline" href="/security">security page</a>.
        </p>
      </section>
    </div>
  </Plate>

  <div class="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    <Plate>
      <p class="stamp text-[11px] text-faint">processors on file</p>
      <p class="num mt-4 text-[13px] text-ink">{SUBPROCESSORS.length} listed</p>
      <p class="mt-2 text-[12.5px] leading-snug text-faint">
        Each with the data it touches and where it processes it.
      </p>
    </Plate>

    <Plate>
      <p class="stamp text-[11px] text-faint">added before it processes</p>
      <p class="mt-4 text-[13px] leading-relaxed text-muted">
        No provider handles personal data before its data processing terms are in place and it is
        named here.
      </p>
    </Plate>

    <Plate>
      <p class="stamp text-[11px] text-faint">never for advertising</p>
      <p class="mt-4 text-[13px] leading-relaxed text-muted">
        No provider in this list receives data so it can be sold, resold, or used to target
        advertising.
      </p>
    </Plate>
  </div>
</div>
