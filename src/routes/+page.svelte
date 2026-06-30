<script lang="ts">
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import { onMount } from 'svelte';

	let { data } = $props();

	let cards = $state(data.cards ?? []);
	let loading = $state(false);

	// Auto-refresh every 30 seconds
	let interval: ReturnType<typeof setInterval>;

	onMount(() => {
		interval = setInterval(async () => {
			try {
				const res = await fetch('/api/prs');
				if (res.ok) {
					const json = await res.json();
					cards = json.cards ?? [];
				}
			} catch {
				// ignore errors on auto-refresh
			}
		}, 30_000);

		return () => clearInterval(interval);
	});
</script>

<KanbanBoard {cards} />
