<!-- PROTOTYPE — Variant A: inline cluster labels.
     Flat card list; a small header sits above the first card of each repo
     cluster (matches the direction already drafted in
     docs/superpowers/specs/2026-08-10-column-group-by-repo-design.md). -->
<script lang="ts">
	import type { PRCard } from '@review365/api/types';
	import KanbanCard from '../../../components/KanbanCard.svelte';

	let { cards, grouped }: { cards: PRCard[]; grouped: boolean } = $props();
</script>

<div class="thin-scrollbar flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
	{#each cards as card, i (card.id)}
		{#if grouped && (i === 0 || cards[i - 1].repo !== card.repo)}
			<div
				class="mt-1 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-faint first:mt-0"
			>
				<span class="truncate">{card.repo}</span>
				<span class="shrink-0 normal-case tracking-normal">
					· {cards.filter((c) => c.repo === card.repo).length}
				</span>
			</div>
		{/if}
		<KanbanCard {card} />
	{/each}
</div>
