<script lang="ts">
	import type { PRCard, ColumnId } from '$lib/types';
	import { COLUMNS } from '$lib/types';
	import KanbanColumn from './KanbanColumn.svelte';

	let { cards = [] }: { cards: PRCard[] } = $props();

	function cardsForColumn(columnId: ColumnId): PRCard[] {
		return cards.filter((c) => c.columnId === columnId);
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
	<span class="subtitle">{cards.length} PRs across {COLUMNS.length} columns</span>
</div>

<div class="kanban-board">
	{#each COLUMNS as col}
		<KanbanColumn
			{col}
			cards={cardsForColumn(col.id)}
			{onDrop}
		/>
	{/each}
</div>

<style>
	.board-toolbar {
		display: flex;
		align-items: baseline;
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
</style>
