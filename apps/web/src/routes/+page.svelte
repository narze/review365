<script lang="ts">
	import KanbanBoard from '../components/KanbanBoard.svelte';
	import TokenSetup from '../components/TokenSetup.svelte';
	import { onMount } from 'svelte';
	import type { PRCard, ColumnId, ColumnDef, Signal, Platform } from '@review365/api/types';
	import { DEFAULT_CONFIG } from '@review365/api/types';
	import { hasToken, getPlatform, getLogin, setPlatform } from '$lib/auth';
	import { listPRs, board, config as configService } from '$lib/board-service';

	let signedIn = $state(hasToken());
	let platform = $state<Platform>(getPlatform());
	let login = $state<string | null>(getLogin());

	let cards = $state<PRCard[]>([]);
	let columns = $state<ColumnDef[]>(DEFAULT_CONFIG.columns);
	let enabledRepos = $state<string[]>([]);
	let rules = $state<{ id: string; signal: string; columnId: string }[]>(DEFAULT_CONFIG.rules);
	let orphans = $state<{ cardId: string; column: ColumnId }[]>([]);
	let signalLabels = $state<Record<string, string>>({});
	let mergedRetentionDays = $state<number>(DEFAULT_CONFIG.mergedRetentionDays ?? 14);

	async function refresh(force = false) {
		if (!signedIn) return;
		try {
			const data = await listPRs(force);
			cards = data.cards;
			columns = data.columns;
			enabledRepos = data.enabledRepos;
			rules = data.rules;
			orphans = data.orphans;
			signalLabels = data.signalLabels;
			mergedRetentionDays = data.mergedRetentionDays;
		} catch {
			// GitHub unreachable or token revoked; keep last known board
		}
	}

	async function onToggleRepo(repo: string) {
		const wasEnabled = enabledRepos.includes(repo);
		enabledRepos = wasEnabled ? enabledRepos.filter((r) => r !== repo) : [...enabledRepos, repo];
		if (wasEnabled) {
			cards = cards.filter((c) => c.repo !== repo);
		}
		await board.toggleRepo(repo);
	}

	async function onMoveCard(cardId: string, column: ColumnId) {
		cards = cards.map((c) =>
			c.id === cardId ? { ...c, columnId: column, order: Date.now() } : c
		);
		await board.moveCard(cardId, column);
	}

	async function onReorderCard(cardId: string, targetCardId: string | null, column: ColumnId) {
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
		cards = cards.map((c) => (c.id === cardId ? { ...c, archived: true } : c));
		await board.archiveCard(cardId);
	}

	async function onUnarchiveCard(cardId: string) {
		cards = cards.map((c) => (c.id === cardId ? { ...c, archived: false } : c));
		await board.unarchiveCard(cardId);
	}

	async function onUpdateNote(cardId: string, note: string) {
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

	function onSignedIn() {
		platform = getPlatform();
		login = getLogin();
		signedIn = true;
		refresh(true);
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
		cards = [];
		enabledRepos = [];
		orphans = [];
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
		return () => clearInterval(interval);
	});
</script>

{#if !signedIn}
	<TokenSetup onDone={onSignedIn} />
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
		{onSignOut}
		{platform}
		{login}
		{onSwitchPlatform}
		onImported={() => refresh(false)}
		onRefresh={() => refresh(true)}
	/>
{/if}
