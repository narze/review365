<!-- PROTOTYPE — Variant C: color-coded, no header rows.
     No structural change to the list — grouping only reorders cards and
     tags each one with a colored left stripe per repo, plus a small legend. -->
<script lang="ts">
	import type { PRCard } from '@review365/api/types';
	import KanbanCard from '../../../components/KanbanCard.svelte';
	import { paletteForRepo } from './group-helpers';

	let { cards, grouped }: { cards: PRCard[]; grouped: boolean } = $props();

	const repos = $derived([...new Set(cards.map((c) => c.repo))].sort((a, b) => a.localeCompare(b)));
</script>

{#if grouped}
	<div class="flex flex-wrap items-center gap-2 px-3 pt-2 text-[11px] text-muted">
		{#each repos as repo (repo)}
			{@const p = paletteForRepo(repos, repo)}
			<span class="inline-flex items-center gap-1">
				<span aria-hidden="true" class="h-2 w-2 rounded-full {p.dot}"></span>
				{repo}
			</span>
		{/each}
	</div>
{/if}
<div class="thin-scrollbar flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
	{#each cards as card (card.id)}
		{#if grouped}
			{@const p = paletteForRepo(repos, card.repo)}
			<div class="rounded-lg border-l-4 {p.border}">
				<KanbanCard {card} />
			</div>
		{:else}
			<KanbanCard {card} />
		{/if}
	{/each}
</div>
