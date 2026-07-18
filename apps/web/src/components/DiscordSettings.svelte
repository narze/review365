<script lang="ts">
	import { fade } from 'svelte/transition';
	import type { ColumnDef, DiscordConfig } from '@review365/api/types';
	import { config as configService, sendTestMessage } from '$lib/board-service';

	let {
		columns = [],
		current = undefined,
		onSaved
	}: {
		columns: ColumnDef[];
		current?: DiscordConfig;
		onSaved?: () => void;
	} = $props();

	let webhookUrl = $state(current?.webhookUrl ?? '');
	let botName = $state(current?.botName ?? 'Review365');
	let notifyColumnIds = $state<string[]>(current?.notifyColumnIds ?? []);
	let testing = $state(false);
	let testResult = $state<{ ok: boolean; message: string } | null>(null);
	let saving = $state(false);
	let saveResult = $state<{ ok: boolean; message: string } | null>(null);
	let saveResultTimer: ReturnType<typeof setTimeout> | undefined;

	function showSaveResult(ok: boolean, message: string) {
		saveResult = { ok, message };
		if (saveResultTimer) clearTimeout(saveResultTimer);
		// Longer duration (6s) and the slide-in animation below make the
		// confirmation visible even if the user's eye is elsewhere.
		saveResultTimer = setTimeout(() => {
			saveResult = null;
		}, 6000);
	}

	function toggleColumn(id: string) {
		notifyColumnIds = notifyColumnIds.includes(id)
			? notifyColumnIds.filter((c) => c !== id)
			: [...notifyColumnIds, id];
		// clear stale test result
		testResult = null;
	}

	async function handleTest() {
		if (!webhookUrl.trim()) {
			testResult = { ok: false, message: 'Enter a webhook URL first' };
			return;
		}
		testing = true;
		testResult = null;
		const ok = await sendTestMessage(webhookUrl.trim(), botName.trim() || 'Review365');
		testResult = {
			ok,
			message: ok ? 'Sent — check your Discord channel' : 'Failed (wrong URL? rate-limited?)'
		};
		testing = false;
	}

	async function handleSave() {
		saving = true;
		saveResult = null;
		try {
			await configService.setDiscord({
				webhookUrl: webhookUrl.trim(),
				botName: botName.trim() || 'Review365',
				notifyColumnIds
			});
			showSaveResult(true, 'Saved — Discord is wired up');
			onSaved?.();
		} catch {
			showSaveResult(false, 'Save failed');
		}
		saving = false;
	}

	async function handleClear() {
		saving = true;
		try {
			await configService.clearDiscord();
			webhookUrl = '';
			botName = 'Review365';
			notifyColumnIds = [];
			testResult = null;
			showSaveResult(true, 'Discord cleared');
			onSaved?.();
		} catch {
			showSaveResult(false, 'Clear failed');
		}
		saving = false;
	}
</script>

<div class="rounded-lg border border-panel surface-panel p-4">
	<div class="mb-3 flex items-center gap-2">
		<span class="text-lg">🔔</span>
		<h3 class="text-sm font-semibold text-heading">Discord Notifications</h3>
	</div>
	<p class="mb-4 text-xs text-muted">
		Get a Discord ping when a card moves into a watched column. Webhook URL stays in your browser —
		Review365 has no backend that sees it.
	</p>

	<div class="mb-3">
		<label class="mb-1 block text-xs font-medium text-body" for="discord-webhook-url">Webhook URL</label>
		<input
			id="discord-webhook-url"
			type="url"
			class="input-field w-full px-3 py-2 text-sm"
			placeholder="https://discord.com/api/webhooks/…"
			bind:value={webhookUrl}
			spellcheck="false"
			autocomplete="off"
		/>
		<p class="mt-1 text-[11px] text-dim">
			Discord channel → ⚙️ Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL
		</p>
		{#if !webhookUrl.trim()}
			<p class="mt-1 text-[11px] italic text-amber-600 dark:text-amber-400">
				Paste a webhook URL above to enable Save.
			</p>
		{/if}
	</div>

	<div class="mb-3">
		<label class="mb-1 block text-xs font-medium text-body" for="discord-bot-name">Bot name</label>
		<input
			id="discord-bot-name"
			type="text"
			class="input-field w-full px-3 py-2 text-sm"
			placeholder="Review365"
			bind:value={botName}
			maxlength={32}
		/>
	</div>

	<div class="mb-4">
		<span class="mb-1 block text-xs font-medium text-body">Ping when card moves to:</span>
		{#if columns.length === 0}
			<p class="text-xs italic text-dim">No columns yet.</p>
		{:else}
			<div class="flex flex-wrap gap-1.5">
				{#each columns as col (col.id)}
					<button
						type="button"
						class="rounded-md border px-2.5 py-1 text-xs transition-colors {notifyColumnIds.includes(col.id)
							? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300'
							: 'border-control surface-raised text-body hover:border-blue-400'}"
						onclick={() => toggleColumn(col.id)}
					>
						{#if notifyColumnIds.includes(col.id)}✅ {:else}⚪ {/if}
						{col.title}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
			onclick={handleSave}
			disabled={saving || !webhookUrl.trim()}
		>
			{saving ? 'Saving…' : 'Save'}
		</button>
		<button
			type="button"
			class="rounded-md surface-raised px-3 py-1.5 text-sm text-body transition-colors hover:bg-neutral-200 disabled:opacity-40 dark:hover:bg-neutral-700"
			onclick={handleTest}
			disabled={testing || !webhookUrl.trim()}
		>
			{testing ? 'Sending…' : 'Send test ping'}
		</button>
		{#if webhookUrl.trim() || notifyColumnIds.length > 0}
			<button
				type="button"
				class="rounded-md px-3 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/30"
				onclick={handleClear}
				disabled={saving}
			>
				Clear
			</button>
		{/if}
		{#if testResult}
			<span class="text-xs {testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
				{testResult.ok ? '✓' : '✗'} {testResult.message}
			</span>
		{/if}
		{#if saveResult}
			<span
				class="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium {saveResult.ok
					? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
					: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'}"
				transition:fade={{ duration: 150 }}
			>
				{saveResult.ok ? '✓' : '✗'} {saveResult.message}
			</span>
		{/if}
	</div>
</div>
