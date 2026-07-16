<script lang="ts">
	import type { PRCard, ColumnId, ColumnDef, Platform } from '@review365/api/types';
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
	import { nextCardId, columnEdgeId, type Dir } from '$lib/card-navigation';
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

	// --- Keyboard navigation -------------------------------------------------

	let focusedCardId = $state<string | null>(null);

	// Remembers where a card sat before a keyboard column-move, so moving it back
	// drops it into its old slot instead of the end. Keyed by card id; `beforeId`
	// is the card it used to sit above (null = it was last). Plain memory, not
	// reactive — it only informs the next move.
	const returnSlots = new Map<string, { column: ColumnId; beforeId: string | null }>();

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
			grid.push(vis(cardsForColumn(col.id)).map((c) => c.id));
			colIds.push(col.id);
		}
		const orph = vis(orphanedCards()).map((c) => c.id);
		if (orph.length) {
			grid.push(orph);
			colIds.push('__orphaned__');
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

	function focusPos(): { col: number; row: number } | null {
		if (!focusedCardId) return null;
		for (let c = 0; c < nav.grid.length; c++) {
			const r = nav.grid[c].indexOf(focusedCardId);
			if (r >= 0) return { col: c, row: r };
		}
		return null;
	}

	async function moveFocusedCard(dir: Dir) {
		const pos = focusPos();
		if (!pos || !focusedCardId) return;
		const { col, row } = pos;
		const id = focusedCardId;

		if (dir === 'up' || dir === 'down') {
			const columnId = nav.colIds[col];
			if (columnId === '__orphaned__') return;
			// Reorder writes card `order`; a column shown under an active sort ignores
			// order, so the move would be an invisible no-op — skip it.
			const mode = columnSorts.get(columnId);
			if (mode && mode !== 'default') return;
			const cardIds = nav.grid[col];
			if (dir === 'up') {
				if (row === 0) return;
				onReorderCard(id, cardIds[row - 1], columnId);
			} else {
				if (row >= cardIds.length - 1) return;
				onReorderCard(id, cardIds[row + 2] ?? null, columnId);
			}
		} else {
			const step = dir === 'left' ? -1 : 1;
			const targetIdx = col + step;
			if (targetIdx < 0 || targetIdx >= nav.colIds.length) return;
			const targetColId = nav.colIds[targetIdx];
			if (targetColId === '__orphaned__') return;

			const originColId = nav.colIds[col];
			const targetCol = nav.grid[targetIdx];
			const remembered = returnSlots.get(id);

			let targetCardId: string | null;
			if (remembered && remembered.column === targetColId) {
				// Returning to the column we just left → restore the old slot.
				targetCardId =
					remembered.beforeId && targetCol.includes(remembered.beforeId)
						? remembered.beforeId
						: null;
				returnSlots.delete(id);
			} else {
				// Leaving a column → remember the card we sat above, and land at the
				// same row in the target so the layout stays predictable.
				returnSlots.set(id, { column: originColId, beforeId: nav.grid[col][row + 1] ?? null });
				targetCardId = targetCol[row] ?? null;
			}
			onReorderCard(id, targetCardId, targetColId);
		}

		await tick();
		focusCard(id);
	}

	// Clicking a card makes it the selection: move the ring here and take DOM
	// focus (so Enter/Space/N work), but don't scroll — it's already in view.
	function onSelectCard(id: string) {
		focusedCardId = id;
		findCardEl(id)?.focus({ preventScroll: true });
	}

	function focusColumnEdge(dir: 'up' | 'down') {
		const id = columnEdgeId(nav.grid, focusedCardId, dir === 'up' ? 'top' : 'bottom');
		if (id) focusCard(id);
	}

	// Reorder the focused card to the very top / bottom of its column.
	async function moveFocusedCardToEdge(dir: 'up' | 'down') {
		const pos = focusPos();
		if (!pos || !focusedCardId) return;
		const { col, row } = pos;
		const columnId = nav.colIds[col];
		if (columnId === '__orphaned__') return;
		const mode = columnSorts.get(columnId);
		if (mode && mode !== 'default') return;
		const cardIds = nav.grid[col];
		const id = focusedCardId;
		if (dir === 'up') {
			if (row === 0) return;
			onReorderCard(id, cardIds[0], columnId);
		} else {
			if (row >= cardIds.length - 1) return;
			onReorderCard(id, null, columnId);
		}
		await tick();
		focusCard(id);
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
				if (e.shiftKey) moveFocusedCardToEdge(dir);
				else focusColumnEdge(dir);
			}
			return;
		}

		e.preventDefault();

		if (e.shiftKey) {
			moveFocusedCard(dir);
		} else {
			const next = nextCardId(nav.grid, focusedCardId, dir);
			if (next) focusCard(next);
		}
	}

	$effect(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-panel px-3 py-3 sm:gap-3 sm:px-6">
	<h1 class="order-1 text-lg font-bold text-heading sm:text-xl">Review365</h1>

	<div class="order-2 ml-auto flex gap-2 sm:order-5">
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
					sortMode={columnSorts.get(col.id) ?? 'default'}
					onSort={(mode) => onSortColumn(col.id, mode as SortMode)}
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
				col={{ id: '__orphaned__', title: '👻 Orphaned' }}
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
