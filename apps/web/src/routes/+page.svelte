<script lang="ts">
	import KanbanBoard from '../components/KanbanBoard.svelte';
	import { onMount } from 'svelte';
	import type { PRCard, ColumnId, ColumnDef } from '@review365/api/types';

	let { data } = $props();

	let cards = $state<PRCard[]>(data.cards ?? []);
	let columns = $state<ColumnDef[]>(data.columns ?? []);
	let enabledRepos = $state<string[]>(data.enabledRepos ?? []);
	let rules = $state<{ id: string; signal: string; columnId: string }[]>(data.rules ?? []);
	let orphans = $state<{ cardId: string; column: ColumnId }[]>(data.orphans ?? []);
	let signalLabels = $state<Record<string, string>>(data.signalLabels ?? {});

	async function refresh(force = false) {
		try {
			const res = await fetch('/rpc/prs/list', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ json: { force } })
			});
			if (res.ok) {
				const data = (await res.json()) as {
					json: {
						cards: PRCard[];
						columns: ColumnDef[];
						enabledRepos: string[];
						rules: { id: string; signal: string; columnId: string }[];
						orphans: { cardId: string; column: ColumnId }[];
						signalLabels: Record<string, string>;
					};
				};
				cards = data.json.cards ?? [];
				columns = data.json.columns ?? columns;
				enabledRepos = data.json.enabledRepos ?? [];
				rules = data.json.rules ?? rules;
				orphans = data.json.orphans ?? [];
			}
		} catch {
			// ignore
		}
	}

	async function rpc(path: string, body: unknown) {
		return fetch(`/rpc/${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ json: body })
		});
	}

	async function onToggleRepo(repo: string) {
		const wasEnabled = enabledRepos.includes(repo);
		enabledRepos = wasEnabled ? enabledRepos.filter((r) => r !== repo) : [...enabledRepos, repo];
		if (wasEnabled) {
			const prefix = `pr_${repo.replace('/', '_')}_`;
			cards = cards.filter((c) => !c.id.startsWith(prefix));
		}
		await rpc('board/toggleRepo', { repo });
	}

	async function onMoveCard(cardId: string, column: ColumnId) {
		cards = cards.map((c) =>
			c.id === cardId ? { ...c, columnId: column, order: Date.now() } : c
		);
		await rpc('board/moveCard', { cardId, column });
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

		await rpc('board/reorderCard', { cardId, targetCardId, column });
	}

	async function onArchiveCard(cardId: string) {
		cards = cards.map((c) => (c.id === cardId ? { ...c, archived: true } : c));
		await rpc('board/archiveCard', { cardId });
	}

	async function onUnarchiveCard(cardId: string) {
		cards = cards.map((c) => (c.id === cardId ? { ...c, archived: false } : c));
		await rpc('board/unarchiveCard', { cardId });
	}

	async function rpcConfig(path: string, body: unknown) {
		const res = await rpc(`config/${path}`, body);
		if (res.ok) {
			const data = (await res.json()) as { json: { columns: ColumnDef[]; rules: unknown[] } };
			columns = data.json.columns;
			rules = data.json.rules as typeof rules;
		}
	}

	async function onAddColumn(title: string) {
		await rpcConfig('columns/add', { title });
	}

	async function onRenameColumn(id: string, title: string) {
		await rpcConfig('columns/rename', { id, title });
	}

	async function onDeleteColumn(id: string) {
		await rpcConfig('columns/delete', { id });
	}

	async function onAddRule(signal: string, columnId: string) {
		await rpcConfig('rules/add', { signal, columnId });
	}

	async function onDeleteRule(id: string) {
		await rpcConfig('rules/delete', { id });
	}

	let interval: ReturnType<typeof setInterval>;
	onMount(() => {
		interval = setInterval(() => refresh(false), 5 * 60 * 1000);
		return () => clearInterval(interval);
	});
</script>

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
	{onAddColumn}
	{onRenameColumn}
	{onDeleteColumn}
	{onAddRule}
	{onDeleteRule}
	onRefresh={() => refresh(true)}
/>
