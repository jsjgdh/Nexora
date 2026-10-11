<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import Workspace from "$lib/components/Workspace.svelte";
  import PageHead from "$lib/components/PageHead.svelte";
  import { missionById } from "$lib/missions";
  import { SITE_DESCRIPTION, missionDescription, pageTitle } from "$lib/seo";

  let { data }: { data: { id: string } } = $props();

  /** `load` has already answered 404 for an unknown id, so this resolves. */
  const mission = $derived(missionById(data.id));

  /**
   * Drill mode: `?drill=<missionId>::<checkId>`, the id a practice-log record
   * carries. The workspace is the same component, so a drill cannot drift from
   * the mission it practises — only what gets recorded differs.
   *
   * Read in the browser only. This route is prerendered for every mission, and
   * a prerendered page is refused access to `url.searchParams`: a page built
   * without a query string cannot be allowed to depend on one.
   */
  const drillCheckId = $derived.by(() => {
    if (!browser) return null;
    const raw = new URLSearchParams(page.url.search).get("drill");
    if (!raw) return null;
    const [missionId, checkId] = raw.split("::");
    if (missionId !== data.id || !checkId) return null;
    return missionById(data.id)?.checks.some((c) => c.id === checkId) ? checkId : null;
  });
</script>

<!-- One page per mission in a crawler's index, and each one says which mission
     it is: the mission's own title, its own tagline plus its place on the path,
     and a canonical URL built from the same origin as the sitemap. -->
<PageHead
  title={pageTitle(mission?.title ?? data.id)}
  description={mission ? missionDescription(mission) : SITE_DESCRIPTION}
  path={`/mission/${data.id}`}
  type="article"
/>

<Workspace missionId={data.id} {drillCheckId} />
