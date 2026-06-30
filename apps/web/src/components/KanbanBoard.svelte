<script lang="ts">
	import type { PRCard, ColumnId, ColumnDef } from '@review365/api/types';
	import KanbanColumn from './KanbanColumn.svelte';
	import RepoFilter from './RepoFilter.svelte';
	import ColumnManager from './ColumnManager.svelte';
	import RuleManager from './RuleManager.svelte';
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
		onAddColumn,
		onRenameColumn,
		onDeleteColumn,
		onAddRule,
		onDeleteRule
	}: {
		cards: PRCard[];
		columns: ColumnDef[];
		enabledRepos: string[];
		rules: { id: string; signal: string; columnId: string }[];
		orphans: { cardId: string; column: ColumnId }[];
		signalLabels: Record<string, string>;
		onToggleRepo: (repo: string) => void;
		onMoveCard: (cardId: string, column: ColumnId) => void;
		onAddColumn: (title: string) => void;
		onRenameColumn: (id: string, title: string) => void;
		onDeleteColumn: (id: string) => void;
		onAddRule: (signal: string, columnId: string) => void;
		onDeleteRule: (id: string) => void;
	} = $props();

	let showSettings = $state(false);

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

	function cardsForColumn(columnId: ColumnId): PRCard[] {
		return filteredCards.filter((c) => c.columnId === columnId);
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
	<div class="ml-auto">
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
			<ColumnManager {columns} onAdd={onAddColumn} onRename={onRenameColumn} onDelete={onDeleteColumn} />
			<RuleManager {columns} {rules} {signalLabels} onAdd={onAddRule} onDelete={onDeleteRule} />
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
			<KanbanColumn {col} cards={cardsForColumn(col.id)} onDrop={onMoveCard} />
		{/each}
		{#if orphanedCards().length > 0}
			<KanbanColumn
				col={{ id: '__orphaned__', title: '👻 Orphaned' }}
				cards={orphanedCards()}
				onDrop={onMoveCard}
			/>
		{/if}
	</div>
{/if}
