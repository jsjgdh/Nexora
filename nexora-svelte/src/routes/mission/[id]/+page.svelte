<script lang="ts">
  import Workspace from "$lib/components/Workspace.svelte";

  let { data }: { data: { id: string } } = $props();
</script>

<Workspace missionId={data.id} />
