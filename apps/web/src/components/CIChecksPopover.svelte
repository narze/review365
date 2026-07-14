<script lang="ts">
	import type { PRCard } from '@review365/api/types';
	import { groupChecks } from '$lib/ci-checks';

	let { card, anchor, onEnter, onLeave }: {
		card: PRCard;
		anchor: DOMRect;
		onEnter: () => void;
		onLeave: () => void;
	} = $props();

	let showAllPassedChecks = $state(false);
	const checkGroups = $derived(groupChecks(card.ciStatus?.checks ?? []));
	const left = $derived(Math.max(8, Math.min(anchor.left, window.innerWidth - 272)));
	const top = $derived(anchor.bottom + 4);
</script>

<div
	class="fixed z-50 w-64 rounded-md border border-panel surface-raised text-xs shadow-lg"
	style={`left: ${left}px; top: ${top}px;`}
	role="dialog"
	tabindex="-1"
	aria-label="CI checks"
	onmouseenter={onEnter}
	onmouseleave={onLeave}
>
	<div class="sticky top-0 flex items-center justify-between border-b border-panel surface-raised px-2 py-1.5">
		<span class="font-medium text-heading">CI checks</span>
		<span class="text-muted">
			{#if checkGroups.failedCount > 0}{checkGroups.failedCount} failed{/if}{#if checkGroups.failedCount > 0 && checkGroups.pendingCount > 0} · {/if}{#if checkGroups.pendingCount > 0}{checkGroups.pendingCount} running{/if}{#if checkGroups.failedCount === 0 && checkGroups.pendingCount === 0}{checkGroups.passed.length} passed{/if}
		</span>
	</div>
	<div class="max-h-72 overflow-y-auto p-2">
		{#each checkGroups.attention as check}
			{@const checkIcon = check.state === 'failure' ? '✕' : '◌'}
			<div class="flex items-center gap-1.5 py-0.5 text-body">
				<span class={check.state === 'failure' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}>{checkIcon}</span>
				<span class="truncate">{check.name}</span>
			</div>
		{/each}
		{#each showAllPassedChecks ? checkGroups.passed : checkGroups.visiblePassed as check}
			<div class="flex items-center gap-1.5 py-0.5 text-body">
				<span class="text-green-600 dark:text-green-400">✓</span>
				<span class="truncate">{check.name}</span>
			</div>
		{/each}
		{#if !showAllPassedChecks && checkGroups.hiddenPassedCount > 0}
			<button type="button" class="mt-1 text-blue-500 hover:underline" onclick={() => (showAllPassedChecks = true)}>
				Show {checkGroups.hiddenPassedCount} more passed checks
			</button>
		{:else if showAllPassedChecks && checkGroups.hiddenPassedCount > 0}
			<button type="button" class="mt-1 text-blue-500 hover:underline" onclick={() => (showAllPassedChecks = false)}>
				Show fewer checks
			</button>
		{/if}
		<a href={`${card.url}/checks`} target="_blank" rel="noreferrer" class="mt-2 block text-blue-500 hover:underline">
			Open checks on GitHub ↗
		</a>
	</div>
</div>
