<script lang="ts">
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import type { PRCard, ColumnId, ColumnDef } from '@review365/api/types';
	import KanbanCard from './KanbanCard.svelte';
	import { cardDrag } from '$lib/drag-state.svelte';

	type SortMode = 'default' | 'pr-asc' | 'pr-desc' | 'age-asc' | 'age-desc';

	// `hint` spells out what the sort actually does — the label alone ("Oldest
	// first") reads ambiguously against a board where cards also carry an age.
	const SORT_OPTIONS = [
		{ value: 'default', label: 'Drag order', hint: 'as arranged', icon: '↕' },
		{ value: 'pr-asc', label: 'PR number ↑', hint: 'low → high', icon: '#' },
		{ value: 'pr-desc', label: 'PR number ↓', hint: 'high → low', icon: '#' },
		{ value: 'age-asc', label: 'Oldest first', hint: 'stale at top', icon: '🕐' },
		{ value: 'age-desc', label: 'Newest first', hint: 'fresh at top', icon: '🕐' }
	] as const;

	let {
		col,
		cards,
		onDrop,
		onReorder,
		onArchive,
		onUnarchive,
		onUpdateNote,
		showArchived = false,
		onColumnDragStart,
		onColumnDragEnd,
		sortMode = 'default',
		onSort = () => {},
		width = 300,
		focusedCardId = null,
		onSelectCard,
		ciPopoverCardId = null,
		onOpenCIPopover,
		onScheduleCIPopoverClose,
		onCloseCIPopover
	}: {
		col: ColumnDef;
		cards: PRCard[];
		onDrop: (cardId: string, column: ColumnId) => void;
		onReorder: (cardId: string, targetCardId: string | null, column: ColumnId) => void;
		onArchive?: (id: string) => void;
		onUnarchive?: (id: string) => void;
		onUpdateNote?: (cardId: string, note: string) => void;
		showArchived?: boolean;
		onColumnDragStart?: () => void;
		onColumnDragEnd?: () => void;
		sortMode?: SortMode;
		onSort?: (mode: SortMode) => void;
		width?: number;
		focusedCardId?: string | null;
		onSelectCard?: (id: string) => void;
		ciPopoverCardId?: string | null;
		onOpenCIPopover?: (card: PRCard, anchor: DOMRect) => void;
		onScheduleCIPopoverClose?: () => void;
		onCloseCIPopover?: () => void;
	} = $props();

	let isOver = $state(false);
	let dropTargetId: string | null = $state(null);
	let dropAbove: boolean = $state(false);
	let optionsOpen = $state(false);
	let panelEl: HTMLDivElement | undefined = $state();
	let optionsBtnEl: HTMLButtonElement | undefined = $state();
	let copyStatus: 'idle' | 'copied' | 'empty' | 'failed' = $state('idle');
	let copyStatusTimer: ReturnType<typeof setTimeout> | undefined;

	const activeSort = $derived(SORT_OPTIONS.find((o) => o.value === sortMode) ?? SORT_OPTIONS[0]);

	function closeOptions(refocus = false) {
		optionsOpen = false;
		if (refocus) optionsBtnEl?.focus();
	}

	// Sorting deliberately leaves the panel open: picking a sort is a comparison,
	// and reopening the panel between attempts hides the column you're judging.
	function pickSort(mode: SortMode) {
		onSort(mode);
	}

	function handleWindowPointerDown(e: PointerEvent) {
		if (!optionsOpen) return;
		const target = e.target as Node;
		if (panelEl?.contains(target) || optionsBtnEl?.contains(target)) return;
		closeOptions();
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (optionsOpen && e.key === 'Escape') closeOptions(true);
	}

	const visibleCards = $derived(
		showArchived ? cards : cards.filter((c) => !c.archived)
	);

	function resetCopyStatus() {
		if (copyStatusTimer) clearTimeout(copyStatusTimer);
		copyStatusTimer = setTimeout(() => (copyStatus = 'idle'), 2000);
	}

	async function copyVisibleCards() {
		if (visibleCards.length === 0) {
			copyStatus = 'empty';
			resetCopyStatus();
			return;
		}

		const markdown = visibleCards
			.map((card) => `- [${card.repo}#${card.prNumber}](${card.url}) - ${card.title}`)
			.join('\n');

		try {
			await navigator.clipboard.writeText(markdown);
			copyStatus = 'copied';
		} catch {
			copyStatus = 'failed';
		}
		resetCopyStatus();
	}

	// Height of the gap that opens up for the dragged card. Matches the real
	// card so surrounding cards shift exactly as far as the drop would push them.
	const gapHeight = $derived(cardDrag.height || 80);

	// Clear stale drop state when a drag ends without a drop (e.g. Escape).
	$effect(() => {
		if (!cardDrag.cardId) {
			dropTargetId = null;
			isOver = false;
		}
	});

	function isColumnDrag(e: DragEvent): boolean {
		return e.dataTransfer?.types.includes('application/column-id') ?? false;
	}

	function handleColumnDragOver(e: DragEvent) {
		if (isColumnDrag(e)) return;
		e.preventDefault();
		isOver = true;
	}

	// Must be cancelled: when the gap opens, the layout shift puts a NEW
	// element under the (possibly stationary) pointer and the browser fires
	// dragenter at it. Per the HTML DnD model an uncancelled dragenter makes
	// the body the current target, which kills dragover/drop for the column.
	function handleColumnDragEnter(e: DragEvent) {
		if (isColumnDrag(e)) return;
		e.preventDefault();
	}

	function handleColumnDragLeave(e: DragEvent) {
		const rt = e.relatedTarget as HTMLElement;
		if (!rt || !rt.closest('.column-body')) {
			isOver = false;
			dropTargetId = null;
		}
	}

	function handleColumnDrop(e: DragEvent) {
		e.preventDefault();
		isOver = false;
		const cardId = e.dataTransfer?.getData('text/plain');
		if (cardId) {
			if (dropTargetId) {
				const idx = visibleCards.findIndex((c) => c.id === dropTargetId);
				const target = dropAbove ? dropTargetId : (idx < visibleCards.length - 1 ? visibleCards[idx + 1].id : null);
				if (target === cardId) return;
				onReorder(cardId, target, col.id);
			} else {
				onReorder(cardId, null, col.id);
			}
		}
		dropTargetId = null;
	}

	function handleCardDragOver(e: DragEvent, cardId: string) {
		if (isColumnDrag(e)) return;
		e.preventDefault();
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropTargetId = cardId;
		dropAbove = (e.clientY - rect.top) < rect.height / 2;
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeydown} />

