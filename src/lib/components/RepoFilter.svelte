<script lang="ts">
	interface RepoWithCount {
		repo: string;
		count: number;
	}

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

	function watchingRepos(): RepoWithCount[] {
		return enabledRepos.map((r) => ({ repo: r, count: repoCounts.get(r) ?? 0 }));
	}

	function isStale(repo: string): boolean {
		return !repoCounts.has(repo);
	}

	async function runSearch(q: string) {
		if (!q.trim()) {
			searchResults = [];
			searching = false;
			return;
		}
		try {
			const res = await fetch(`/api/repos?q=${encodeURIComponent(q.trim())}`);
			if (res.ok) {
				const data = (await res.json()) as { repos: string[] };
				searchResults = data.repos ?? [];
			}
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
		if (!open) {
			query = '';
			searchResults = [];
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

<div class="repo-filter">
	<button class="filter-btn" class:active={open} onclick={toggleDropdown}>
		<span class="filter-icon">📁</span>
		<span>Repos ({enabledRepos.length})</span>
		<span class="chevron">{open ? '▲' : '▼'}</span>
	</button>

	{#if open}
		<div class="dropdown">
			<div class="section">
				<div class="section-title">Watching ({enabledRepos.length})</div>
				{#if enabledRepos.length === 0}
					<div class="empty-hint">Not watching any repos yet. Search below to add.</div>
				{:else}
					{#each watchingRepos() as { repo, count } (repo)}
						<label class="repo-row" class:stale={isStale(repo)}>
							<input type="checkbox" checked onchange={() => onToggle(repo)} />
							<span class="repo-name">{repo}</span>
							{#if isStale(repo)}
								<span class="stale-badge">no open PRs</span>
							{:else}
								<span class="count-badge">{count}</span>
							{/if}
						</label>
					{/each}
				{/if}
			</div>

			<div class="divider"></div>

			<div class="section">
				<div class="section-title">Find repos</div>
				<input
					class="search-input"
					type="text"
					placeholder="Type to search your repos..."
					value={query}
					oninput={onQueryInput}
				/>
				{#if searching}
					<div class="search-status">Searching...</div>
				{/if}
				{#if !searching && query && searchResults.length === 0}
					<div class="search-status">No matching repos</div>
				{/if}
				{#each searchResults as repo (repo)}
					<label class="repo-row" class:disabled={enabledRepos.includes(repo)}>
						<input
							type="checkbox"
							checked={enabledRepos.includes(repo)}
							disabled={enabledRepos.includes(repo)}
							onchange={() => onToggle(repo)}
						/>
						<span class="repo-name">{repo}</span>
					</label>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.repo-filter {
		position: relative;
	}
	.filter-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: #21262d;
		color: #f0f6fc;
		border: 1px solid #30363d;
		border-radius: 6px;
		padding: 6px 12px;
		font-size: 13px;
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.filter-btn:hover {
		border-color: #58a6ff;
	}
	.filter-btn.active {
		border-color: #58a6ff;
	}
	.filter-icon {
		font-size: 14px;
	}
	.chevron {
		font-size: 10px;
		color: #8b949e;
	}
	.dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: 340px;
		max-height: 460px;
		overflow-y: auto;
		background: #161b22;
		border: 1px solid #30363d;
		border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 100;
		padding: 8px;
	}
	.section {
		padding: 4px 0;
	}
	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #8b949e;
		padding: 6px 8px;
	}
	.empty-hint {
		font-size: 12px;
		color: #6e7681;
		padding: 8px;
		font-style: italic;
	}
	.repo-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 13px;
	}
	.repo-row:hover {
		background: #21262d;
	}
	.repo-row.stale {
		opacity: 0.55;
	}
	.repo-row.disabled {
		opacity: 0.6;
		cursor: default;
	}
	.repo-name {
		flex: 1;
		color: #f0f6fc;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count-badge {
		font-size: 11px;
		color: #8b949e;
		background: #21262d;
		padding: 1px 7px;
		border-radius: 10px;
	}
	.stale-badge {
		font-size: 10px;
		color: #d29922;
		background: #21262d;
		padding: 1px 6px;
		border-radius: 8px;
	}
	.divider {
		height: 1px;
		background: #30363d;
		margin: 6px 0;
	}
	.search-input {
		width: 100%;
		box-sizing: border-box;
		background: #0d1117;
		border: 1px solid #30363d;
		border-radius: 6px;
		color: #f0f6fc;
		padding: 7px 10px;
		font-size: 13px;
		margin-bottom: 4px;
	}
	.search-input:focus {
		outline: none;
		border-color: #58a6ff;
	}
	.search-status {
		font-size: 12px;
		color: #6e7681;
		padding: 6px 8px;
	}
</style>
