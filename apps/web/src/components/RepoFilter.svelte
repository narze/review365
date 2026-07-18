<script lang="ts">
	import { searchRepos } from '$lib/board-service';

	let {
		enabledRepos = [],
		repoCounts = new Map<string, number>(),
		onToggle
	}: {
		enabledRepos: string[];
		repoCounts: Map<string, number>;
		onToggle: (repo: string) => void;
	} = $props();

	let open = $state(false);
	let query = $state('');
	let searchResults = $state<string[]>([]);
	let searching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function isStale(repo: string): boolean {
		return !repoCounts.has(repo);
	}

	async function runSearch(q: string) {
		try {
			searchResults = await searchRepos(q.trim());
		} catch {
			// ignore
		}
		searching = false;
	}

	function onQueryInput(e: Event) {
		query = (e.target as HTMLInputElement).value;
		searching = true;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => runSearch(query), 300);
	}

	function toggleDropdown() {
		open = !open;
		if (open && searchResults.length === 0 && !searching) {
			// First open: show all accessible repos immediately so the user
			// doesn't see an empty list and think nothing was fetched.
			searching = true;
			runSearch('');
		}
		if (!open) {
			query = '';
		}
	}

	function handleOutsideClick(e: MouseEvent) {
		const el = e.target as HTMLElement;
		if (!el.closest('.repo-filter')) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleOutsideClick);
		} else {
			document.removeEventListener('click', handleOutsideClick);
		}
	});
</script>

<div class="repo-filter relative">
	<button
		class="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-sm text-heading {open
			? 'border-blue-500'
			: ''}"
		onclick={toggleDropdown}
	>
		<span>📁 Repos ({enabledRepos.length})</span>
		<span class="text-xs text-muted">{open ? '▲' : '▼'}</span>
	</button>

	{#if open}
		<div
			class="thin-scrollbar absolute left-0 top-full z-50 mt-1.5 w-[340px] max-h-[460px] overflow-y-auto rounded-lg border border-control surface-panel p-2 shadow-2xl"
		>
			<div class="px-2 py-1.5">
				<div class="text-xs uppercase tracking-wide text-muted">
					Watching ({enabledRepos.length})
				</div>
				{#if enabledRepos.length === 0}
					<div class="py-2 px-1 text-xs italic text-dim">
						Not watching any repos yet. Search below to add.
					</div>
				{:else}
					{#each enabledRepos as repo (repo)}
						<label
							class="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover-surface {isStale(repo)
								? 'opacity-50'
								: ''}"
						>
							<input type="checkbox" checked onchange={() => onToggle(repo)} />
							<span class="flex-1 truncate text-heading">{repo}</span>
							{#if isStale(repo)}
								<span class="rounded surface-raised px-1.5 py-0.5 text-[10px] text-yellow-600 dark:text-yellow-500"
									>no open PRs</span
								>
							{:else}
								<span class="rounded-full surface-raised px-2 py-0.5 text-xs text-muted"
									>{repoCounts.get(repo) ?? 0}</span
								>
							{/if}
						</label>
					{/each}
				{/if}
			</div>

			<div class="my-1.5 h-px bg-neutral-200 dark:bg-neutral-800"></div>

			<div class="px-2 py-1.5">
				<div class="text-xs uppercase tracking-wide text-muted">Find repos</div>
				<input
					class="input-field mt-1 w-full px-3 py-1.5"
					type="text"
					placeholder="Type to search your repos..."
					value={query}
					oninput={onQueryInput}
				/>
				{#if searching}
					<div class="px-1 py-1.5 text-xs text-dim">Searching...</div>
				{/if}
				{#if !searching && query && searchResults.length === 0}
					<div class="px-1 py-1.5 text-xs text-dim">No matching repos</div>
				{/if}
				{#each searchResults as repo (repo)}
					<label
						class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover-surface {enabledRepos.includes(repo)
							? 'cursor-default opacity-60'
							: 'cursor-pointer'}"
					>
						<input
							type="checkbox"
							checked={enabledRepos.includes(repo)}
							disabled={enabledRepos.includes(repo)}
							onchange={() => onToggle(repo)}
						/>
						<span class="flex-1 truncate text-heading">{repo}</span>
					</label>
				{/each}
			</div>
		</div>
	{/if}
</div>
