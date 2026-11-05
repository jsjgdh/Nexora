<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import Headline from "$lib/components/Headline.svelte";
  import Plate from "$lib/components/Plate.svelte";
  import DocStatus from "$lib/components/DocStatus.svelte";
  import { pageTitle } from "$lib/seo";
  import { AI_DISCLOSURE, AI_SYSTEMS, REGIME_DATES } from "$lib/legal";

  /* The AI disclosure, and the reason it is a page rather than a tooltip.
   *
   * The EU AI Act's Article 50 transparency duty has applied since 2 August 2026.
   * NEXORA is a *deployer* of third-party AI assistants, not their provider: it
   * bundles them into the desktop IDE and hands over whatever the learner types
   * into the chat pane. Two consequences follow, and both are written out here:
   *
   *   - a person interacting with an AI system has to be told so, clearly, and
   *     not have to infer it from a settings pane. That is the notice below, and
   *     it also appears at first use in the IDE.
   *   - the things this product does NOT do matter just as much. No model grades
   *     anything (blueprint FR-7, enforced in the signed-facts contract), so the
   *     Act's high-risk treatment of educational assessment — Annex III, applying
   *     from 2 December 2027 — is not where assessment sits. The disclosure says
   *     that plainly instead of leaving a reader to wonder.
   *
   * The date table is included because a claim about the law is only checkable if
   * the date is beside it: a reader can see which duty is in force and which is
   * scheduled, and hold the operator to the difference. */

  const myTraining: { heading: string; body: string }[] = [
    {
      heading: "What I send, and when",
      body: "Nothing leaves your machine unless you type in the assistant's pane and send it. There is no background indexing, no silent upload of your workspace, and no AI feature that runs without your input.",
    },
    {
      heading: "What I am told about the assistants",
      body: "Before the first chat message, the IDE states which assistant is about to receive it and that it is a third-party AI system. The list of systems is on this page, with the provider and what each one receives.",
    },
    {
      heading: "What decides my grade",
      body: "A rule engine over your own code and the platform's own checks. Not a model, not a rubric scored by an LLM, and not a human's impression. That is why a verdict here can be re-derived by a stranger.",
    },
    {
      heading: "What can be wrong",
      body: "The assistants are wrong sometimes, and confidently. They are advice, not assessment. When an assistant's suggestion and a check disagree, the check is what decides the phase.",
    },
  ];
</script>

<PageHead
  title={pageTitle("AI in NEXORA")}
  description="Which AI assistants the IDE bundles, what they receive, what is decided by rules rather than models, and how to turn them off."
  path="/ai"
/>

<div class="mx-auto max-w-[1320px] px-5 pt-16 pb-20 sm:px-8 sm:pt-24 sm:pb-28">
  <Headline as="h1" lines={["Where AI is.", "And where it is not."]} class="text-[clamp(1.9rem,4.4vw,3.2rem)] text-ink" />

  <div class="mt-8 max-w-[72ch]">
    <DocStatus />
  </div>

  <p class="document-lede">
    The IDE can put a third-party AI assistant in front of you. It is off until you turn it on, and
    what it does when it is on is worth stating exactly rather than describing as "AI features".
  </p>

  <!-- The four statements, in the voice the rest of the product uses: what it
       sends, what it is told, what decides, what can be wrong. -->
  <div class="mt-12 grid gap-6 md:grid-cols-2">
    {#each myTraining as row (row.heading)}
      <Plate>
        <h2 class="text-[16.5px] text-ink">{row.heading}</h2>
        <p class="mt-3 text-[14.5px] leading-relaxed text-muted">{row.body}</p>
      </Plate>
    {/each}
  </div>

  <div class="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
    <div>
      <p class="stamp text-[11px] text-accent">the systems in the box</p>
      <ul class="mt-6 space-y-6">
        {#each AI_SYSTEMS as sys (sys.name)}
          <li class="border-l border-rule pl-4">
            <p class="text-[15px] text-ink">
              {sys.name} <span class="text-faint">· {sys.provider}</span>
            </p>
            <p class="mt-1 text-[14.5px] leading-relaxed text-muted">{sys.role}</p>
            <p class="mt-1 text-[13px] leading-relaxed text-faint">Receives: {sys.sends}</p>
          </li>
        {/each}
      </ul>

      <div class="mt-10 border-t border-rule pt-6">
        <!-- The Art. 50 disclosure itself, verbatim from the shared facts so the
             privacy notice and this page cannot say it two different ways. -->
        <p class="text-[14.5px] leading-relaxed text-muted">{AI_DISCLOSURE.interaction}</p>
        <p class="mt-4 text-[14.5px] leading-relaxed text-muted">{AI_DISCLOSURE.decides}</p>
        <p class="mt-4 text-[14.5px] leading-relaxed text-muted">{AI_DISCLOSURE.transfer}</p>
      </div>
    </div>

    <div>
      <Plate crosshair>
        <p class="stamp text-[11px] text-faint">turn it off</p>
        <p class="mt-3 text-[14.5px] leading-relaxed text-muted">
          Chat and inline suggestions are separate switches in the IDE's settings, and both are off by
          default in a fresh install. Nothing in the course or the checks requires either. If an
          assistant is enabled in a managed deployment, the policy that enabled it is the operator's,
          and this page still describes what it receives.
        </p>
      </Plate>

      <Plate>
        <p class="stamp text-[11px] text-faint">your right to know which law applies</p>
        <ul class="mt-4 space-y-3">
          {#each REGIME_DATES as row (row.regime)}
            <li class="text-[13px] leading-relaxed text-muted">
              <span class="text-ink">{row.regime}</span>
              <span class="block text-faint">{row.duty}: {row.date}</span>
            </li>
          {/each}
        </ul>
      </Plate>
    </div>
  </div>

  <div class="mt-14 border-t border-rule pt-8">
    <p class="max-w-[74ch] text-[14.5px] leading-relaxed text-muted">
      {AI_DISCLOSURE.literacy} If you are an organisation deploying this IDE to staff, the same
      description applies to them; a summary you can circulate is in the AI usage policy that ships
      with the product's internal documents.
    </p>
  </div>
</div>
