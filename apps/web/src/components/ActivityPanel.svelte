<script lang="ts">
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

	function label(activity: ActivityEvent): string {
		switch (activity.type) {
			case 'discovered': return 'was discovered';
			case 'moved': return `moved from ${activity.fromColumn} to ${activity.toColumn}`;
			case 'archived': return 'was archived';
			case 'unarchived': return 'was restored';
			case 'note-added': return 'got a note';
			case 'note-updated': return 'had its note updated';
			case 'note-removed': return 'had its note removed';
		}
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

<div class="fixed inset-0 z-40 bg-black/40" role="presentation" onclick={onClose}></div>
<dialog
	open
	class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-panel surface-panel shadow-2xl"
	aria-label="Activity"
	onkeydown={(event) => event.key === 'Escape' && onClose()}
>
	<div class="flex items-center gap-3 border-b border-panel px-4 py-3">
		<div class="min-w-0 flex-1">
			<h2 class="text-base font-semibold text-heading">Activity</h2>
			<p class="text-xs text-muted">Recent PR and MR changes on this board</p>
		</div>
		<button class="btn-secondary px-2.5 py-1.5 text-xs" type="button" onclick={clear}>Clear</button>
		<button class="btn-secondary px-2.5 py-1.5" type="button" aria-label="Close activity" onclick={onClose}>×</button>
	</div>

	<div class="grid gap-2 border-b border-panel p-4">
		<input class="input-field px-3 py-2 text-sm" placeholder="Search PRs and repos" bind:value={query} />
		<select class="input-field px-3 py-2 text-sm" aria-label="Filter activity type" bind:value={type}>
			<option value="all">All activity</option>
			<option value="discovered">Discovered</option>
			<option value="moved">Moved</option>
			<option value="archived">Archived</option>
			<option value="unarchived">Restored</option>
			<option value="note-added">Notes added</option>
			<option value="note-updated">Notes updated</option>
			<option value="note-removed">Notes removed</option>
		</select>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto p-3">
		{#if visibleActivities.length === 0}
			<div class="grid min-h-48 place-items-center text-center">
				<div>
					<p class="font-medium text-heading">No activity yet</p>
					<p class="mt-1 text-sm text-muted">New card actions will appear here.</p>
				</div>
			</div>
		{:else}
			<ul class="space-y-2" aria-label="Activity events">
				{#each visibleActivities as activity (activity.id)}
					<li>
						<button
							type="button"
							class="w-full rounded-lg border border-panel p-3 text-left transition-colors hover:surface-raised focus-visible:outline-2 focus-visible:outline-blue-500"
							onclick={() => onSelect(activity)}
						>
							<div class="flex items-start justify-between gap-3">
								<span class="text-xs font-medium text-blue-500 dark:text-blue-400">
									{activity.card.repo} {activity.card.platform === 'gitlab' ? '!' : '#'}{activity.card.number}
								</span>
								<time class="shrink-0 text-xs text-muted" datetime={activity.createdAt} title={new Date(activity.createdAt).toLocaleString()}>{timeAgo(activity.createdAt)}</time>
							</div>
							<p class="mt-1 line-clamp-2 text-sm font-medium text-heading">{activity.card.title}</p>
							<div class="mt-1.5 flex items-center gap-2 text-xs text-muted">
								<span class="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 dark:text-blue-300">{activity.source === 'manual' ? 'You' : 'Automation'}</span>
								<span>{label(activity)}</span>
							</div>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</dialog>
