<script lang="ts">
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';

	let { data } = $props();
</script>

<KanbanBoard cards={data.cards ?? []} />
