<script lang="ts">
	import type { PRCard, ColumnId } from '$lib/types';
	import KanbanCard from './KanbanCard.svelte';

	let {
		col,
		cards,
		onDrop
	}: {
		col: { id: ColumnId; title: string };
		cards: PRCard[];
		onDrop: (cardId: string, column: ColumnId) => void;
	} = $props();

	let isOver = $state(false);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isOver = true;
	}

	function handleDragLeave() {
		isOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isOver = false;
		const cardId = e.dataTransfer?.getData('text/plain');
		if (cardId) onDrop(cardId, col.id);
	}
</script>

<div
	class="column"
	class:over={isOver}
	role="region"
	aria-label={col.title}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<div class="column-header">
		<span class="column-title">{col.title}</span>
		<span class="column-count">{cards.length}</span>
	</div>
	<div class="column-body">
		{#each cards as card (card.id)}
			<KanbanCard {card} />
		{/each}
		{#if cards.length === 0}
			<div class="empty">No PRs</div>
		{/if}
	</div>
</div>

<style>
	.column {
		flex: 0 0 300px;
		background: #161b22;
		border: 1px solid #30363d;
		border-radius: 12px;
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 100px);
		transition: border-color 0.2s, background-color 0.2s;
	}
	.column.over {
		border-color: #58a6ff;
		background: #1a2332;
	}
	.column-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid #21262d;
	}
	.column-title {
		font-weight: 600;
		font-size: 14px;
		color: #f0f6fc;
	}
	.column-count {
		background: #21262d;
		color: #8b949e;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 12px;
	}
	.column-body {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.empty {
		color: #484f58;
		font-size: 13px;
		text-align: center;
		padding: 24px;
	}
</style>
