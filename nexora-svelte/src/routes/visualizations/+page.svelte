<script lang="ts">
  import PageHead from "$lib/components/PageHead.svelte";
  import VizPlayer from "$lib/components/VizPlayer.svelte";
  import ArrayView from "$lib/components/viz/ArrayView.svelte";
  import SortingView from "$lib/components/viz/SortingView.svelte";
  import LinkedListView from "$lib/components/viz/LinkedListView.svelte";
  import BstView from "$lib/components/viz/BstView.svelte";
  import ExecView from "$lib/components/viz/ExecView.svelte";
  import MemoryView from "$lib/components/viz/MemoryView.svelte";
  import FlexPlay from "$lib/components/viz/FlexPlay.svelte";
  import { arrayGet, arrayPop, arrayPush, arraySet, type ArrayFrame } from "$lib/viz/array";
  import { bubbleFrames } from "$lib/viz/sorting";
  import {
    listAppend,
    listBuild,
    listDeleteAt,
    listInsertAt,
    listPrepend,
  } from "$lib/viz/linkedlist";
  import { bstInsertAll, bstSearch } from "$lib/viz/bst";
  import { GO_ADD_LINES, goAddOneDemo, type ExecFrame } from "$lib/viz/exec";
  import { goShareDemo, goSliceDemo, type MemFrame } from "$lib/viz/memory";
  import type { SortFrame } from "$lib/viz/sorting";
  import type { ListFrame } from "$lib/viz/linkedlist";
  import type { BstFrame } from "$lib/viz/bst";

  const ARR = [2, 5, 1, 8];
  let arrayFrames = $state(arrayGet(ARR, 2));
  let sortFrames = $state(bubbleFrames([3, 1, 4, 2]));

  const listBase = listBuild([4, 9])[0];
  let listFrames = $state(listAppend(listBase, 2));

  const treeBuilt = bstInsertAll([5, 3, 7, 2, 4]);
  const treeFinal = treeBuilt[treeBuilt.length - 1];
  let bstFrames = $state(treeBuilt);

  const addOne = goAddOneDemo();
  let memFrames = $state(goSliceDemo());

  function demoBtn(): string {
    return "rounded-md border border-rule px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent";
  }
</script>

<PageHead
  title="See how it moves — data structure visualizations"
  description="Step through arrays, sorting, linked lists, trees, memory, and flexbox one frame at a time. Every step narrates itself."
  path="/visualizations"
/>

