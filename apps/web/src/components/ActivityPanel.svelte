<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { ActivityEvent, ActivityType } from '$lib/activity';
	import { filterActivities } from '$lib/activity';

	let { activities, onClose, onClear, onSelect }: {
		activities: ActivityEvent[];
		onClose: () => void;
		onClear: () => void;
		onSelect: (activity: ActivityEvent) => void;
	} = $props();

	let query = $state('');
	let type = $state<ActivityType | 'all'>('all');
	const visibleActivities = $derived(filterActivities(activities, query, type));
	const groups = $derived(groupByDay(visibleActivities));

	const reduceMotion =
		typeof window !== 'undefined' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Each event type gets an emoji marker, a tinted ring on that marker, and a
	// matching accent on the verb — so the feed is scannable by type at a glance.
	const TYPE_META: Record<ActivityType, { emoji: string; ring: string; verb: string; word: string }> = {
		discovered: { emoji: '✨', ring: 'ring-sky-500/40', verb: 'text-sky-600 dark:text-sky-400', word: 'discovered' },
		moved: { emoji: '➡️', ring: 'ring-violet-500/40', verb: 'text-violet-600 dark:text-violet-400', word: 'moved' },
		archived: { emoji: '📦', ring: 'ring-amber-500/40', verb: 'text-amber-600 dark:text-amber-400', word: 'archived' },
		unarchived: { emoji: '📤', ring: 'ring-emerald-500/40', verb: 'text-emerald-600 dark:text-emerald-400', word: 'restored' },
		'note-added': { emoji: '📝', ring: 'ring-teal-500/40', verb: 'text-teal-600 dark:text-teal-400', word: 'added a note' },
		'note-updated': { emoji: '✏️', ring: 'ring-teal-500/40', verb: 'text-teal-600 dark:text-teal-400', word: 'updated the note' },
		'note-removed': { emoji: '🗑️', ring: 'ring-rose-500/40', verb: 'text-rose-600 dark:text-rose-400', word: 'removed the note' }
	};

	function startOfDay(d: Date): number {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	}

	function dayLabel(timestamp: string): string {
		const date = new Date(timestamp);
		const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
		if (days <= 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function groupByDay(events: ActivityEvent[]): { label: string; events: ActivityEvent[] }[] {
		const out: { label: string; events: ActivityEvent[] }[] = [];
		for (const event of events) {
			const label = dayLabel(event.createdAt);
			const current = out.at(-1);
			if (current?.label === label) current.events.push(event);
			else out.push({ label, events: [event] });
		}
		return out;
	}

	function timeAgo(timestamp: string): string {
		const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
		if (seconds < 60) return 'just now';
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
		if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
		return `${Math.floor(seconds / 86400)}d ago`;
	}

	function clear() {
		if (window.confirm('Clear this platform\'s activity history?')) onClear();
	}
</script>

<div
	class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
	role="presentation"
	onclick={onClose}
	transition:fade={{ duration: reduceMotion ? 0 : 150 }}
></div>
<dialog
	open
	class="fixed inset-y-0 right-0 left-auto z-50 m-0 flex h-full w-full max-h-none max-w-[26rem] flex-col border-l border-panel surface-panel text-heading shadow-2xl"
	aria-label="Activity"
	onkeydown={(event) => event.key === 'Escape' && onClose()}
	transition:fly={{ x: reduceMotion ? 0 : 400, duration: reduceMotion ? 0 : 250 }}
>
	<header class="flex items-center gap-3 border-b border-panel px-4 py-3.5">
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<h2 class="text-sm font-semibold text-heading">Activity</h2>
				{#if activities.length > 0}
					<span class="rounded-full surface-raised px-2 py-0.5 text-xs font-medium tabular-nums text-muted">{activities.length}</span>
				{/if}
			</div>
			<p class="mt-0.5 text-xs text-muted">Recent changes across your board</p>
		</div>
		{#if activities.length > 0}
			<button
				class="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-rose-400"
				type="button"
				onclick={clear}
			>Clear</button>
		{/if}
		<button
			class="grid h-8 w-8 place-items-center rounded-md text-muted transition-colors hover-surface hover:text-heading focus-visible:outline-2 focus-visible:outline-blue-500"
			type="button"
			aria-label="Close activity"
			onclick={onClose}
		>
			<svg viewBox="0 0 20 20" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
				<path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" />
			</svg>
		</button>
	</header>

	<div class="flex items-center gap-2 border-b border-panel px-4 py-3">
		<div class="relative flex-1">
			<svg viewBox="0 0 20 20" class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
				<circle cx="9" cy="9" r="5.5" />
				<path d="M13.5 13.5L17 17" stroke-linecap="round" />
			</svg>
			<input class="input-field w-full py-2 pl-8 pr-3 text-sm" placeholder="Search PRs and repos" bind:value={query} />
		</div>
		<select class="input-field px-2.5 py-2 text-sm" aria-label="Filter activity type" bind:value={type}>
			<option value="all">All</option>
			<option value="discovered">Discovered</option>
			<option value="moved">Moved</option>
			<option value="archived">Archived</option>
			<option value="unarchived">Restored</option>
			<option value="note-added">Notes added</option>
			<option value="note-updated">Notes updated</option>
			<option value="note-removed">Notes removed</option>
		</select>
	</div>

	<div class="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
		{#if visibleActivities.length === 0}
			<div class="grid min-h-64 place-items-center text-center">
				<div class="max-w-[15rem]">
					<div class="mx-auto grid h-12 w-12 place-items-center rounded-full surface-raised text-xl">
						{activities.length === 0 ? '🕘' : '🔍'}
					</div>
					{#if activities.length === 0}
						<p class="mt-3 font-medium text-heading">No activity yet</p>
						<p class="mt-1 text-sm text-muted">Card moves, notes, and new PRs will show up here.</p>
					{:else}
						<p class="mt-3 font-medium text-heading">No matching activity</p>
						<p class="mt-1 text-sm text-muted">Try a different search term or filter.</p>
					{/if}
				</div>
			</div>
		{:else}
			{#each groups as group (group.label)}
				<section>
					<h3 class="sticky top-0 z-10 -mx-4 mb-1 bg-white/85 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur dark:bg-neutral-900/85">
						{group.label}
					</h3>
					<ol aria-label="Activity events">
						{#each group.events as activity, index (activity.id)}
							{@const meta = TYPE_META[activity.type]}
							<li class="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 {index === group.events.length - 1 ? '' : 'pb-3'}">
								{#if index !== group.events.length - 1}
									<span class="absolute left-[17px] top-9 bottom-0 w-px bg-neutral-200 dark:bg-neutral-800" aria-hidden="true"></span>
								{/if}
								<span class="z-[1] grid h-9 w-9 place-items-center rounded-full surface-raised text-sm ring-1 {meta.ring}" aria-hidden="true">
									{meta.emoji}
								</span>
								<button
									type="button"
									class="-mt-0.5 w-full rounded-lg px-2.5 py-1.5 text-left transition-colors hover:surface-raised focus-visible:outline-2 focus-visible:outline-blue-500"
									onclick={() => onSelect(activity)}
								>
									<div class="flex items-baseline justify-between gap-2">
										<span class="truncate text-xs font-medium text-blue-600 dark:text-blue-400">
											{activity.card.repo} {activity.card.platform === 'gitlab' ? '!' : '#'}{activity.card.number}
										</span>
										<time class="shrink-0 text-xs text-muted" datetime={activity.createdAt} title={new Date(activity.createdAt).toLocaleString()}>{timeAgo(activity.createdAt)}</time>
									</div>
									<p class="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-heading">{activity.card.title}</p>
									<p class="mt-1 text-xs text-body">
										<span class="font-medium text-heading">{activity.source === 'manual' ? 'You' : 'Automation'}</span>
										<span class="{meta.verb} font-medium">{meta.word}</span>{#if activity.type === 'moved'}<span class="text-muted">&nbsp;· {activity.fromColumn} → {activity.toColumn}</span>{/if}
									</p>
								</button>
							</li>
						{/each}
					</ol>
				</section>
			{/each}
		{/if}
	</div>
</dialog>
