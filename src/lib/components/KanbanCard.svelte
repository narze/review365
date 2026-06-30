<script lang="ts">
	import type { PRCard } from '$lib/types';

	let { card }: { card: PRCard } = $props();

	function handleDragStart(e: DragEvent) {
		e.dataTransfer?.setData('text/plain', card.id);
		const el = e.target as HTMLElement;
		el.classList.add('dragging');
	}

	function handleDragEnd(e: DragEvent) {
		const el = e.target as HTMLElement;
		el.classList.remove('dragging');
	}

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(hours / 24);
		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		return 'just now';
	}
</script>

<a href={card.url} target="_blank" class="card" draggable="true"
	ondragstart={handleDragStart}
	ondragend={handleDragEnd}
>
	<div class="card-repo">{card.repo}</div>
	<div class="card-title">#{card.prNumber} {card.title}</div>
	<div class="card-meta">
		<span class="card-author">
			{card.isOwnPR ? '🤖' : '👤'} {card.author}
		</span>
		<span class="card-time">{timeAgo(card.updatedAt)}</span>
	</div>
	{#if card.isOwnPR}
		<span class="own-badge">own</span>
	{/if}
</a>

<style>
	.card {
		display: block;
		background: #21262d;
		border: 1px solid #30363d;
		border-radius: 8px;
		padding: 12px;
		cursor: grab;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.15s, box-shadow 0.15s;
		position: relative;
	}
	.card:hover {
		border-color: #58a6ff;
		box-shadow: 0 0 0 1px #58a6ff33;
	}
	.card:global(.dragging) {
		opacity: 0.5;
		cursor: grabbing;
	}
	.card-repo {
		font-size: 11px;
		color: #58a6ff;
		margin-bottom: 4px;
		font-weight: 500;
	}
	.card-title {
		font-size: 13px;
		color: #f0f6fc;
		margin-bottom: 8px;
		line-height: 1.4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.card-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		color: #8b949e;
	}
	.own-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		font-size: 10px;
		background: #238636;
		color: #fff;
		padding: 1px 6px;
		border-radius: 8px;
	}
</style>