<div class="mx-auto max-w-3xl px-4 py-6 sm:py-8">
  <p class="text-xs font-bold tracking-widest text-accent uppercase">Visualizations</p>
  <h1 class="mt-1 text-2xl font-bold sm:text-3xl">See how it moves.</h1>
  <p class="mt-2 max-w-xl text-sm leading-relaxed text-muted">
    Reading about a data structure is not the same as watching one work. Each demo below steps
    through the real operation one frame at a time — press play or step yourself. Every step is
    narrated, so nothing here depends on color alone.
  </p>

  <section aria-labelledby="viz-array" class="mt-8">
    <h2 id="viz-array" class="text-lg font-bold">Arrays: the indexed shelf</h2>
    <p class="mt-1 text-sm text-muted">
      Values side by side, each with an address. Reading touches one cell; writing replaces one;
      push and pop work the ends.
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Array demos">
      <button type="button" class={demoBtn()} onclick={() => (arrayFrames = arrayGet(ARR, 2))}>Read index 2</button>
      <button type="button" class={demoBtn()} onclick={() => (arrayFrames = arraySet(ARR, 1, 7))}>Write index 1</button>
      <button type="button" class={demoBtn()} onclick={() => (arrayFrames = arrayPush(ARR, 9))}>Push 9</button>
      <button type="button" class={demoBtn()} onclick={() => (arrayFrames = arrayPop(ARR))}>Pop</button>
    </div>
    <div class="mt-3">
      <VizPlayer frames={arrayFrames} title="Array operations">
        {#snippet children(f)}
          <ArrayView frame={f as ArrayFrame} />
        {/snippet}
      </VizPlayer>
    </div>
  </section>

  <section aria-labelledby="viz-sorting" class="mt-10">
    <h2 id="viz-sorting" class="text-lg font-bold">Sorting: bubble sort, exposed</h2>
    <p class="mt-1 text-sm text-muted">
      Neighbor pairs compare; the larger bubbles right. Watch the sorted suffix grow one cell per
      pass — that is the whole algorithm.
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Sorting demos">
      <button type="button" class={demoBtn()} onclick={() => (sortFrames = bubbleFrames([3, 1, 4, 2]))}>Jumbled</button>
      <button type="button" class={demoBtn()} onclick={() => (sortFrames = bubbleFrames([5, 4, 3, 2, 1]))}>Reversed</button>
      <button type="button" class={demoBtn()} onclick={() => (sortFrames = bubbleFrames([1, 2, 4, 3, 5]))}>Nearly sorted</button>
    </div>
    <div class="mt-3">
      <VizPlayer frames={sortFrames} title="Bubble sort">
        {#snippet children(f)}
          <SortingView frame={f as SortFrame} />
        {/snippet}
      </VizPlayer>
    </div>
  </section>

  <section aria-labelledby="viz-list" class="mt-10">
    <h2 id="viz-list" class="text-lg font-bold">Linked lists: chained boxes</h2>
    <p class="mt-1 text-sm text-muted">
      Nodes hold a value and the address of the next node. Inserting rewires two pointers; nothing
      else moves — compare that with an array shift.
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Linked list demos">
      <button type="button" class={demoBtn()} onclick={() => (listFrames = listAppend(listBase, 2))}>Append 2</button>
      <button type="button" class={demoBtn()} onclick={() => (listFrames = listPrepend(listBase, 7))}>Prepend 7</button>
      <button type="button" class={demoBtn()} onclick={() => (listFrames = listInsertAt(listBase, 1, 6))}>Insert 6 at 1</button>
      <button type="button" class={demoBtn()} onclick={() => (listFrames = listDeleteAt(listBase, 0))}>Delete head</button>
    </div>
    <div class="mt-3">
      <VizPlayer frames={listFrames} title="Linked list operations">
        {#snippet children(f)}
          <LinkedListView frame={f as ListFrame} />
        {/snippet}
      </VizPlayer>
    </div>
  </section>

  <section aria-labelledby="viz-bst" class="mt-10">
    <h2 id="viz-bst" class="text-lg font-bold">Binary search trees: decide at every node</h2>
    <p class="mt-1 text-sm text-muted">
      Smaller left, larger or equal right. Searching halves the remaining tree per step — count the
      comparisons and feel the logarithm.
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Binary search tree demos">
      <button type="button" class={demoBtn()} onclick={() => (bstFrames = treeBuilt)}>Insert 5 · 3 · 7 · 2 · 4</button>
      <button type="button" class={demoBtn()} onclick={() => (bstFrames = bstSearch(treeFinal, 4))}>Search 4</button>
      <button type="button" class={demoBtn()} onclick={() => (bstFrames = bstSearch(treeFinal, 6))}>Search 6 (miss)</button>
    </div>
    <div class="mt-3">
      <VizPlayer frames={bstFrames} title="Binary search tree">
        {#snippet children(f)}
          <BstView frame={f as BstFrame} />
        {/snippet}
      </VizPlayer>
    </div>
  </section>

  <section aria-labelledby="viz-exec" class="mt-10">
    <h2 id="viz-exec" class="text-lg font-bold">Execution: where variables live</h2>
    <p class="mt-1 text-sm text-muted">
      A function call pushes a frame; arguments arrive as copies; returning pops the frame. Follow
      the highlighted line — the stack beside it is the truth.
    </p>
    <div class="mt-3">
      <VizPlayer frames={addOne.frames} title="A call, a copy, a return">
        {#snippet children(f)}
          <ExecView lines={GO_ADD_LINES} frame={f as ExecFrame} />
        {/snippet}
      </VizPlayer>
    </div>
  </section>

  <section aria-labelledby="viz-memory" class="mt-10">
    <h2 id="viz-memory" class="text-lg font-bold">Memory: headers point, arrays hold</h2>
    <p class="mt-1 text-sm text-muted">
      A slice is a small header over a shared heap array. Appending past capacity reallocates;
      copying the slice never copies the values.
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Memory demos">
      <button type="button" class={demoBtn()} onclick={() => (memFrames = goSliceDemo())}>Append past capacity</button>
      <button type="button" class={demoBtn()} onclick={() => (memFrames = goShareDemo())}>Copy shares the array</button>
    </div>
    <div class="mt-3">
      <VizPlayer frames={memFrames} title="Stack and heap">
        {#snippet children(f)}
          <MemoryView frame={f as MemFrame} />
        {/snippet}
      </VizPlayer>
    </div>
  </section>

  <section aria-labelledby="viz-flex" class="mt-10">
    <h2 id="viz-flex" class="text-lg font-bold">Flexbox: move it yourself</h2>
    <p class="mt-1 text-sm text-muted">
      No steps here — direct manipulation. Change a property and watch the container and its exact
      CSS move together.
    </p>
    <div class="mt-3">
      <FlexPlay />
    </div>
  </section>
</div>
