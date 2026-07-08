<script lang="ts">
	import type { PRCard, ColumnId, ColumnDef, Platform } from '@review365/api/types';
	import KanbanColumn from './KanbanColumn.svelte';
	import RepoFilter from './RepoFilter.svelte';
	import ColumnManager from './ColumnManager.svelte';
	import RuleManager from './RuleManager.svelte';
	import AccountSettings from './AccountSettings.svelte';
	import { SvelteMap } from 'svelte/reactivity';

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
		onSignOut,
		onImported,
		platform,
		login,
		onSwitchPlatform
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
		onSignOut: () => void;
		onImported: () => void;
		platform: Platform;
		login: string | null;
		onSwitchPlatform: (platform: Platform) => void;
	} = $props();

	let showSettings = $state(false);
	let showArchived = $state(false);
	let refreshing = $state(false);
	let dragColId: string | null = $state(null);
	let dropColTarget: string | null = $state(null);
	let dropColBefore: boolean = $state(false);

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

	function onColumnDragStart(colId: string) {
		dragColId = colId;
	}

	function onColumnDragEnd() {
		dragColId = null;
		dropColTarget = null;
	}

	function handleColumnDragOver(e: DragEvent, colId: string) {
		if (!e.dataTransfer?.types.includes('application/column-id')) return;
		e.preventDefault();
		dropColTarget = colId;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropColBefore = (e.clientX - rect.left) < rect.width / 2;
	}

	function handleColumnDrop(e: DragEvent, colId: string) {
		e.preventDefault();
		const srcId = e.dataTransfer?.getData('application/column-id');
		if (!srcId || srcId === colId) return;
		const idx = columns.findIndex((c) => c.id === colId);
		let insertIdx = idx;
		if (!dropColBefore && idx < columns.length - 1) insertIdx = idx + 1;
		const reordered = [...columns];
		const srcIdx = reordered.findIndex((c) => c.id === srcId);
		if (srcIdx >= 0) {
			const [moved] = reordered.splice(srcIdx, 1);
			// adjust insertIdx if srcIdx was before it
			if (srcIdx < insertIdx) insertIdx--;
			reordered.splice(insertIdx, 0, moved);
		}
		const ids = reordered.map((c) => c.id);
		onReorderColumns(ids);
		dropColTarget = null;
		dragColId = null;
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

<div class="flex items-center gap-3 border-b border-neutral-800 px-6 py-3">
	<h1 class="text-xl font-bold text-neutral-100">Review365</h1>
	<RepoFilter {enabledRepos} {repoCounts} onToggle={onToggleRepo} />
	<span class="text-sm text-neutral-400">
		{enabledRepos.length === 0
			? 'Select repos to view →'
			: `${filteredCards.length} of ${cards.length} PRs across ${columns.length} columns`}
	</span>
	{#if archivedCount > 0}
		<button
			class="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-blue-500 {showArchived
				? 'border-blue-500'
				: ''}"
			onclick={() => (showArchived = !showArchived)}
		>
			📦 {archivedCount} archived {showArchived ? '(showing)' : '(hidden)'}
		</button>
	{/if}
	<div class="ml-auto flex gap-2">
		<button
			class="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 transition-colors hover:border-blue-500 disabled:opacity-40"
			disabled={refreshing}
			onclick={handleRefresh}
		>
			{refreshing ? '⏳ Fetching...' : '🔄 Refresh'}
		</button>
		<button
			class="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 transition-colors hover:border-blue-500 {showSettings
				? 'border-blue-500'
				: ''}"
			onclick={() => (showSettings = !showSettings)}
		>
			⚙️ Settings
		</button>
	</div>
</div>

{#if showSettings}
	<div class="border-b border-neutral-800 bg-neutral-900 p-4">
		<div class="mx-auto max-w-3xl grid gap-6">
			<AccountSettings {platform} {login} {onSignOut} {onImported} {onSwitchPlatform} />
			<ColumnManager {columns} onAdd={onAddColumn} onRename={onRenameColumn} onDelete={onDeleteColumn} />
			<RuleManager {columns} {rules} {signalLabels} onAdd={onAddRule} onDelete={onDeleteRule} />
			<div class="flex items-center gap-3 rounded-lg border border-neutral-800 p-4">
				<span class="text-sm text-neutral-300">Merged PR retention</span>
				<input
					type="number"
					min="1"
					max="90"
					value={mergedRetentionDays}
					onchange={(e) => onSetRetention(Number((e.target as HTMLInputElement).value))}
					class="w-20 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
				/>
				<span class="text-xs text-neutral-500">days</span>
			</div>
		</div>
	</div>
{/if}

{#if enabledRepos.length === 0}
	<div class="flex flex-col items-center justify-center py-20 text-neutral-600">
		<div class="mb-3 text-5xl opacity-50">📁</div>
		<div class="mb-2 text-lg text-neutral-400">No repos selected</div>
		<div class="text-sm">
			Click <strong class="text-blue-400">Repos</strong> above and search to add repos to your
			watchlist.
		</div>
	</div>
{:else}
	<div class="flex min-h-[calc(100vh-65px)] items-start gap-4 overflow-x-auto p-6">
		{#each columns as col (col.id)}
			<div
				role="presentation"
				ondragover={(e) => handleColumnDragOver(e, col.id)}
				ondragleave={() => {
					if (dropColTarget === col.id) dropColTarget = null;
				}}
				ondrop={(e) => handleColumnDrop(e, col.id)}
				class="rounded-xl transition-all {dropColTarget === col.id
					? dropColBefore
						? 'border-l-4 border-l-blue-500'
						: 'border-r-4 border-r-blue-500'
					: ''}"
			>
				<KanbanColumn
					{col}
					cards={cardsForColumn(col.id)}
					onDrop={onMoveCard}
					onReorder={onReorderCard}
					onArchive={onArchiveCard}
					onUnarchive={onUnarchiveCard}
					onUpdateNote={onUpdateNote}
					{showArchived}
					onColumnDragStart={() => onColumnDragStart(col.id)}
					onColumnDragEnd={onColumnDragEnd}
					sortMode={columnSorts.get(col.id) ?? 'default'}
					onSort={(mode) => onSortColumn(col.id, mode as SortMode)}
				/>
			</div>
		{/each}
		{#if orphanedCards().length > 0}
			<KanbanColumn
				col={{ id: '__orphaned__', title: '👻 Orphaned' }}
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
