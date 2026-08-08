<script lang="ts">
	/**
	 * PROTOTYPE — variant B: "Hover toolbar + chips".
	 *
	 * Thesis: menus are the wrong container for a two-item list. Keep the header
	 * quiet at rest (title + count only), reveal a real icon toolbar on
	 * hover/focus, make Copy a one-click action with in-place feedback, and push
	 * sort state out of the icon and into a dismissible chip on its own row.
	 */
	import type { ColumnDef } from '@review365/api/types';
	import { SORT_OPTIONS, sortOption, type SortMode } from '$lib/prototype-variant.svelte';

	let {
		col,
		count,
		sortMode = 'default',
		onSort = () => {},
		onCopy = () => {},
		copyStatus = 'idle',
		onColumnDragStart,
		onColumnDragEnd
	}: {
		col: ColumnDef;
		count: number;
		sortMode?: SortMode;
		onSort?: (mode: SortMode) => void;
		onCopy?: () => void;
		copyStatus?: 'idle' | 'copied' | 'empty' | 'failed';
		onColumnDragStart?: () => void;
		onColumnDragEnd?: () => void;
	} = $props();

	let sortOpen = $state(false);
	let popoverEl: HTMLDivElement | undefined = $state();
	let sortBtnEl: HTMLButtonElement | undefined = $state();

	const active = $derived(sortOption(sortMode));
	const copyIcon = $derived(
		copyStatus === 'copied' ? '✓' : copyStatus === 'idle' ? '⧉' : '✕'
	);

	function close(refocus = false) {
		sortOpen = false;
		if (refocus) sortBtnEl?.focus();
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (!sortOpen) return;
		const t = e.target as Node;
		if (popoverEl?.contains(t) || sortBtnEl?.contains(t)) return;
		close();
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="group border-b border-panel px-3 py-2">
	<div class="flex items-center gap-2">
		<span class="truncate text-sm font-semibold text-heading">{col.title}</span>
		<span class="shrink-0 rounded-full surface-raised px-2 py-0.5 text-xs text-muted">{count}</span>

		<div
			class="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 {sortOpen
				? 'opacity-100'
				: ''}"
		>
			<button
				type="button"
				onclick={onCopy}
				class="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-sm transition-colors hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 {copyStatus ===
				'copied'
					? 'text-green-600 dark:text-green-400'
					: copyStatus === 'idle'
						? 'text-muted hover:text-heading'
						: 'text-amber-600 dark:text-amber-400'}"
				aria-label="Copy list of {count} cards as Markdown"
				title="Copy list ({count} cards)"
			>
				{copyIcon}
			</button>

			<button
				bind:this={sortBtnEl}
				type="button"
				onclick={() => (sortOpen = !sortOpen)}
				class="relative grid h-7 w-7 cursor-pointer place-items-center rounded-md text-sm transition-colors hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 {sortMode !==
				'default'
					? 'text-blue-600 dark:text-blue-400'
					: 'text-muted hover:text-heading'} {sortOpen ? 'surface-raised' : ''}"
				aria-label="Sort cards"
				aria-haspopup="menu"
				aria-expanded={sortOpen}
				title="Sort cards"
			>
				⇅
				{#if sortMode !== 'default'}
					<span class="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500"></span>
				{/if}
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
					class="grid h-7 w-7 cursor-grab place-items-center rounded-md text-sm text-muted transition-colors hover-surface hover:text-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 active:cursor-grabbing"
					aria-label="Reorder column"
					title="Drag to reorder column"
				>
					⠿
				</button>
			{/if}
		</div>
	</div>

	{#if sortMode !== 'default' || copyStatus !== 'idle'}
		<div class="mt-1.5 flex items-center gap-1.5">
			{#if sortMode !== 'default'}
				<button
					type="button"
					class="inline-flex min-w-0 shrink items-center gap-1 whitespace-nowrap rounded-full bg-blue-50 py-0.5 pl-2 pr-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-900/60"
					onclick={() => onSort('default')}
					aria-label="Clear sort: {active.label}, {active.hint}"
				>
					<span class="truncate">{active.label}</span>
					<span aria-hidden="true" class="text-blue-400 dark:text-blue-500">✕</span>
				</button>
			{/if}
			{#if copyStatus !== 'idle'}
				<span
					role="status"
					class="shrink-0 whitespace-nowrap text-xs {copyStatus === 'copied'
						? 'text-green-600 dark:text-green-400'
						: 'text-amber-600 dark:text-amber-400'}"
				>
					{copyStatus === 'copied'
						? `Copied ${count} card${count === 1 ? '' : 's'}`
						: copyStatus === 'empty'
							? 'Nothing to copy'
							: 'Copy failed'}
				</span>
			{/if}
		</div>
	{/if}

	{#if sortOpen}
		<div class="relative">
			<div
				bind:this={popoverEl}
				role="menu"
				tabindex="-1"
				aria-label="Sort {col.title}"
				onkeydown={(e) => e.key === 'Escape' && close(true)}
				class="absolute right-0 top-1 z-30 w-56 rounded-lg border border-control surface-panel py-1 shadow-xl"
			>
				{#each SORT_OPTIONS as opt}
					<button
						type="button"
						role="menuitemradio"
						aria-checked={opt.value === sortMode}
						onclick={() => {
							onSort(opt.value);
							close(true);
						}}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover-surface focus:bg-neutral-100 focus:outline-none dark:focus:bg-neutral-800 {opt.value ===
						sortMode
							? 'font-medium text-blue-600 dark:text-blue-400'
							: 'text-body'}"
					>
						<span class="w-3.5 shrink-0 text-center">{opt.value === sortMode ? '✓' : ''}</span>
						<span class="flex-1 whitespace-nowrap">{opt.label}</span>
						<span class="whitespace-nowrap text-xs text-faint">{opt.hint}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
