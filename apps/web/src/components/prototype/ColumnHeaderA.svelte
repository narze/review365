<script lang="ts">
	/**
	 * PROTOTYPE — variant A: "One menu".
	 *
	 * Thesis: today's header has three competing icon-only controls and two
	 * separate dropdowns. Collapse everything into a single kebab menu with a
	 * proper menu structure (section headers, full labels, checkmarks, keyboard
	 * nav), and surface sort state as readable text instead of a glyph.
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
	let menuEl: HTMLDivElement | undefined = $state();
	let triggerEl: HTMLButtonElement | undefined = $state();

	const active = $derived(sortOption(sortMode));

	function close(refocus = false) {
		open = false;
		if (refocus) triggerEl?.focus();
	}

	function items(): HTMLElement[] {
		return [...(menuEl?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
	}

	function onMenuKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close(true);
			return;
		}
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
		e.preventDefault();
		const list = items();
		const i = list.indexOf(document.activeElement as HTMLElement);
		const next =
			e.key === 'Home'
				? 0
				: e.key === 'End'
					? list.length - 1
					: (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
		list[next]?.focus();
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (!open) return;
		const t = e.target as Node;
		if (menuEl?.contains(t) || triggerEl?.contains(t)) return;
		close();
	}

	$effect(() => {
		if (open) items()[0]?.focus();
	});
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="group flex items-center gap-2 border-b border-panel py-2 pl-2 pr-2">
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
			class="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded text-dim opacity-0 transition-opacity hover:text-muted focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
			aria-label="Reorder column"
			title="Drag to reorder column"
		>
			⠿
		</button>
	{:else}
		<span class="w-5 shrink-0"></span>
	{/if}

	<span class="truncate text-sm font-semibold text-heading">{col.title}</span>
	<span class="shrink-0 rounded-full surface-raised px-2 py-0.5 text-xs text-muted">{count}</span>

	<span class="ml-auto flex shrink-0 items-center gap-1.5">
		{#if copyStatus !== 'idle'}
			<span
				class="text-xs {copyStatus === 'copied'
					? 'text-green-600 dark:text-green-400'
					: 'text-amber-600 dark:text-amber-400'}"
				role="status"
			>
				{copyStatus === 'copied' ? '✓ Copied' : copyStatus === 'empty' ? 'Nothing to copy' : 'Copy failed'}
			</span>
		{:else if sortMode !== 'default'}
			<button
				type="button"
				class="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-400 dark:hover:bg-blue-900/60"
				onclick={() => onSort('default')}
				title="Clear sort"
			>
				{active.short} ✕
			</button>
		{/if}

		<div class="relative">
			<button
				bind:this={triggerEl}
				type="button"
				onclick={() => (open = !open)}
				class="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-base leading-none text-muted transition-colors hover-surface hover:text-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 {open
					? 'surface-raised text-heading'
					: ''}"
				aria-label="Column menu"
				aria-haspopup="menu"
				aria-expanded={open}
			>
				⋯
			</button>

			{#if open}
				<div
					bind:this={menuEl}
					role="menu"
					tabindex="-1"
					aria-label="{col.title} column menu"
					onkeydown={onMenuKeydown}
					class="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-control surface-panel py-1 shadow-xl"
				>
					<div class="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
						Sort by
					</div>
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

					<div class="my-1 h-px bg-neutral-200 dark:bg-neutral-800"></div>

					<button
						type="button"
						role="menuitem"
						onclick={() => {
							onCopy();
							close(true);
						}}
						class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body transition-colors hover-surface focus:bg-neutral-100 focus:outline-none dark:focus:bg-neutral-800"
					>
						<span class="w-3.5 shrink-0 text-center">⧉</span>
						<span class="flex-1">Copy list</span>
						<span class="text-xs text-faint">{count} card{count === 1 ? '' : 's'}</span>
					</button>
				</div>
			{/if}
		</div>
	</span>
</div>
