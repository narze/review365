<script lang="ts">
	import { tick } from 'svelte';
	import type { PRCard, Signal } from '@review365/api/types';
	import { startCardDrag, endCardDrag } from '$lib/drag-state.svelte';

	let {
		card,
		slaWarningDays = 3,
		slaCriticalDays = 7,
		onArchive,
		onUnarchive,
		onUpdateNote,
		focused = false,
		onSelect
	}: {
		card: PRCard;
		slaWarningDays?: number;
		slaCriticalDays?: number;
		onArchive?: (id: string) => void;
		onUnarchive?: (id: string) => void;
		onUpdateNote?: (cardId: string, note: string) => void;
		focused?: boolean;
		onSelect?: (id: string) => void;
	} = $props();

	let expanded = $state(false);
	let didDrag = false;
	let editingNote = $state(false);
	let noteDraft = $state('');
	let noteInput: HTMLInputElement | undefined = $state();

	function handleDragStart(e: DragEvent) {
		if (editingNote) {
			e.preventDefault();
			return;
		}
		didDrag = false;
		e.dataTransfer?.setData('text/plain', card.id);
		const el = e.target as HTMLElement;
		startCardDrag(card.id, el.offsetHeight);
		el.classList.add('dragging');
	}

	function handleDragEnd(e: DragEvent) {
		didDrag = true;
		endCardDrag();
		const el = e.target as HTMLElement;
		el.classList.remove('dragging');
	}

	function handleTitleClick() {
		if (didDrag) return;
		expanded = !expanded;
	}

	async function startEditNote() {
		if (!onUpdateNote) return;
		editingNote = true;
		noteDraft = card.note ?? '';
		await tick();
		noteInput?.focus();
	}

	// Keys that act on the focused card. Only the DOM-focused card receives these;
	// arrow navigation is handled at the board level.
	function handleCardKeydown(e: KeyboardEvent) {
		if (editingNote || card.archived) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			window.open(card.url, '_blank', 'noopener');
		} else if (e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			expanded = !expanded;
		} else if ((e.key === 'n' || e.key === 'N') && onUpdateNote) {
			e.preventDefault();
			e.stopPropagation();
			startEditNote();
		}
	}

	function saveNote() {
		editingNote = false;
		onUpdateNote?.(card.id, noteDraft.trim());
	}

	function cancelNote() {
		editingNote = false;
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
		'pr-open': { label: 'open', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300' },
		'review-requested': { label: 'review', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' },
		'own-pr': { label: 'own', cls: 'bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-300' },
		'draft': { label: 'draft', cls: 'bg-neutral-200 text-neutral-600 dark:bg-zinc-800 dark:text-zinc-400' },
		'merged': { label: 'merged', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300' },
		'closed': { label: 'closed', cls: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300' },
		'approved': { label: 'approved', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300' },
		'changes-requested': { label: 'changes', cls: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-300' }
	} satisfies Record<Signal, { label: string; cls: string }>;

	// SLA age: days since the EARLIER of firstSeenAt (board-side) or updatedAt
	// (platform-side). Whichever is older represents when the reviewer became
	// responsible. Falls back to updatedAt for legacy cards without firstSeenAt.
	function earliestTimestamp(firstSeen: string | undefined, updated: string): number {
		const updatedMs = new Date(updated).getTime();
		if (!firstSeen) return updatedMs;
		return Math.min(updatedMs, new Date(firstSeen).getTime());
	}

	const slaAge = $derived(
		Math.max(0, Math.floor((Date.now() - earliestTimestamp(card.firstSeenAt, card.updatedAt)) / 86_400_000))
	);
	type SlaLevel = 'fresh' | 'warning' | 'critical';
	const slaLevel = $derived<SlaLevel>(
		slaAge >= slaCriticalDays ? 'critical' : slaAge >= slaWarningDays ? 'warning' : 'fresh'
	);
	const slaStyles: Record<SlaLevel, { border: string; bg: string; badge: string; label: string }> = {
		fresh: {
			border: '',
			bg: '',
			badge: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
			label: ''
		},
		warning: {
			border: 'border-l-amber-500',
			bg: 'bg-amber-50/60 dark:bg-amber-950/20',
			badge: 'bg-amber-200 text-amber-900 dark:bg-amber-900/70 dark:text-amber-200',
			label: '⚠'
		},
		critical: {
			border: 'border-l-red-500',
			bg: 'bg-red-50/70 dark:bg-red-950/25',
			badge: 'bg-red-200 text-red-900 dark:bg-red-900/70 dark:text-red-200',
			label: '🚨'
		}
	};
</script>

<!-- Roving-tabindex focus target for keyboard board navigation; the card is
	 deliberately programmatically focusable and key-driven. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	data-card-id={card.id}
	tabindex={-1}
	class="group relative block select-none rounded-lg border border-panel surface-panel p-3 outline-none transition-colors {slaStyles[slaLevel].border} {slaStyles[slaLevel].bg} {card.archived
		? 'opacity-50'
		: 'cursor-grab hover:border-blue-500 hover:shadow-[0_0_0_1px_rgba(88,166,255,0.2)]'} {focused
		? 'ring-2 ring-blue-500'
		: ''}"
	draggable={!card.archived}
	ondragstart={handleDragStart}
	ondragend={handleDragEnd}
	onkeydown={handleCardKeydown}
	onclick={() => onSelect?.(card.id)}
	role="listitem"
>
	<div class="mb-1 text-xs font-medium text-blue-500 dark:text-blue-400">{card.repo} <span class="text-blue-600 dark:text-blue-300">{card.platform === 'gitlab' ? '!' : '#'}{card.prNumber}</span></div>
	<div
		class="mb-1.5 text-sm text-heading {expanded ? '' : 'line-clamp-2'} cursor-pointer"
		role="button"
		tabindex="0"
		onclick={handleTitleClick}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') handleTitleClick();
		}}
	>
		{card.title}
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
	{#if onUpdateNote}
		{#if editingNote}
			<input
				bind:this={noteInput}
				type="text"
				class="input-field mb-1.5 w-full px-2 py-1 text-xs placeholder:text-dim"
				bind:value={noteDraft}
				maxlength={200}
				placeholder="Add a note..."
				draggable="false"
				ondragstart={(e) => e.preventDefault()}
				onmousedown={(e) => e.stopPropagation()}
				onkeydown={(e) => {
					if (e.key === 'Enter') saveNote();
					if (e.key === 'Escape') cancelNote();
					e.stopPropagation();
				}}
				onblur={saveNote}
				onclick={(e) => e.stopPropagation()}
			/>
		{:else if card.note}
			<button
				class="mb-1.5 w-full text-left text-xs italic text-muted hover:text-body"
				onmousedown={(e) => e.stopPropagation()}
				onclick={(e) => { e.stopPropagation(); startEditNote(); }}
				title="Click to edit"
			>
				{card.note}
			</button>
		{:else}
			<button
				class="mb-1.5 w-full text-left text-xs italic text-dim hover:text-faint"
				onmousedown={(e) => e.stopPropagation()}
				onclick={(e) => { e.stopPropagation(); startEditNote(); }}
			>
				Add note...
			</button>
		{/if}
	{/if}
	<div class="flex items-center justify-between text-xs text-muted">
		<span>{card.isOwnPR ? '🤖' : '👤'} {card.author}</span>
		<span class="flex items-center gap-1.5">
			<span
				class="rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none {slaStyles[slaLevel].badge}"
				title={`First seen ${card.firstSeenAt ? timeAgo(card.firstSeenAt) : 'unknown'} · PR updated ${timeAgo(card.updatedAt)}`}
			>
				{slaStyles[slaLevel].label} {slaAge}d
			</span>
		</span>
	</div>
	<a
		href={card.url}
		target="_blank"
		class="absolute right-2 top-2 rounded surface-raised px-1.5 py-0.5 text-[10px] text-muted opacity-0 transition-opacity hover:bg-neutral-200 hover:text-body group-hover:opacity-100 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
		title="Open PR"
		onclick={(e) => e.stopPropagation()}
	>
		↗️
	</a>
	{#if onArchive && !card.archived}
		<button
			class="absolute bottom-2 right-2 rounded surface-raised px-1.5 py-0.5 text-[10px] text-muted opacity-0 transition-opacity hover:bg-neutral-200 hover:text-body group-hover:opacity-100 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
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
			class="absolute bottom-2 right-2 rounded surface-raised px-1.5 py-0.5 text-[10px] text-muted hover:bg-neutral-200 hover:text-body dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
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
