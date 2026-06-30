<script lang="ts">
	import type { PRCard, Signal } from '@review365/api/types';

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

	function daysAgo(dateStr: string): number {
		return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
	}

	const signalBadge = {
		'pr-open': { label: 'open', cls: 'bg-blue-900/60 text-blue-300' },
		'review-requested': { label: 'review', cls: 'bg-amber-900/60 text-amber-300' },
		'own-pr': { label: 'own', cls: 'bg-green-900/60 text-green-300' },
		'draft': { label: 'draft', cls: 'bg-zinc-800 text-zinc-400' },
		'merged': { label: 'merged', cls: 'bg-purple-900/60 text-purple-300' },
		'closed': { label: 'closed', cls: 'bg-red-900/60 text-red-300' },
		'approved': { label: 'approved', cls: 'bg-emerald-900/60 text-emerald-300' },
		'changes-requested': { label: 'changes', cls: 'bg-red-900/60 text-red-300' }
	} satisfies Record<Signal, { label: string; cls: string }>;

	const age = $derived(daysAgo(card.updatedAt));
	const ageBorder = $derived(
		age < 1 ? '' : age < 3 ? 'border-l-amber-600' : age < 7 ? 'border-l-orange-600' : 'border-l-red-600'
	);
</script>

<div
	class="group block rounded-lg border border-neutral-800 bg-neutral-900 p-3 transition-colors relative select-none {ageBorder} {card.archived
		? 'opacity-50'
		: 'cursor-grab hover:border-blue-500 hover:shadow-[0_0_0_1px_rgba(88,166,255,0.2)]'}"
	draggable={!card.archived}
	ondragstart={handleDragStart}
	ondragend={handleDragEnd}
	role="listitem"
>
	<div class="mb-1 text-xs font-medium text-blue-400">{card.repo}</div>
	<div
		class="mb-1.5 text-sm text-neutral-100 {expanded ? '' : 'line-clamp-2'} cursor-pointer"
		role="button"
		tabindex="0"
		onclick={handleTitleClick}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') handleTitleClick();
		}}
	>
		<span class="font-semibold text-blue-300">#{card.prNumber}</span> {card.title}
	</div>
	{#if card.signals.length > 0}
		<div class="mb-1.5 flex flex-wrap gap-1">
			{#each card.signals as signal}
				{@const b = signalBadge[signal]}
				{#if b}
					<span class="rounded px-1.5 py-0.5 text-[10px] leading-none {b.cls}">
						{b.label}
					</span>
				{/if}
			{/each}
		</div>
	{/if}
	<div class="flex items-center justify-between text-xs text-neutral-400">
		<span>{card.isOwnPR ? '🤖' : '👤'} {card.author}</span>
		<span class="flex items-center gap-1">
			<span class={age < 1 ? 'text-neutral-500' : age < 3 ? 'text-amber-400' : age < 7 ? 'text-orange-400' : 'text-red-400'}>●</span>
			{timeAgo(card.updatedAt)}
		</span>
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
