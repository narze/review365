<script lang="ts">
	import { flip } from 'svelte/animate';
	import type { PRCard, ColumnId, ColumnDef } from '@review365/api/types';
	import KanbanCard from './KanbanCard.svelte';

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
		onSort = () => {}
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

	function handleColumnDragOver(e: DragEvent) {
		e.preventDefault();
		isOver = true;
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
		e.preventDefault();
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropTargetId = cardId;
		dropAbove = (e.clientY - rect.top) < rect.height / 2;
	}

	function handleCardDragLeave() {}
</script>

<div
	class="flex max-h-[calc(100vh-100px)] w-[300px] flex-col rounded-xl border bg-neutral-900 transition-colors {isOver
		? 'border-blue-500 bg-blue-950/30'
		: 'border-neutral-800'}"
	role="region"
	aria-label={col.title}
	ondragover={handleColumnDragOver}
	ondragleave={handleColumnDragLeave}
	ondrop={handleColumnDrop}
>
	<div class="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
		<span class="text-sm font-semibold text-neutral-100">{col.title}</span>
		<span class="flex items-center gap-2">
			<span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
				>{visibleCards.length}</span
			>
			<div class="relative">
				<button
					bind:this={sortBtnEl}
					onclick={() => (sortOpen = !sortOpen)}
					class="cursor-pointer rounded px-1 text-xs transition-colors {sortMode !== 'default'
						? 'text-blue-400 hover:text-blue-300'
						: 'text-neutral-600 hover:text-neutral-400'}"
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
						class="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-neutral-700 bg-neutral-800 py-1 shadow-xl"
						onkeydown={handleSortKeydown}
					>
						{#each SORT_OPTIONS as opt}
							<button
								onclick={() => {
									onSort(opt.value);
									closeSortDropdown();
								}}
								class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-neutral-700 {opt.value === sortMode
									? 'text-blue-400'
									: 'text-neutral-300'}"
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
					class="cursor-grab text-xs text-neutral-600 hover:text-neutral-400 active:cursor-grabbing"
					title="Drag to reorder"
				>
					⠿
				</button>
			{/if}
		</span>
	</div>
	<div class="column-body flex flex-1 flex-col gap-2 overflow-y-auto p-2">
		{#if isOver && dropTargetId === null}
			<div class="h-0.5 rounded bg-blue-500"></div>
		{/if}
		{#each visibleCards as card (card.id)}
			<div
				role="listitem"
				animate:flip={{ duration: 300 }}
				ondragover={(e) => handleCardDragOver(e, card.id)}
				ondragleave={handleCardDragLeave}
				class="rounded-md transition-all {dropTargetId === card.id && dropAbove
					? 'border-t-2 border-t-blue-500'
					: dropTargetId === card.id && !dropAbove
						? 'border-b-2 border-b-blue-500'
						: ''}"
			>
				<KanbanCard {card} {onArchive} {onUnarchive} {onUpdateNote} />
			</div>
		{/each}
		{#if visibleCards.length === 0}
			<div class="py-6 text-center text-sm text-neutral-600">No PRs</div>
		{/if}
	</div>
</div>
