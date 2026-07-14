<script lang="ts">
	import { tick } from 'svelte';
	import type { PRCard, Signal } from '@review365/api/types';
	import { startCardDrag, endCardDrag } from '$lib/drag-state.svelte';
	import { groupChecks } from '$lib/ci-checks';

	let {
		card,
		onArchive,
		onUnarchive,
		onUpdateNote,
		focused = false,
		onSelect,
		ciDetailsOpen = false,
		onOpenCIPopover,
		onScheduleCIPopoverClose,
		onCloseCIPopover
	}: {
		card: PRCard;
		onArchive?: (id: string) => void;
		onUnarchive?: (id: string) => void;
		onUpdateNote?: (cardId: string, note: string) => void;
		focused?: boolean;
		onSelect?: (id: string) => void;
		ciDetailsOpen?: boolean;
		onOpenCIPopover?: (card: PRCard, anchor: DOMRect) => void;
		onScheduleCIPopoverClose?: () => void;
		onCloseCIPopover?: () => void;
	} = $props();

	let expanded = $state(false);
	let ciButton = $state<HTMLButtonElement>();
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

	function openCIPopover() {
		if (ciButton) onOpenCIPopover?.(card, ciButton.getBoundingClientRect());
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

	const age = $derived(daysAgo(card.updatedAt));
	const ageBorder = $derived(
		age < 1 ? '' : age < 3 ? 'border-l-amber-600' : age < 7 ? 'border-l-orange-600' : 'border-l-red-600'
	);
</script>

<!-- Roving-tabindex focus target for keyboard board navigation; the card is
	 deliberately programmatically focusable and key-driven. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	data-card-id={card.id}
	tabindex={-1}
	class="group relative block select-none rounded-lg border border-panel surface-panel p-3 outline-none transition-colors {ageBorder} {card.archived
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
	<div class="mb-1 flex items-center text-xs font-medium text-blue-500 dark:text-blue-400">
		{card.repo}
		<span class="ml-1 text-blue-600 dark:text-blue-300">{card.platform === 'gitlab' ? '!' : '#'}{card.prNumber}</span>
		{#if card.ciStatus}
			{@const checkGroups = groupChecks(card.ciStatus.checks ?? [])}
			{@const failedCount = checkGroups.failedCount}
			{@const pendingCount = checkGroups.pendingCount}
			{@const ciIcon = {
				success: { symbol: '✓', cls: 'text-green-600 dark:text-green-400', label: 'Checks passed' },
				failure: { symbol: '✕', cls: 'text-red-600 dark:text-red-400', label: `${failedCount} checks failed` },
				pending: { symbol: '◌', cls: 'text-amber-600 dark:text-amber-400', label: 'Checks running' }
			}[card.ciStatus.state]}
			<div class="relative ml-1 inline-flex">
				<button
					bind:this={ciButton}
					type="button"
					class="inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-xs font-bold {ciIcon.cls} hover:surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
					title={ciIcon.label}
					aria-label={ciIcon.label}
					aria-expanded={ciDetailsOpen}
					onmouseenter={openCIPopover}
					onmouseleave={onScheduleCIPopoverClose}
					onclick={(event) => {
						event.stopPropagation();
						if (ciDetailsOpen) onCloseCIPopover?.();
						else openCIPopover();
					}}
				>
					{ciIcon.symbol}
					{#if card.ciStatus.state === 'failure'}
						<span class="font-normal ml-0.5">({failedCount})</span>
					{/if}
				</button>
			</div>
		{/if}
	</div>
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
		<span class="flex items-center gap-1">
			<span class={age < 1 ? 'text-faint' : age < 3 ? 'text-amber-500 dark:text-amber-400' : age < 7 ? 'text-orange-500 dark:text-orange-400' : 'text-red-500 dark:text-red-400'}>●</span>
			{timeAgo(card.updatedAt)}
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
