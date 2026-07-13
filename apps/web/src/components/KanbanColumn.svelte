<script lang="ts">
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import type { PRCard, ColumnId, ColumnDef } from '@review365/api/types';
	import KanbanCard from './KanbanCard.svelte';
	import { cardDrag } from '$lib/drag-state.svelte';

	type SortMode = 'default' | 'pr-asc' | 'pr-desc' | 'age-asc' | 'age-desc';

	const SORT_OPTIONS = [
		{ value: 'default', label: 'Drag order' },
		{ value: 'pr-asc', label: 'PR Number ↑' },
		{ value: 'pr-desc', label: 'PR Number ↓' },
		{ value: 'age-asc', label: 'Oldest First' },
		{ value: 'age-desc', label: 'Newest First' }
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
		focusedCardId = null
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
	} = $props();

	let isOver = $state(false);
	let dropTargetId: string | null = $state(null);
	let dropAbove: boolean = $state(false);
	let sortOpen = $state(false);
	let sortBtnEl: HTMLButtonElement | undefined = $state();

	const activeSortLabel = $derived(
		SORT_OPTIONS.find((o) => o.value === sortMode)?.label ?? 'Sort'
	);

	function closeSortDropdown() {
		sortOpen = false;
	}

	function handleSortKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeSortDropdown();
	}

	const visibleCards = $derived(
		showArchived ? cards : cards.filter((c) => !c.archived)
	);

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
	<div class="flex items-center justify-between border-b border-panel px-4 py-3">
		<span class="text-sm font-semibold text-heading">{col.title}</span>
		<span class="flex items-center gap-2">
			<span class="rounded-full surface-raised px-2 py-0.5 text-xs text-muted"
				>{visibleCards.length}</span
			>
			<div class="relative">
				<button
					bind:this={sortBtnEl}
					onclick={() => (sortOpen = !sortOpen)}
					class="cursor-pointer rounded px-1 text-xs transition-colors {sortMode !== 'default'
						? 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300'
						: 'text-dim hover:text-muted'}"
					title={activeSortLabel}
				>
					{sortMode === 'default'
						? '⇅'
						: sortMode === 'pr-asc'
							? '#↑'
							: sortMode === 'pr-desc'
								? '#↓'
								: sortMode === 'age-asc'
									? '🕐↑'
									: '🕐↓'}
				</button>
				{#if sortOpen}
					<button
						class="fixed inset-0 z-10 cursor-default"
						onclick={closeSortDropdown}
					></button>
					<div
						class="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-control surface-raised py-1 shadow-xl"
						onkeydown={handleSortKeydown}
					>
						{#each SORT_OPTIONS as opt}
							<button
								onclick={() => {
									onSort(opt.value);
									closeSortDropdown();
								}}
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700 {opt.value === sortMode
									? 'text-blue-500 dark:text-blue-400'
									: 'text-body'}"
							>
								<span class="w-4 text-center">{opt.value === sortMode ? '✓' : ''}</span>
								<span>{opt.label}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if onColumnDragStart}
				<button
					draggable="true"
					ondragstart={(e) => {
						e.dataTransfer?.setData('application/column-id', col.id);
						e.dataTransfer!.effectAllowed = 'move';
						onColumnDragStart();
					}}
					ondragend={onColumnDragEnd}
					class="cursor-grab text-xs text-dim hover:text-muted active:cursor-grabbing"
					title="Drag to reorder"
				>
					⠿
				</button>
			{/if}
		</span>
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
					<KanbanCard {card} {onArchive} {onUnarchive} {onUpdateNote} focused={card.id === focusedCardId} />
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
