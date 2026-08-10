<!--
	PROTOTYPE — throwaway. Answers: "what should grouping cards by repo look
	like inside a Kanban column?" Three structurally different variants,
	switchable via `?variant=`, on a new `/prototype/group-by-repo` route.

	KanbanColumn.svelte has no realistic host page to prototype live against
	without real GitHub auth, so this is sub-shape B: a throwaway route that
	reuses the real KanbanCard component and design tokens (app.css) against
	fixed fake data, to stay as grounded in the real product as possible.

	Delete this whole `prototype/group-by-repo` folder once a direction is
	picked, and fold the winner into KanbanColumn.svelte per
	docs/superpowers/plans/2026-08-10-column-group-by-repo.md.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { applyTheme, getTheme, setTheme, type Theme } from '$lib/theme';
	import PrototypeSwitcher from './PrototypeSwitcher.svelte';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import { FAKE_CARDS } from './fake-data';
	import { groupByRepo } from './group-helpers';

	const VARIANTS = [
		{ key: 'A', name: 'Inline cluster labels' },
		{ key: 'B', name: 'Collapsible sections' },
		{ key: 'C', name: 'Color-coded, no headers' }
	];

	const variant = $derived.by(() => {
		const requested = page.url.searchParams.get('variant');
		return VARIANTS.some((v) => v.key === requested) ? requested! : 'A';
	});

	// Lives at the page level (not per variant) so flipping between A/B/C
	// compares them on equal footing instead of resetting per switch.
	let grouped = $state(true);

	let theme = $state<Theme>(getTheme());
	onMount(() => applyTheme(theme));
	function onThemeChange(next: Theme) {
		theme = next;
		setTheme(next);
	}

	const orderedCards = $derived(grouped ? groupByRepo(FAKE_CARDS) : FAKE_CARDS);
</script>

<svelte:head>
	<title>Prototype: Group by repo · Review365</title>
</svelte:head>

<div class="mx-auto max-w-md p-6">
	<div
		class="mb-4 rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
	>
		🧪 Prototype — fake data, nothing here is wired to the real board.
		Compare variants with ← / → or the bar below.
	</div>

	<div class="mb-4 flex flex-wrap items-center gap-2">
		<h1 class="text-lg font-bold text-heading">Review365</h1>
		<button
			type="button"
			class="btn-secondary ml-auto px-2.5 py-1 text-xs"
			aria-pressed={grouped}
			onclick={() => (grouped = !grouped)}
		>
			📦 Group by repo: {grouped ? 'on' : 'off'}
		</button>
		<div class="inline-flex rounded-md border border-control p-0.5">
			{#each ['light', 'dark'] as const as t}
				<button
					class="rounded px-2 py-0.5 text-xs font-medium transition-colors {theme === t
						? 'bg-blue-600 text-white'
						: 'text-body hover:text-heading'}"
					onclick={() => onThemeChange(t)}
				>
					{t === 'light' ? '☀️' : '🌙'}
				</button>
			{/each}
		</div>
	</div>

	<div class="w-[320px] rounded-xl border border-panel surface-panel">
		<div class="flex items-center gap-2 border-b border-panel px-3 py-2">
			<span class="truncate text-sm font-semibold text-heading">📥 Inbox</span>
			<span
				class="shrink-0 rounded-full border border-panel surface-sunken px-2 py-0.5 text-xs text-muted"
			>
				{orderedCards.length}
			</span>
		</div>

		{#if variant === 'A'}
			<VariantA cards={orderedCards} {grouped} />
		{:else if variant === 'B'}
			<VariantB cards={orderedCards} {grouped} />
		{:else}
			<VariantC cards={orderedCards} {grouped} />
		{/if}
	</div>

	<details class="mt-4 text-xs text-muted">
		<summary class="cursor-pointer select-none">Card order (debug)</summary>
		<pre
			class="mt-1 overflow-x-auto rounded-lg border border-panel surface-sunken p-2 text-[11px] text-body">{orderedCards
				.map((c) => `${c.repo}#${c.prNumber}`)
				.join('\n')}</pre>
	</details>
</div>

<PrototypeSwitcher variants={VARIANTS} current={variant} />
