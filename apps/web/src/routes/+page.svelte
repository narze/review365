<script lang="ts">
	import KanbanBoard from '../components/KanbanBoard.svelte';
	import { onMount } from 'svelte';
	import type { PRCard, ColumnId, ColumnDef, Signal, Platform } from '@review365/api/types';
	import { DEFAULT_CONFIG } from '@review365/api/types';
	import { hasToken, getPlatform, getLogin, setPlatform } from '$lib/auth';
	import {
		listPRs,
		loadLocalBoard,
		loadCachedCards,
		hasCachedCards,
		board,
		config as configService
	} from '$lib/board-service';

	let signedIn = $state(hasToken());
	let platform = $state<Platform>(getPlatform());
	let login = $state<string | null>(getLogin());

	// Repos/columns/rules/retention are pure local config: always read fresh from
	// localStorage, never round-tripped through a fetch response (see board-service).
	const initialLocal = hasToken() ? loadLocalBoard() : null;

	let cards = $state<PRCard[]>(hasToken() ? loadCachedCards() : []);
	let columns = $state<ColumnDef[]>(initialLocal?.columns ?? DEFAULT_CONFIG.columns);
	let enabledRepos = $state<string[]>(initialLocal?.enabledRepos ?? []);
	let rules = $state<{ id: string; signal: string; columnId: string }[]>(
		initialLocal?.rules ?? DEFAULT_CONFIG.rules
	);
	let orphans = $state<{ cardId: string; column: ColumnId }[]>(initialLocal?.orphans ?? []);
	let signalLabels = $state<Record<string, string>>(initialLocal?.signalLabels ?? {});
	let mergedRetentionDays = $state<number>(
		initialLocal?.mergedRetentionDays ?? DEFAULT_CONFIG.mergedRetentionDays ?? 14
	);
	let columnWidthPx = $state<number>(
		initialLocal?.columnWidthPx ?? DEFAULT_CONFIG.columnWidthPx ?? 300
	);
	let slaWarningDays = $state<number>(
		initialLocal?.slaWarningDays ?? DEFAULT_CONFIG.slaWarningDays ?? 3
	);
	let slaCriticalDays = $state<number>(
		initialLocal?.slaCriticalDays ?? DEFAULT_CONFIG.slaCriticalDays ?? 7
	);
	// True only while there are no cards to show yet (first-ever visit, nothing fetched).
	// Once we have cached or fetched cards, later refreshes happen quietly in the background.
	let loading = $state(hasToken() && !hasCachedCards());
	let online = $state(typeof navigator === 'undefined' || navigator.onLine);
	// Bumped by every local card edit (repo toggle, move, archive, note...) so a fetch that
	// was already in flight when the edit happened doesn't resolve and overwrite it with
	// the pre-edit state it captured when it started.
	let cardsEditSeq = 0;

	/** Paints a platform's local config + last-known cards immediately, before any fetch resolves. */
	function hydrate() {
		const local = loadLocalBoard();
		columns = local.columns;
		enabledRepos = local.enabledRepos;
		rules = local.rules;
		orphans = local.orphans;
		signalLabels = local.signalLabels;
		mergedRetentionDays = local.mergedRetentionDays;
		columnWidthPx = local.columnWidthPx;
		slaWarningDays = local.slaWarningDays;
		slaCriticalDays = local.slaCriticalDays;
		cards = loadCachedCards();
		loading = !hasCachedCards();
	}

	async function refresh(force = false) {
		if (!signedIn || !online) return;
		const seq = cardsEditSeq;
		try {
			const data = await listPRs(force);
			if (cardsEditSeq !== seq) {
				// A card edit landed locally while this fetch was in flight; applying its
				// result now would revert that edit, so refetch instead of overwriting it.
				await refresh(force);
				return;
			}
			cards = data.cards;
			orphans = data.orphans;
			signalLabels = data.signalLabels;
		} catch {
			// GitHub unreachable or token revoked; keep last known board
		} finally {
			loading = false;
		}
	}

	async function onToggleRepo(repo: string) {
		cardsEditSeq++;
		const wasEnabled = enabledRepos.includes(repo);
		enabledRepos = wasEnabled ? enabledRepos.filter((r) => r !== repo) : [...enabledRepos, repo];
		if (wasEnabled) {
			cards = cards.filter((c) => c.repo !== repo);
		}
		await board.toggleRepo(repo);
		if (!wasEnabled) {
			await refresh(true);
		}
	}

	async function onMoveCard(cardId: string, column: ColumnId) {
		cardsEditSeq++;
		cards = cards.map((c) =>
			c.id === cardId ? { ...c, columnId: column, order: Date.now() } : c
		);
		await board.moveCard(cardId, column);
	}

	async function onReorderCard(cardId: string, targetCardId: string | null, column: ColumnId) {
		cardsEditSeq++;
		cards = cards.map((c) =>
			c.id === cardId ? { ...c, columnId: column } : c
		);

		let colCards = cards
			.filter((c) => c.columnId === column && !c.archived)
			.sort((a, b) => a.order - b.order);

		const movedIdx = colCards.findIndex((c) => c.id === cardId);
		if (movedIdx >= 0) {
			const [moved] = colCards.splice(movedIdx, 1);
			let insertIdx = colCards.length;
			if (targetCardId) {
				const targetIdx = colCards.findIndex((c) => c.id === targetCardId);
				if (targetIdx >= 0) insertIdx = targetIdx;
			}
			colCards.splice(insertIdx, 0, moved);
		}

		const base = Date.now();
		const orderMap = new Map<string, number>();
		colCards.forEach((c, i) => orderMap.set(c.id, base + i));

		cards = cards.map((c) => {
			const o = orderMap.get(c.id);
			return o != null ? { ...c, order: o } : c;
		});

		await board.reorderCard(cardId, targetCardId, column);
	}

	async function onArchiveCard(cardId: string) {
		cardsEditSeq++;
		cards = cards.map((c) => (c.id === cardId ? { ...c, archived: true } : c));
		await board.archiveCard(cardId);
	}

	async function onUnarchiveCard(cardId: string) {
		cardsEditSeq++;
		cards = cards.map((c) => (c.id === cardId ? { ...c, archived: false } : c));
		await board.unarchiveCard(cardId);
	}

	async function onUpdateNote(cardId: string, note: string) {
		cardsEditSeq++;
		cards = cards.map((c) => (c.id === cardId ? { ...c, note: note || undefined } : c));
		await board.updateNote(cardId, note);
	}

	function applyConfig(updated: { columns: ColumnDef[]; rules: unknown[] }) {
		columns = updated.columns;
		rules = updated.rules as typeof rules;
	}

	async function onAddColumn(title: string) {
		applyConfig(await configService.addColumn(title));
	}

	async function onRenameColumn(id: string, title: string) {
		applyConfig(await configService.renameColumn(id, title));
	}

	async function onDeleteColumn(id: string) {
		applyConfig(await configService.deleteColumn(id));
	}

	async function onAddRule(signal: string, columnId: string) {
		applyConfig(await configService.addRule(signal as Signal, columnId));
	}

	async function onDeleteRule(id: string) {
		applyConfig(await configService.deleteRule(id));
	}

	async function onReorderColumns(ids: string[]) {
		const map = new Map(columns.map((c) => [c.id, c]));
		columns = ids.map((id) => map.get(id)!).filter(Boolean);
		applyConfig(await configService.reorderColumns(ids));
	}

	async function onSetRetention(days: number) {
		mergedRetentionDays = days;
		await configService.setRetention(days);
	}

	async function onSetColumnWidth(px: number) {
		columnWidthPx = px;
		await configService.setColumnWidth(px);
	}

	function onSignOut() {
		signedIn = false;
		login = null;
		cards = [];
		enabledRepos = [];
		orphans = [];
	}

	function onSwitchPlatform(next: Platform) {
		setPlatform(next);
		platform = next;
		login = getLogin(next);
		hydrate();
		if (hasToken(next)) {
			signedIn = true;
			refresh(true);
		} else {
			signedIn = false;
		}
	}

	let interval: ReturnType<typeof setInterval>;
	onMount(() => {
		refresh(false);
		interval = setInterval(() => refresh(false), 5 * 60 * 1000);

		const goOnline = () => {
			online = true;
			refresh(false);
		};
		const goOffline = () => {
			online = false;
		};
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);

		return () => {
			clearInterval(interval);
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	});
</script>

