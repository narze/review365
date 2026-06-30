<script lang="ts">
	import type { PRCard, ColumnId } from '$lib/types';
	import { COLUMNS } from '$lib/types';
	import KanbanColumn from './KanbanColumn.svelte';

	let { cards = [] }: { cards: PRCard[] } = $props();

	function cardsForColumn(columnId: ColumnId): PRCard[] {
		return cards.filter((c) => c.columnId === columnId);
	}

	async function onDrop(cardId: string, newColumn: ColumnId) {
		await fetch('/api/board', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cardId, column: newColumn })
		});
	}

	async function refresh() {
		location.reload();
	}
</script>

<div class="board-toolbar">
	<h1>Review365</h1>
	<button onclick={refresh}>🔄 Refresh</button>
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
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		background: #161b22;
		border-bottom: 1px solid #30363d;
	}
	.board-toolbar h1 {
		font-size: 20px;
		margin: 0;
		color: #f0f6fc;
	}
	.board-toolbar button {
		background: #21262d;
		border: 1px solid #30363d;
		color: #c9d1d9;
		padding: 6px 16px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
	}
	.board-toolbar button:hover {
		background: #30363d;
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
