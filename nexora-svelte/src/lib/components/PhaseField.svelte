<script lang="ts">
  import { COURSES } from "$lib/content/site";
  import { reduced } from "$lib/motion";
  import type { PhasePick } from "$lib/three/field";

  /* The curriculum as a field.
   *
   * Eighty phases, one point each, laid out as three arms of one shape. It is
   * the same data the plate of lights and the ledger further down are made of,
   * read a third way, and the third reading is the only one that shows how the
   * three courses sit against each other rather than how many phases each one
   * has.
   *
   * The rules this component is built under are the ones the rest of the page
   * is built under, and they are why the canvas is not the content.
   *
   *   1. The canvas is decoration and says so. It is `aria-hidden`, and every
   *      fact it shows is also in the DOM beside it: the readout names the
   *      phase under the pointer, and the list below the canvas names all
   *      eighty. A reader who never sees the picture still gets the whole
   *      curriculum, which is the same promise the plate of lights makes.
   *   2. The picture is optional in every direction. Without WebGL, without
   *      the script, or without the renderer loading, what is left is the list,
   *      and the list is in the server-rendered document rather than added to
   *      it afterwards. The list is the field's real estate; the canvas is
   *      drawn on top of it.
   *   3. Nothing moves for a reader who asked for less motion. Under reduced
   *      motion the renderer is never fetched at all: the same eighty points
   *      are projected onto the sheet in two dimensions and drawn once, so the
   *      field is still there and it is still still.
   *   4. The renderer is never in the first payload. It is imported at the
   *      moment the canvas is both wanted and on screen, so a reader who never
   *      scrolls to the courses section never downloads a 3D library.
   *
   * `data-phase-field` and `data-phase-readout` are hooks for the sweep, so it
   * can ask what the field is saying without matching on the copy, which
   * changes whenever the curriculum does. */

  type Props = {
    /** Called when a phase is clicked, with the phase the field picked. */
    onselect?: (pick: PhasePick) => void;
  };

  let { onselect }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let picked = $state<PhasePick | null>(null);

  const totals = $derived.by(() => {
    const all = COURSES.reduce((n, course) => n + course.phases.length, 0);
    const free = COURSES.reduce(
      (n, course) => n + course.phases.filter(([, , tier]) => tier === "free").length,
      0
    );
    return { all, free, pro: all - free };
  });

  /** The name of the phase under the pointer, in the panel's own line. */
  const readout = $derived(
    picked
      ? `${String(picked.index + 1).padStart(2, "0")} · ${picked.title} · ${picked.courseTitle} · ${picked.tier}`
      : `${totals.all} phases on three arms of one spine · point at a point to name a phase`
  );

  function report(pick: PhasePick | null): void {
    picked = pick;
  }

  function choose(pick: PhasePick): void {
    picked = pick;
    onselect?.(pick);
  }

  $effect(() => {
    const element = canvas;
    if (!element) return;

    let disposed = false;
    let stopped: (() => void) | null = null;

    /* The field waits to be wanted and to be seen. A renderer mounted while
     * it is off screen is a renderer burning a battery for a picture nobody is
     * looking at, and a browser that cannot draw at all should not be asked
     * to try. */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || disposed || stopped) continue;
          void boot();
        }
      },
      { threshold: 0 }
    );

    async function boot(): Promise<void> {
      try {
        const field = await import("$lib/three/field");
        if (disposed) return;

        if (reduced()) {
          // The same points, in two dimensions, drawn once. The renderer is
          // never asked for, so it is never downloaded.
          stopped = field.drawPhaseFieldFlat(element, { onpick: report, onselect: choose });
          return;
        }

        if (!field.supportsWebGL()) return;

        const handle = await field.mountPhaseField(element, {
          onpick: report,
          onselect: choose,
        });
        if (disposed) {
          handle.destroy();
          return;
        }
        stopped = handle.destroy;
      } catch {
        // A renderer that will not load is not a reason to leave the reader
        // without the curriculum. The list below the canvas is the field's
        // other half and it is already in the document.
        stopped = null;
      }
    }

    observer.observe(element);

    return () => {
      disposed = true;
      observer.disconnect();
      stopped?.();
    };
  });
</script>

<section class="border-t border-rule-strong" data-phase-field>
  <div class="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule px-5 py-4">
    <p class="stamp text-faint">the shipped curriculum, in space</p>
    <p class="num text-[11.5px] text-faint">
      {totals.all} phases · {totals.free} open on free
    </p>
  </div>

  <!-- The readout line: the name of the phase under the pointer, or the count
       of what the field holds. It is a pointer convenience and a
       screen-reader summary at once, so the panel is never mute. -->
  <p class="num border-b border-rule px-5 py-2.5 text-[11.5px] text-faint" data-phase-readout>
    {readout}
  </p>

  <div class="px-5 py-6">
    <canvas
      bind:this={canvas}
      aria-hidden="true"
      class="block h-[26rem] w-full border border-rule bg-ground"
    ></canvas>
    <p class="mt-3 max-w-[70ch] text-[12.5px] leading-relaxed text-faint">
      One point per shipped phase, on three arms of one spine. The open phases are green and the
      ones that open with Pro are amber. Move the pointer to name a phase, or click one to open
      its course in the ledger below.
    </p>
  </div>

  <!-- The list. This is the field without the picture, and it is in the
       server-rendered document, so it is there for a reader with no script, no
       WebGL, or no patience for a canvas. Every course, every phase, and every
       count, spelled out. -->
  <div class="border-t border-rule px-5 py-5">
    {#each COURSES as course (course.slug)}
      {@const free = course.phases.filter(([, , tier]) => tier === "free").length}
      <div class="grid gap-2 py-4 first:pt-0 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-6">
        <p class="text-[13.5px] font-semibold text-ink">
          {course.title}
          <span class="num ml-2 text-[11.5px] text-faint">
            {course.phases.length} phases · {free} open on free
          </span>
        </p>
        <p class="text-[12.5px] leading-relaxed text-muted">
          {course.phases.map(([, title]) => title).join(", ")}
        </p>
      </div>
    {/each}
  </div>
</section>
