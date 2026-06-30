<script lang="ts">
	import type { PRCard, ColumnId } from '$lib/types';
	import { COLUMNS } from '$lib/types';
	import KanbanColumn from './KanbanColumn.svelte';
	import RepoFilter from './RepoFilter.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	let {
		cards = [],
		enabledRepos = [],
		onToggleRepo
	}: {
		cards: PRCard[];
		enabledRepos: string[];
		onToggleRepo: (repo: string) => void;
	} = $props();

	const repoCounts = $derived(
		(() => {
			const m = new SvelteMap<string, number>();
			for (const c of cards) m.set(c.repo, (m.get(c.repo) ?? 0) + 1);
			return m;
		})()
	);

	const filteredCards = $derived(
		enabledRepos.length === 0 ? [] : cards.filter((c) => enabledRepos.includes(c.repo))
	);

	function cardsForColumn(columnId: ColumnId): PRCard[] {
		return filteredCards.filter((c) => c.columnId === columnId);
	}

	async function onDrop(cardId: string, newColumn: ColumnId) {
		// Optimistic update
		const idx = cards.findIndex((c) => c.id === cardId);
		if (idx >= 0) cards[idx] = { ...cards[idx], columnId: newColumn };
		cards = cards;

		await fetch('/api/board', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cardId, column: newColumn })
		});
	}
</script>

<div class="board-toolbar">
	<h1>Review365</h1>
	<RepoFilter {enabledRepos} {repoCounts} onToggle={onToggleRepo} />
	<span class="subtitle">
		{enabledRepos.length === 0
			? 'Select repos to view →'
			: `${filteredCards.length} of ${cards.length} PRs across ${COLUMNS.length} columns`}
	</span>
</div>

{#if enabledRepos.length === 0}
	<div class="empty-board">
		<div class="empty-icon">📁</div>
		<div class="empty-text">No repos selected</div>
		<div class="empty-hint">
			Click <strong>Repos</strong> above and search to add repos to your watchlist.
		</div>
	</div>
{:else}
	<div class="kanban-board">
		{#each COLUMNS as col (col.id)}
			<KanbanColumn {col} cards={cardsForColumn(col.id)} {onDrop} />
		{/each}
	</div>
{/if}

<style>
	.board-toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 24px;
		background: #161b22;
		border-bottom: 1px solid #30363d;
	}
	.board-toolbar h1 {
		font-size: 20px;
		margin: 0;
		color: #f0f6fc;
	}
	.subtitle {
		font-size: 13px;
		color: #8b949e;
	}
	.kanban-board {
		display: flex;
		gap: 16px;
		padding: 24px;
		overflow-x: auto;
		min-height: calc(100vh - 65px);
		align-items: flex-start;
	}
	.empty-board {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 80px 24px;
		color: #6e7681;
	}
	.empty-icon {
		font-size: 48px;
		margin-bottom: 12px;
		opacity: 0.5;
	}
	.empty-text {
		font-size: 18px;
		color: #8b949e;
		margin-bottom: 8px;
	}
	.empty-hint {
		font-size: 13px;
	}
	.empty-hint strong {
		color: #58a6ff;
	}
</style>
