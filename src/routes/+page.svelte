<script lang="ts">
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import type { PRCard } from '$lib/types';
	import { onMount } from 'svelte';

	let { data } = $props();

	let cards = $state<PRCard[]>(data.cards ?? []);
	let enabledRepos = $state<string[]>(data.enabledRepos ?? []);

	async function refresh() {
		try {
			const res = await fetch('/api/prs');
			if (res.ok) {
				const json = (await res.json()) as {
					cards: PRCard[];
					enabledRepos: string[];
				};
				cards = json.cards ?? [];
				enabledRepos = json.enabledRepos ?? [];
			}
		} catch {
			// ignore errors on auto-refresh
		}
	}

	async function onToggleRepo(repo: string) {
		const wasEnabled = enabledRepos.includes(repo);
		enabledRepos = wasEnabled ? enabledRepos.filter((r) => r !== repo) : [...enabledRepos, repo];
		if (wasEnabled) {
			const prefix = `pr_${repo.replace('/', '_')}_`;
			cards = cards.filter((c) => !c.id.startsWith(prefix));
		}
		await fetch('/api/board', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'toggleRepo', repo })
		});
	}

	// Auto-refresh every 30 seconds
	let interval: ReturnType<typeof setInterval>;

	onMount(() => {
		interval = setInterval(refresh, 30_000);
		return () => clearInterval(interval);
	});
</script>

<KanbanBoard {cards} {enabledRepos} {onToggleRepo} />