<svelte:head>
	<title>Review365</title>
	<meta name="description" content="A Kanban board for tracking PR/MR reviews across your repos" />
</svelte:head>

{#if !signedIn}
	<div class="flex min-h-[60vh] items-center justify-center p-6">
		<div class="w-full max-w-lg rounded-xl border border-panel surface-panel p-6">
			<h1 class="mb-1 text-xl font-bold text-heading">Review365</h1>
			<p class="mb-4 text-sm text-muted">
				A kanban board for your pull/merge request reviews, backed by GitHub or GitLab.
			</p>
			<ul class="mb-5 space-y-1.5 text-sm text-muted">
				<li>Board state lives in your browser — there is no review365 account.</li>
				<li>
					Connect with GitHub (OAuth) or paste a personal access token; credentials stay in
					this browser's localStorage.
				</li>
				<li>
					Your token is sent only to the GitHub or GitLab API you choose to connect, never
					anywhere else.
				</li>
			</ul>
			<a
				href="/settings"
				class="block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-blue-500"
			>
				Connect account
			</a>
		</div>
	</div>
{:else}
	<KanbanBoard
		{cards}
		{columns}
		{enabledRepos}
		{rules}
		{orphans}
		{signalLabels}
		{onToggleRepo}
		{onMoveCard}
		{onReorderCard}
		{onArchiveCard}
		{onUnarchiveCard}
		{onUpdateNote}
		{onAddColumn}
		{onRenameColumn}
		{onDeleteColumn}
		{onAddRule}
		{onDeleteRule}
		{onReorderColumns}
		{mergedRetentionDays}
		{onSetRetention}
		{columnWidthPx}
		{onSetColumnWidth}
		{onSignOut}
		{platform}
		{login}
		{onSwitchPlatform}
		{loading}
		{online}
		{slaWarningDays}
		{slaCriticalDays}
		onImported={() => {
			hydrate();
			refresh(true);
		}}
		onRefresh={() => refresh(true)}
	/>
{/if}
