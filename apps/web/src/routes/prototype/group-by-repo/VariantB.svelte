<!-- PROTOTYPE — Variant B: collapsible per-repo sections.
     Each repo becomes its own accordion section (expanded by default) with a
     count badge, so a busy column can be collapsed down to just headers. -->
<script lang="ts">
	import type { PRCard } from '@review365/api/types';
	import KanbanCard from '../../../components/KanbanCard.svelte';

	let { cards, grouped }: { cards: PRCard[]; grouped: boolean } = $props();

	type Section = { repo: string; cards: PRCard[] };

	const sections = $derived.by((): Section[] => {
		if (!grouped) return [{ repo: '__flat__', cards }];
		const map = new Map<string, PRCard[]>();
		for (const card of cards) {
			let bucket = map.get(card.repo);
			if (!bucket) {
				bucket = [];
				map.set(card.repo, bucket);
			}
			bucket.push(card);
		}
		return [...map.entries()].map(([repo, cards]) => ({ repo, cards }));
	});

	let collapsed = $state<Set<string>>(new Set());

	function toggle(repo: string) {
		const next = new Set(collapsed);
		if (next.has(repo)) next.delete(repo);
		else next.add(repo);
		collapsed = next;
	}
</script>

<div class="thin-scrollbar flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2">
	{#each sections as section (section.repo)}
		{#if grouped}
			<div class="overflow-hidden rounded-lg border border-panel">
				<button
					type="button"
					class="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover-surface"
					onclick={() => toggle(section.repo)}
					aria-expanded={!collapsed.has(section.repo)}
				>
					<span class="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-heading">
						<span
							aria-hidden="true"
							class="inline-block shrink-0 transition-transform {collapsed.has(section.repo)
								? '-rotate-90'
								: ''}"
						>
							▾
						</span>
						<span class="truncate">{section.repo}</span>
					</span>
					<span
						class="shrink-0 rounded-full border border-panel surface-sunken px-1.5 py-0.5 text-[10px] text-muted"
					>
						{section.cards.length}
					</span>
				</button>
				{#if !collapsed.has(section.repo)}
					<div class="flex flex-col gap-2 border-t border-panel p-2">
						{#each section.cards as card (card.id)}
							<KanbanCard {card} />
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			{#each section.cards as card (card.id)}
				<KanbanCard {card} />
			{/each}
		{/if}
	{/each}
</div>