<div
	class="flex max-h-[calc(100vh-100px)] shrink-0 flex-col rounded-xl border surface-panel transition-colors {isOver
		? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
		: 'border-panel'}"
	style="width: {width}px"
	role="region"
	aria-label={col.title}
	ondragenter={handleColumnDragEnter}
	ondragover={handleColumnDragOver}
	ondragleave={handleColumnDragLeave}
	ondrop={handleColumnDrop}
>
	<div class="relative flex items-stretch border-b border-panel">
		<button
			bind:this={optionsBtnEl}
			type="button"
			onclick={() => (optionsOpen = !optionsOpen)}
			class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-tl-xl px-3 py-2 text-left transition-colors hover-surface focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500"
			aria-haspopup="dialog"
			aria-expanded={optionsOpen}
			aria-label="{col.title} column options"
		>
			<span class="min-w-0 flex-1">
				<span class="flex items-center gap-2">
					<span class="truncate text-sm font-semibold text-heading">{col.title}</span>
					<!-- sunken, not raised: the header tints to surface-raised on hover,
					     which would swallow a raised badge. -->
					<span
						class="shrink-0 rounded-full border border-panel surface-sunken px-2 py-0.5 text-xs text-muted"
					>
						{visibleCards.length}
					</span>
				</span>
				{#if copyStatus !== 'idle'}
					<span
						role="status"
						class="block truncate text-[11px] {copyStatus === 'copied'
							? 'text-green-600 dark:text-green-400'
							: 'text-amber-600 dark:text-amber-400'}"
					>
						{copyStatus === 'copied'
							? `Copied ${visibleCards.length} card${visibleCards.length === 1 ? '' : 's'} as Markdown`
							: copyStatus === 'empty'
								? 'Nothing to copy'
								: 'Copy failed'}
					</span>
				{:else if sortMode !== 'default'}
					<span class="block truncate text-[11px] text-blue-600 dark:text-blue-400">
						Sorted by {activeSort.label}
					</span>
				{/if}
			</span>
			<span
				aria-hidden="true"
				class="shrink-0 text-xs text-muted transition-transform {optionsOpen ? 'rotate-180' : ''}"
			>
				▾
			</span>
		</button>

		{#if onColumnDragStart}
			<button
				type="button"
				draggable="true"
				ondragstart={(e) => {
					e.dataTransfer?.setData('application/column-id', col.id);
					e.dataTransfer!.effectAllowed = 'move';
					onColumnDragStart();
				}}
				ondragend={onColumnDragEnd}
				class="grid w-8 shrink-0 cursor-grab place-items-center text-sm text-dim transition-colors hover:text-muted focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500 active:cursor-grabbing"
				aria-label="Reorder column"
				title="Drag to reorder column"
			>
				⠿
			</button>
		{/if}

		{#if optionsOpen}
			<div
				bind:this={panelEl}
				role="dialog"
				aria-label="{col.title} column options"
				class="absolute left-2 right-2 top-full z-30 mt-1 rounded-xl border border-control surface-panel p-3 shadow-xl"
			>
				<div class="mb-2 flex items-center justify-between">
					<span class="text-[11px] font-semibold uppercase tracking-wide text-faint">Sort</span>
					{#if sortMode !== 'default'}
						<button
							type="button"
							class="text-[11px] text-blue-600 hover:underline dark:text-blue-400"
							onclick={() => pickSort('default')}
						>
							Reset
						</button>
					{/if}
				</div>
				<div class="grid grid-cols-2 gap-1">
					{#each SORT_OPTIONS as opt}
						<button
							type="button"
							aria-pressed={opt.value === sortMode}
							onclick={() => pickSort(opt.value)}
							class="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors {opt.value ===
							sortMode
								? 'border-blue-500 bg-blue-600 text-white'
								: 'border-control text-body hover-surface'} {opt.value === 'default' ? 'col-span-2' : ''}"
						>
							<span aria-hidden="true" class="w-4 shrink-0 text-center">{opt.icon}</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate font-medium">{opt.label}</span>
								<span
									class="block truncate text-[10px] {opt.value === sortMode
										? 'text-blue-100'
										: 'text-faint'}"
								>
									{opt.hint}
								</span>
							</span>
						</button>
					{/each}
				</div>

				<div class="my-3 h-px bg-neutral-200 dark:bg-neutral-800"></div>

				<button
					type="button"
					onclick={() => {
						copyVisibleCards();
						closeOptions(true);
					}}
					class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover-surface"
				>
					<span aria-hidden="true" class="w-4 shrink-0 text-center text-sm">⧉</span>
					<span class="min-w-0 flex-1">
						<span class="block text-sm text-heading">Copy list</span>
						<span class="block text-[11px] text-faint">
							{visibleCards.length} card{visibleCards.length === 1 ? '' : 's'} as Markdown links
						</span>
					</span>
				</button>
			</div>
		{/if}
	</div>
	<div class="thin-scrollbar column-body flex flex-1 flex-col gap-2 overflow-y-auto p-2">
		{#each visibleCards as card (card.id)}
			<div role="listitem" animate:flip={{ duration: 300 }}>
				{#if dropTargetId === card.id && dropAbove && card.id !== cardDrag.cardId}
					<div
						class="drop-slot mb-2"
						style="height: {gapHeight}px"
						transition:slide={{ duration: 150 }}
					></div>
				{/if}
				<div role="presentation" ondragover={(e) => handleCardDragOver(e, card.id)}>
					<KanbanCard
						{card}
						{onArchive}
						{onUnarchive}
						{onUpdateNote}
						focused={card.id === focusedCardId}
						onSelect={onSelectCard}
						ciDetailsOpen={card.id === ciPopoverCardId}
						{onOpenCIPopover}
						{onScheduleCIPopoverClose}
						{onCloseCIPopover}
					/>
				</div>
				{#if dropTargetId === card.id && !dropAbove && card.id !== cardDrag.cardId}
					<div
						class="drop-slot mt-2"
						style="height: {gapHeight}px"
						transition:slide={{ duration: 150 }}
					></div>
				{/if}
			</div>
		{/each}
		{#if isOver && dropTargetId === null && cardDrag.cardId}
			<div
				class="drop-slot"
				style="height: {gapHeight}px"
				transition:slide={{ duration: 150 }}
			></div>
		{/if}
		{#if visibleCards.length === 0}
			<div class="py-6 text-center text-sm text-dim">No PRs</div>
		{/if}
	</div>
</div>

<style>
	.drop-slot {
		/* Purely visual: hit-testing must pass through to the column so the
		   browser keeps firing dragover (and allows drop) while the pointer
		   rests on the gap that just opened underneath it. */
		pointer-events: none;
		flex-shrink: 0;
		border-radius: 0.5rem;
		border: 2px dashed rgba(59, 130, 246, 0.55);
		background: rgba(59, 130, 246, 0.08);
	}
</style>
