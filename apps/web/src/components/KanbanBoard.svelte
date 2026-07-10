<script lang="ts">
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import type { PRCard, ColumnId, ColumnDef, Platform } from '@review365/api/types';
	import KanbanColumn from './KanbanColumn.svelte';
	import RepoFilter from './RepoFilter.svelte';
	import ColumnManager from './ColumnManager.svelte';
	import RuleManager from './RuleManager.svelte';
	import AccountSettings from './AccountSettings.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { getTheme, setTheme, type Theme } from '$lib/theme';

	let {
		cards = [],
		columns = [],
		enabledRepos = [],
		rules = [],
		orphans = [],
		signalLabels = {},
		onToggleRepo,
		onMoveCard,
		onReorderCard,
		onArchiveCard,
		onUnarchiveCard,
		onUpdateNote,
		onAddColumn,
		onRenameColumn,
		onDeleteColumn,
		onAddRule,
		onDeleteRule,
		onRefresh,
		onReorderColumns,
		mergedRetentionDays = 14,
		onSetRetention,
		columnWidthPx = 300,
		onSetColumnWidth,
		onSignOut,
		onImported,
		platform,
		login,
		onSwitchPlatform,
		loading = false,
		online = true
	}: {
		cards: PRCard[];
		columns: ColumnDef[];
		enabledRepos: string[];
		rules: { id: string; signal: string; columnId: string }[];
		orphans: { cardId: string; column: ColumnId }[];
		signalLabels: Record<string, string>;
		onToggleRepo: (repo: string) => void;
		onMoveCard: (cardId: string, column: ColumnId) => void;
		onReorderCard: (cardId: string, targetCardId: string | null, column: ColumnId) => void;
		onArchiveCard: (id: string) => void;
		onUnarchiveCard: (id: string) => void;
		onUpdateNote: (cardId: string, note: string) => void;
		onAddColumn: (title: string) => void;
		onRenameColumn: (id: string, title: string) => void;
		onDeleteColumn: (id: string) => void;
		onAddRule: (signal: string, columnId: string) => void;
		onDeleteRule: (id: string) => void;
		onRefresh: () => void;
		onReorderColumns: (ids: string[]) => void;
		mergedRetentionDays: number;
		onSetRetention: (days: number) => void;
		columnWidthPx: number;
		onSetColumnWidth: (px: number) => void;
		onSignOut: () => void;
		onImported: () => void;
		platform: Platform;
		login: string | null;
		onSwitchPlatform: (platform: Platform) => void;
		loading?: boolean;
		online?: boolean;
	} = $props();

	let showSettings = $state(false);
	let theme = $state<Theme>(getTheme());
	let showArchived = $state(false);
	let refreshing = $state(false);
	let dragColId: string | null = $state(null);
	let dragColHeight = $state(0);
	let dropColTarget: string | null = $state(null);
	let dropColBefore: boolean = $state(false);

	// Width matches the moved column; height matches the grabbed one so the gap
	// that opens is the same footprint the column will occupy once dropped.
	const colGapHeight = $derived(dragColHeight || 300);

	type SortMode = 'default' | 'pr-asc' | 'pr-desc' | 'age-asc' | 'age-desc';
	let columnSorts = $state<Map<ColumnId, SortMode>>(new Map());

	function onSortColumn(colId: ColumnId, mode: SortMode) {
		const next = new Map(columnSorts);
		if (mode === 'default') {
			next.delete(colId);
		} else {
			next.set(colId, mode);
		}
		columnSorts = next;
	}

	function onColumnDragStart(colId: string, height: number) {
		dragColId = colId;
		dragColHeight = height;
	}

	function onColumnDragEnd() {
		dragColId = null;
		dragColHeight = 0;
		dropColTarget = null;
	}

	function isColumnDrag(e: DragEvent): boolean {
		return e.dataTransfer?.types.includes('application/column-id') ?? false;
	}

	function handleColumnDragOver(e: DragEvent, colId: string) {
		if (!isColumnDrag(e)) return;
		e.preventDefault();
		dropColTarget = colId;
		// Measure against the column itself, not the wrapper: once a gap opens the
		// wrapper spans column + gap, and halving that would flip the side too late.
		const rect = (e.currentTarget as HTMLElement)
			.querySelector('[role="region"]')!
			.getBoundingClientRect();
		dropColBefore = e.clientX - rect.left < rect.width / 2;
	}

	// See the card-side note in KanbanColumn: when the gap opens under a
	// stationary pointer the element beneath it changes, and an uncancelled
	// dragenter resets the drop target to <body>, killing dragover/drop.
	function handleColumnDragEnter(e: DragEvent) {
		if (!isColumnDrag(e)) return;
		e.preventDefault();
	}

	function handleColumnDrop(e: DragEvent, colId: string) {
		e.preventDefault();
		const srcId = e.dataTransfer?.getData('application/column-id');
		dropColTarget = null;
		dragColId = null;
		dragColHeight = 0;
		if (!srcId || srcId === colId) return;
		// Insert relative to the target in the list with the source removed, so the
		// index stays valid regardless of which side the source came from. Dropping
		// on the right half of the last column appends to the end (the gap the user
		// sees), which the old length-clamped index could not express.
		const reordered = columns.filter((c) => c.id !== srcId);
		const moved = columns.find((c) => c.id === srcId);
		let pos = reordered.findIndex((c) => c.id === colId);
		if (!moved || pos < 0) return;
		if (!dropColBefore) pos += 1;
		reordered.splice(pos, 0, moved);
		onReorderColumns(reordered.map((c) => c.id));
	}

	function onThemeChange(next: Theme) {
		theme = next;
		setTheme(next);
	}

	async function handleRefresh() {
		refreshing = true;
		try {
			await onRefresh();
		} finally {
			refreshing = false;
		}
	}

	const repoCounts = $derived(
		(() => {
			const m = new SvelteMap<string, number>();
			for (const c of cards) m.set(c.repo, (m.get(c.repo) ?? 0) + 1);
			return m;
		})()
	);

	const filteredCards = $derived(
		enabledRepos.length === 0 ? [] : cards.filter((c) => enabledRepos.includes(c.repo))
	);

	const archivedCount = $derived(filteredCards.filter((c) => c.archived).length);

	function cardsForColumn(columnId: ColumnId): PRCard[] {
		const cols = filteredCards.filter((c) => c.columnId === columnId);
		const mode = columnSorts.get(columnId);
		if (!mode || mode === 'default') {
			return cols.sort((a, b) => a.order - b.order);
		}
		switch (mode) {
			case 'pr-asc':
				return cols.sort((a, b) => a.prNumber - b.prNumber);
			case 'pr-desc':
				return cols.sort((a, b) => b.prNumber - a.prNumber);
			case 'age-asc':
				return cols.sort(
					(a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
				);
			case 'age-desc':
				return cols.sort(
					(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
				);
		}
	}

	function orphanedCards(): PRCard[] {
		const orphanIds = new Set(orphans.map((o) => o.cardId));
		return filteredCards.filter((c) => orphanIds.has(c.id));
	}
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-panel px-3 py-3 sm:gap-3 sm:px-6">
	<h1 class="order-1 text-lg font-bold text-heading sm:text-xl">Review365</h1>

	<div class="order-2 ml-auto flex gap-2 sm:order-5">
		<button
			class="btn-secondary px-2.5 py-1.5 text-sm text-heading disabled:opacity-40 sm:px-3"
			disabled={refreshing}
			onclick={handleRefresh}
		>
			{#if refreshing}
				⏳<span class="hidden sm:inline"> Fetching...</span>
			{:else}
				🔄<span class="hidden sm:inline"> Refresh</span>
			{/if}
		</button>
		<button
			class="btn-secondary px-2.5 py-1.5 text-sm text-heading sm:px-3 {showSettings ? 'border-blue-500' : ''}"
			onclick={() => (showSettings = !showSettings)}
		>
			⚙️<span class="hidden sm:inline"> Settings</span>
		</button>
	</div>

	<div class="order-3 sm:order-2">
		<RepoFilter {enabledRepos} {repoCounts} onToggle={onToggleRepo} />
	</div>

	<span class="order-4 w-full text-sm text-muted sm:order-3 sm:w-auto">
		{enabledRepos.length === 0
			? 'Select repos to view →'
			: `${filteredCards.length} of ${cards.length} PRs across ${columns.length} columns`}
	</span>

	{#if archivedCount > 0}
		<button
			class="btn-secondary order-5 px-2.5 py-1 text-xs sm:order-4 {showArchived ? 'border-blue-500' : ''}"
			onclick={() => (showArchived = !showArchived)}
		>
			📦 {archivedCount} archived {showArchived ? '(showing)' : '(hidden)'}
		</button>
	{/if}
</div>

{#if !online}
	<div class="border-b border-amber-900/50 bg-amber-950/40 px-6 py-1.5 text-xs text-amber-400">
		📡 Offline — showing the last cards loaded. Reconnect to refresh.
	</div>
{/if}

{#if showSettings}
	<div class="border-b border-panel surface-panel p-4">
		<div class="mx-auto max-w-3xl grid gap-6">
			<AccountSettings {platform} {login} {onSignOut} {onImported} {onSwitchPlatform} />
			<ColumnManager {columns} onAdd={onAddColumn} onRename={onRenameColumn} onDelete={onDeleteColumn} />
			<RuleManager {columns} {rules} {signalLabels} onAdd={onAddRule} onDelete={onDeleteRule} />
			<div class="flex items-center gap-3 rounded-lg border border-panel p-4">
				<span class="text-sm text-body">Theme</span>
				<div class="inline-flex rounded-md border border-control p-0.5">
					{#each ['light', 'dark'] as const as t}
						<button
							class="rounded px-2.5 py-1 text-xs font-medium transition-colors {theme === t
								? 'bg-blue-600 text-white'
								: 'text-body hover:text-heading'}"
							onclick={() => onThemeChange(t)}
						>
							{t === 'light' ? '☀️ Light' : '🌙 Dark'}
						</button>
					{/each}
				</div>
			</div>
			<div class="flex items-center gap-3 rounded-lg border border-panel p-4">
				<span class="text-sm text-body">Merged PR retention</span>
				<input
					type="number"
					min="1"
					max="90"
					value={mergedRetentionDays}
					onchange={(e) => onSetRetention(Number((e.target as HTMLInputElement).value))}
					class="input-field w-20 px-2 py-1"
				/>
				<span class="text-xs text-faint">days</span>
			</div>
			<div class="flex items-center gap-3 rounded-lg border border-panel p-4">
				<span class="text-sm text-body">Column width</span>
				<input
					type="number"
					min="200"
					max="800"
					value={columnWidthPx}
					onchange={(e) => onSetColumnWidth(Number((e.target as HTMLInputElement).value))}
					class="input-field w-20 px-2 py-1"
				/>
				<span class="text-xs text-faint">px</span>
			</div>
		</div>
	</div>
{/if}

{#if enabledRepos.length === 0}
	{#if loading}
		<div class="flex flex-col items-center justify-center py-20 text-dim">
			<div class="mb-3 animate-pulse text-5xl opacity-50">⏳</div>
			<div class="text-lg text-muted">Loading your board…</div>
		</div>
	{:else}
		<div class="flex flex-col items-center justify-center py-20 text-dim">
			<div class="mb-3 text-5xl opacity-50">📁</div>
			<div class="mb-2 text-lg text-muted">No repos selected</div>
			<div class="text-sm">
				Click <strong class="text-blue-400">Repos</strong> above and search to add repos to your
				watchlist.
			</div>
		</div>
	{/if}
{:else}
	<div class="thin-scrollbar flex min-h-[calc(100vh-65px)] items-start gap-4 overflow-x-auto p-6">
		{#each columns as col (col.id)}
			<div
				role="presentation"
				animate:flip={{ duration: 250 }}
				ondragenter={handleColumnDragEnter}
				ondragover={(e) => handleColumnDragOver(e, col.id)}
				ondragleave={() => {
					if (dropColTarget === col.id) dropColTarget = null;
				}}
				ondrop={(e) => handleColumnDrop(e, col.id)}
				class="flex items-start gap-4 transition-opacity {dragColId === col.id
					? 'opacity-40'
					: ''}"
			>
				{#if dropColTarget === col.id && dropColBefore && col.id !== dragColId}
					<div
						class="column-drop-slot"
						style="width: {columnWidthPx}px; height: {colGapHeight}px"
						transition:slide={{ axis: 'x', duration: 150 }}
					></div>
				{/if}
				<KanbanColumn
					{col}
					width={columnWidthPx}
					cards={cardsForColumn(col.id)}
					onDrop={onMoveCard}
					onReorder={onReorderCard}
					onArchive={onArchiveCard}
					onUnarchive={onUnarchiveCard}
					onUpdateNote={onUpdateNote}
					{showArchived}
					onColumnDragStart={(height) => onColumnDragStart(col.id, height)}
					onColumnDragEnd={onColumnDragEnd}
					sortMode={columnSorts.get(col.id) ?? 'default'}
					onSort={(mode) => onSortColumn(col.id, mode as SortMode)}
				/>
				{#if dropColTarget === col.id && !dropColBefore && col.id !== dragColId}
					<div
						class="column-drop-slot"
						style="width: {columnWidthPx}px; height: {colGapHeight}px"
						transition:slide={{ axis: 'x', duration: 150 }}
					></div>
				{/if}
			</div>
		{/each}
		{#if orphanedCards().length > 0}
			<KanbanColumn
				col={{ id: '__orphaned__', title: '👻 Orphaned' }}
				width={columnWidthPx}
				cards={orphanedCards()}
				onDrop={onMoveCard}
				onReorder={onReorderCard}
				onArchive={onArchiveCard}
				onUnarchive={onUnarchiveCard}
				onUpdateNote={onUpdateNote}
				{showArchived}
			/>
{/if}
</div>

{/if}

<style>
	.column-drop-slot {
		/* Visual only: pointer-events off so the pointer keeps hitting the
		   column wrapper (the drop target) even after the gap opens under it. */
		pointer-events: none;
		flex-shrink: 0;
		border-radius: 0.75rem;
		border: 2px dashed rgba(59, 130, 246, 0.55);
		background: rgba(59, 130, 246, 0.08);
	}
</style>
