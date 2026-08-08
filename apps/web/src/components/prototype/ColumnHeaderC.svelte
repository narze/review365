<script lang="ts">
	/**
	 * PROTOTYPE — variant C: "Header panel".
	 *
	 * Thesis: the affordance is too small and too hidden. Make the whole header
	 * the trigger (a 40px-tall click target with a ▾), and open one wide panel
	 * where sort is a segmented control you can click repeatedly while watching
	 * the column re-order live — the panel stays open until dismissed.
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

	let open = $state(false);
	let panelEl: HTMLDivElement | undefined = $state();
	let triggerEl: HTMLButtonElement | undefined = $state();

	const active = $derived(sortOption(sortMode));

	function close(refocus = false) {
		open = false;
		if (refocus) triggerEl?.focus();
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (panelEl?.contains(t) || triggerEl?.contains(t)) return;
		close();
	}
</script>

<svelte:window
	onpointerdown={onWindowPointerDown}
	onkeydown={(e) => open && e.key === 'Escape' && close(true)}
/>

<div class="relative flex items-stretch border-b border-panel">
	<button
		bind:this={triggerEl}
		type="button"
		onclick={() => (open = !open)}
		class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-tl-xl px-3 py-2 text-left transition-colors hover-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 {open
			? 'surface-raised'
			: ''}"
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label="{col.title} column options"
	>
		<span class="min-w-0 flex-1">
			<span class="flex items-center gap-2">
				<span class="truncate text-sm font-semibold text-heading">{col.title}</span>
				<span class="shrink-0 rounded-full surface-raised px-2 py-0.5 text-xs text-muted">
					{count}
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
						? `Copied ${count} card${count === 1 ? '' : 's'} as Markdown`
						: copyStatus === 'empty'
							? 'Nothing to copy'
							: 'Copy failed'}
				</span>
			{:else if sortMode !== 'default'}
				<span class="block truncate text-[11px] text-blue-600 dark:text-blue-400">
					Sorted by {active.label}
				</span>
			{/if}
		</span>
		<span class="shrink-0 text-xs text-muted transition-transform {open ? 'rotate-180' : ''}">▾</span>
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
			class="grid w-8 shrink-0 cursor-grab place-items-center text-sm text-dim transition-colors hover:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 active:cursor-grabbing"
			aria-label="Reorder column"
			title="Drag to reorder column"
		>
			⠿
		</button>
	{/if}

	{#if open}
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
						onclick={() => onSort('default')}
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
						onclick={() => onSort(opt.value)}
						class="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors {opt.value ===
						sortMode
							? 'border-blue-500 bg-blue-600 text-white'
							: 'border-control text-body hover-surface'} {opt.value === 'default'
							? 'col-span-2'
							: ''}"
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
					onCopy();
					close(true);
				}}
				class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover-surface"
			>
				<span aria-hidden="true" class="w-4 shrink-0 text-center text-sm">⧉</span>
				<span class="min-w-0 flex-1">
					<span class="block text-sm text-heading">Copy list</span>
					<span class="block text-[11px] text-faint">
						{count} card{count === 1 ? '' : 's'} as Markdown links
					</span>
				</span>
			</button>

			<p class="mt-2 text-center text-[10px] text-faint">Esc or click away to close</p>
		</div>
	{/if}
</div>
