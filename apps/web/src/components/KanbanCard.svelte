<script lang="ts">
	import type { PRCard } from '@review365/api/types';

	let {
		card,
		onArchive,
		onUnarchive
	}: {
		card: PRCard;
		onArchive?: (id: string) => void;
		onUnarchive?: (id: string) => void;
	} = $props();

	let expanded = $state(false);
	let didDrag = false;

	function handleDragStart(e: DragEvent) {
		didDrag = false;
		e.dataTransfer?.setData('text/plain', card.id);
		const el = e.target as HTMLElement;
		el.classList.add('dragging');
	}

	function handleDragEnd(e: DragEvent) {
		didDrag = true;
		const el = e.target as HTMLElement;
		el.classList.remove('dragging');
	}

	function handleTitleClick() {
		if (didDrag) return;
		expanded = !expanded;
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

<div
	class="group block rounded-lg border bg-neutral-900 p-3 transition-colors relative select-none {card.archived
		? 'border-neutral-800 opacity-50'
		: 'border-neutral-800 cursor-grab hover:border-blue-500 hover:shadow-[0_0_0_1px_rgba(88,166,255,0.2)]'}"
	draggable={!card.archived}
	ondragstart={handleDragStart}
	ondragend={handleDragEnd}
	role="listitem"
>
	<div class="mb-1 text-xs font-medium text-blue-400">{card.repo}</div>
	<div
		class="mb-2 text-sm text-neutral-100 {expanded ? '' : 'line-clamp-2'} cursor-pointer"
		role="button"
		tabindex="0"
		onclick={handleTitleClick}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') handleTitleClick();
		}}
	>
		<span class="font-semibold text-blue-300">#{card.prNumber}</span> {card.title}
	</div>
	<div class="flex items-center justify-between text-xs text-neutral-400">
		<span>{card.isOwnPR ? '🤖' : '👤'} {card.author}</span>
		<span>{timeAgo(card.updatedAt)}</span>
	</div>
	<a
		href={card.url}
		target="_blank"
		class="absolute right-2 top-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-700 hover:text-neutral-200 group-hover:opacity-100"
		title="Open PR"
		onclick={(e) => e.stopPropagation()}
	>
		↗️
	</a>
	{#if card.isOwnPR}
		<span
			class="absolute right-2 top-7 rounded bg-green-600 px-1.5 py-0.5 text-[10px] text-white"
		>own</span
		>
	{/if}
	{#if onArchive && !card.archived}
		<button
			class="absolute bottom-2 right-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-700 hover:text-neutral-200 group-hover:opacity-100"
			title="Archive"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onArchive(card.id);
			}}
		>📦</button>
	{/if}
	{#if onUnarchive && card.archived}
		<button
			class="absolute bottom-2 right-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
			title="Unarchive"
			onclick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onUnarchive(card.id);
			}}
		>↩️</button>
	{/if}
</div>

<style>
	:global(.dragging) {
		opacity: 0.5;
		cursor: grabbing;
	}
</style>
