<script lang="ts">
	import type { PRCard, ColumnId, ColumnDef, Platform, SortMode } from '@review365/api/types';
	import KanbanColumn from './KanbanColumn.svelte';
	import CIChecksPopover from './CIChecksPopover.svelte';
	import RepoFilter from './RepoFilter.svelte';
	import ColumnManager from './ColumnManager.svelte';
	import RuleManager from './RuleManager.svelte';
	import AccountSettings from './AccountSettings.svelte';
	import ActivityPanel from './ActivityPanel.svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { tick } from 'svelte';
	import { getTheme, setTheme, type Theme } from '$lib/theme';
	import type { Dir } from '$lib/card-navigation';
	import { createBoardNav, type NavResult } from '$lib/board-nav';
	import { cardMatchesQuery } from '$lib/card-filter';
	import { groupCardsByRepo } from '$lib/card-grouping';
	import type { ActivityEvent } from '$lib/activity';

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
		onSortColumn,
		onToggleGroup,
		onToggleGroupCollapse,
		onSignOut,
		onImported,
		platform,
		login,
		onSwitchPlatform,
		activities = [],
		hasUnseenActivity = false,
		onActivitySeen,
		onClearActivity,
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
		onSortColumn: (id: string, mode: SortMode) => void;
		onToggleGroup: (id: string, grouped: boolean) => void;
		onToggleGroupCollapse: (id: string, repo: string) => void;
		onSignOut: () => void;
		onImported: () => void;
		platform: Platform;
		login: string | null;
		onSwitchPlatform: (platform: Platform) => void;
		activities?: ActivityEvent[];
		hasUnseenActivity?: boolean;
		onActivitySeen: () => void;
		onClearActivity: () => void;
		loading?: boolean;
		online?: boolean;
	} = $props();

	let showSettings = $state(false);
	let showActivity = $state(false);
	let theme = $state<Theme>(getTheme());
	let showArchived = $state(false);
	let searchQuery = $state('');
	let refreshing = $state(false);
	let ciPopover = $state<{ card: PRCard; anchor: DOMRect } | null>(null);
	let ciCloseTimer: ReturnType<typeof setTimeout> | undefined;

	function openCIPopover(card: PRCard, anchor: DOMRect) {
		if (ciCloseTimer) clearTimeout(ciCloseTimer);
		ciPopover = { card, anchor };
	}

	function scheduleCIPopoverClose() {
		if (ciCloseTimer) clearTimeout(ciCloseTimer);
		ciCloseTimer = setTimeout(() => (ciPopover = null), 100);
	}

	function cancelCIPopoverClose() {
		if (ciCloseTimer) clearTimeout(ciCloseTimer);
	}

	function closeCIPopover() {
		cancelCIPopoverClose();
		ciPopover = null;
	}
	let dragColId: string | null = $state(null);
	let dropColTarget: string | null = $state(null);
	let dropColBefore: boolean = $state(false);

	// Sort mode and grouping live on each ColumnDef (persisted config), not as
	// separate local state — `columns` is the single source of truth.
	const columnsById = $derived(new Map(columns.map((c) => [c.id, c])));

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

	function onThemeChange(next: Theme) {
		theme = next;
		setTheme(next);
	}

	function openActivity() {
		showActivity = true;
		onActivitySeen();
	}

	function selectActivity(activity: ActivityEvent) {
		showActivity = false;
		if (cards.some((card) => card.id === activity.card.cardId)) {
			focusCard(activity.card.cardId);
		} else {
			window.open(activity.card.url, '_blank', 'noopener');
		}
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

	// Cards in the watchlist, before the text filter — the denominator for "X of Y".
	const watchedCards = $derived(
		enabledRepos.length === 0 ? [] : cards.filter((c) => enabledRepos.includes(c.repo))
	);

	const query = $derived(searchQuery.trim());

	// The text filter narrows the watched cards further. Everything downstream
	// (columns, orphans, archived count, keyboard nav) reads from filteredCards,
	// so the search applies board-wide from this one place.
	const filteredCards = $derived(
		query ? watchedCards.filter((c) => cardMatchesQuery(c, query)) : watchedCards
	);

	const archivedCount = $derived(filteredCards.filter((c) => c.archived).length);

	function cardsForColumn(columnId: ColumnId): PRCard[] {
		const cols = filteredCards.filter((c) => c.columnId === columnId);
		const mode = columnsById.get(columnId)?.sortMode;
		const sorted = (() => {
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
		})();
		return columnsById.get(columnId)?.grouped ? groupCardsByRepo(sorted) : sorted;
	}

	// Cards actually reachable by keyboard: same as `cardsForColumn`, minus any
	// cards sitting under a collapsed repo cluster. Only grouped columns carry
	// `collapsedRepos`, so this is a no-op everywhere else.
	function navigableCardsForColumn(columnId: ColumnId): PRCard[] {
		const cards = cardsForColumn(columnId);
		const col = columnsById.get(columnId);
		if (!col?.grouped || !col.collapsedRepos?.length) return cards;
		const collapsed = new Set(col.collapsedRepos);
		return cards.filter((c) => !collapsed.has(c.repo));
	}

	function orphanedCards(): PRCard[] {
		const orphanIds = new Set(orphans.map((o) => o.cardId));
		return filteredCards.filter((c) => orphanIds.has(c.id));
	}

	// --- Keyboard navigation -------------------------------------------------

	// Synthetic column id for the orphaned-cards bucket rendered below (also
	// used in the template and the `nav` grid).
	const ORPHANED_COLUMN_ID = '__orphaned__';

	let focusedCardId = $state<string | null>(null);

	// Owns the returnSlots memory (where a card sat before a keyboard
	// column-move) privately; decides focus/reorder outcomes for a grid + a
	// direction. No DOM, no board state — see $lib/board-nav.
	const boardNav = createBoardNav();

	const ARROW: Record<string, Dir> = {
		ArrowUp: 'up',
		ArrowDown: 'down',
		ArrowLeft: 'left',
		ArrowRight: 'right'
	};

	// The board as columns of visible card ids, in on-screen order, plus the
	// parallel column ids (with the orphaned bucket last when present). This is
	// the single source of truth for both focus movement and shift-to-move.
	const nav = $derived.by(() => {
		const vis = (arr: PRCard[]) => (showArchived ? arr : arr.filter((c) => !c.archived));
		const grid: string[][] = [];
		const colIds: string[] = [];
		for (const col of columns) {
			grid.push(vis(navigableCardsForColumn(col.id)).map((c) => c.id));
			colIds.push(col.id);
		}
		const orph = vis(orphanedCards()).map((c) => c.id);
		if (orph.length) {
			grid.push(orph);
			colIds.push(ORPHANED_COLUMN_ID);
		}
		return { grid, colIds };
	});

	// Drop focus if the focused card leaves the board (refresh, filter, repo change).
	$effect(() => {
		if (focusedCardId && !nav.grid.some((col) => col.includes(focusedCardId!))) {
			focusedCardId = null;
		}
	});

	function isEditable(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		const tag = el.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
	}

	function findCardEl(id: string): HTMLElement | null {
		return (
			[...document.querySelectorAll<HTMLElement>('[data-card-id]')].find(
				(e) => e.dataset.cardId === id
			) ?? null
		);
	}

	async function focusCard(id: string) {
		focusedCardId = id;
		await tick();
		const el = findCardEl(id);
		if (!el) return;
		el.focus({ preventScroll: true });
		// A reorder plays an `animate:flip`; scrollIntoView would otherwise read the
		// card's mid-flight (transformed) rect and scroll to its old spot. Svelte
		// starts the flip on the next frame, so wait a frame for it to register,
		// then let the column's animations settle before scrolling.
		await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
		const container = el.closest('.column-body');
		const anims = container?.getAnimations?.({ subtree: true }) ?? [];
		if (anims.length) await Promise.allSettled(anims.map((a) => a.finished));
		// Focus may have moved on while we waited — don't yank the scroll back.
		if (focusedCardId !== id) return;
		el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
	}

	// Reorder writes card `order`; a column shown under an active sort or
	// grouping ignores order, so a same-column reorder would be an invisible
	// no-op — refuse those. A cross-column move is never a no-op (the card
	// visibly changes column), so it's only refused for the synthetic
	// orphaned bucket.
	function isReorderable(colId: string): boolean {
		if (colId === ORPHANED_COLUMN_ID) return false;
		const col = columnsById.get(colId);
		return !((col?.sortMode && col.sortMode !== 'default') || col?.grouped);
	}

	function canReceiveCard(colId: string): boolean {
		return colId !== ORPHANED_COLUMN_ID;
	}

	// Applies a board-nav result: performs the reorder it describes (if any),
	// then focuses (and scrolls to) the card it names.
	async function applyNav(result: NavResult | null) {
		if (!result) return;
		if ('reorder' in result) {
			onReorderCard(result.reorder.cardId, result.reorder.targetCardId, result.reorder.column);
			await tick();
		}
		focusCard(result.focus);
	}

	// Clicking a card makes it the selection: move the ring here and take DOM
	// focus (so Enter/Space/N work), but don't scroll — it's already in view.
	function onSelectCard(id: string) {
		focusedCardId = id;
		findCardEl(id)?.focus({ preventScroll: true });
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isEditable(e.target)) return;

		if (e.key === 'Escape') {
			if (focusedCardId) {
				focusedCardId = null;
				(document.activeElement as HTMLElement | null)?.blur();
			}
			return;
		}

		const dir = ARROW[e.key];
		if (!dir) return;

		// Ctrl/Cmd jumps to the column edge (Up/Down only, and only once a card is
		// focused). Cmd+←/→ is left to the browser's history navigation.
		if (e.metaKey || e.ctrlKey) {
			if ((dir === 'up' || dir === 'down') && focusedCardId) {
				e.preventDefault();
				if (e.shiftKey) {
					applyNav(boardNav.moveCardToEdge(nav.grid, nav.colIds, focusedCardId, dir, isReorderable));
				} else {
					applyNav(boardNav.focusColumnEdge(nav.grid, focusedCardId, dir));
				}
			}
			return;
		}

		e.preventDefault();

		if (e.shiftKey) {
			applyNav(
				boardNav.moveCard(nav.grid, nav.colIds, focusedCardId, dir, isReorderable, canReceiveCard)
			);
		} else {
			applyNav(boardNav.moveFocus(nav.grid, focusedCardId, dir));
		}
	}

	$effect(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-panel px-3 py-3 sm:gap-3 sm:px-6">
	<h1 class="order-1 text-lg font-bold text-heading sm:text-xl">Review365</h1>

	<div class="order-2 ml-auto flex gap-2 sm:order-6">
		<button
			class="btn-secondary relative px-2.5 py-1.5 text-sm text-heading sm:px-3 {showActivity ? 'border-blue-500' : ''}"
			onclick={openActivity}
			aria-label="Activity"
		>
			🕘<span class="hidden sm:inline"> Activity</span>
			{#if hasUnseenActivity}
				<span class="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500" aria-label="New activity"></span>
			{/if}
		</button>
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

	<div class="relative order-4 sm:order-3">
		<span class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted">
			🔍
		</span>
		<input
			type="search"
			class="input-field w-40 py-1.5 pl-8 pr-7 sm:w-56 [&::-webkit-search-cancel-button]:hidden"
			placeholder="Filter cards..."
			value={searchQuery}
			oninput={(e) => (searchQuery = (e.target as HTMLInputElement).value)}
			aria-label="Filter cards by text"
		/>
		{#if query}
			<button
				type="button"
				class="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-muted hover:text-heading"
				onclick={() => (searchQuery = '')}
				aria-label="Clear filter"
			>
				✕
			</button>
		{/if}
	</div>

	<span class="order-5 w-full text-sm text-muted sm:order-4 sm:w-auto">
		{#if enabledRepos.length === 0}
			Select repos to view →
		{:else if query}
			{filteredCards.length} of {watchedCards.length} PRs match “{query}”
		{:else}
			{filteredCards.length} of {cards.length} PRs across {columns.length} columns
		{/if}
	</span>

	{#if archivedCount > 0}
		<button
			class="btn-secondary order-6 px-2.5 py-1 text-xs sm:order-5 {showArchived ? 'border-blue-500' : ''}"
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

{#if enabledRepos.length > 0 && query && filteredCards.length === 0}
	<div class="flex items-center gap-2 border-b border-panel px-6 py-1.5 text-xs text-muted">
		<span>🔍 No cards match “{query}”.</span>
		<button type="button" class="text-blue-500 hover:underline" onclick={() => (searchQuery = '')}>
			Clear filter
		</button>
	</div>
{/if}

{#if showActivity}
	<ActivityPanel
		{activities}
		onClose={() => (showActivity = false)}
		onClear={onClearActivity}
		onSelect={selectActivity}
	/>
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
					width={columnWidthPx}
					cards={cardsForColumn(col.id)}
					onDrop={onMoveCard}
					onReorder={onReorderCard}
					onArchive={onArchiveCard}
					onUnarchive={onUnarchiveCard}
					onUpdateNote={onUpdateNote}
					{showArchived}
					onColumnDragStart={() => onColumnDragStart(col.id)}
					onColumnDragEnd={onColumnDragEnd}
					sortMode={col.sortMode ?? 'default'}
					onSort={(mode) => onSortColumn(col.id, mode)}
					grouped={col.grouped ?? false}
					onToggleGroup={(g) => onToggleGroup(col.id, g)}
					collapsedRepos={col.collapsedRepos ?? []}
					onToggleCollapse={(repo) => onToggleGroupCollapse(col.id, repo)}
					{focusedCardId}
					{onSelectCard}
					ciPopoverCardId={ciPopover?.card.id}
					onOpenCIPopover={openCIPopover}
					onScheduleCIPopoverClose={scheduleCIPopoverClose}
					onCloseCIPopover={closeCIPopover}
				/>
			</div>
		{/each}
		{#if orphanedCards().length > 0}
			<KanbanColumn
				col={{ id: ORPHANED_COLUMN_ID, title: '👻 Orphaned' }}
				width={columnWidthPx}
				cards={orphanedCards()}
				onDrop={onMoveCard}
				onReorder={onReorderCard}
				onArchive={onArchiveCard}
				onUnarchive={onUnarchiveCard}
				onUpdateNote={onUpdateNote}
				{showArchived}
				{focusedCardId}
				{onSelectCard}
				ciPopoverCardId={ciPopover?.card.id}
				onOpenCIPopover={openCIPopover}
				onScheduleCIPopoverClose={scheduleCIPopoverClose}
				onCloseCIPopover={closeCIPopover}
			/>
{/if}
</div>

{#if ciPopover}
	<CIChecksPopover
		card={ciPopover.card}
		anchor={ciPopover.anchor}
		onEnter={cancelCIPopoverClose}
		onLeave={scheduleCIPopoverClose}
	/>
{/if}

{/if}
