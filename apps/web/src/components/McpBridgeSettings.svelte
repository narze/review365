<script lang="ts">
	import { mcpBridge, rotateBridgeToken, setBridgeEnabled } from '$lib/mcp-bridge.svelte';

	const statusLabel = {
		off: '',
		standby: 'Another tab is connected',
		connecting: 'Connecting…',
		connected: 'Connected'
	};

	let copied = $state(false);

	const command = $derived(
		mcpBridge.token
			? `claude mcp add --transport http review365 ${location.origin}/api/mcp --header "Authorization: Bearer ${mcpBridge.token}"`
			: ''
	);

	async function copyCommand() {
		await navigator.clipboard.writeText(command);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<div class="rounded-lg border border-panel p-4">
	<div class="flex items-center gap-3">
		<label class="flex items-center gap-2 text-sm text-body">
			<input
				type="checkbox"
				checked={mcpBridge.enabled}
				onchange={(e) => setBridgeEnabled((e.target as HTMLInputElement).checked)}
			/>
			Allow AI agents to edit this board
		</label>
		{#if mcpBridge.enabled}
			<span
				class="text-xs {mcpBridge.status === 'connected'
					? 'text-green-600 dark:text-green-400'
					: 'text-faint'}"
			>
				{statusLabel[mcpBridge.status]}
			</span>
		{/if}
	</div>
	{#if mcpBridge.enabled && command}
		<p class="mt-3 text-xs text-muted">Add review365 to Claude Code (MCP over HTTP):</p>
		<div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start">
			<code
				data-testid="mcp-add-command"
				class="min-w-0 flex-1 rounded-md border border-control px-2 py-1.5 font-mono text-xs wrap-anywhere text-body"
				>{command}</code
			>
			<div class="flex shrink-0 gap-2">
				<button class="btn-secondary px-2.5 py-1 text-xs" onclick={copyCommand}>
					{copied ? 'Copied' : 'Copy'}
				</button>
				<button class="btn-secondary px-2.5 py-1 text-xs" onclick={rotateBridgeToken}>
					New token
				</button>
			</div>
		</div>
		{#if mcpBridge.error}
			<p class="mt-2 text-xs text-red-500">{mcpBridge.error}</p>
		{/if}
	{/if}
	<p class="mt-2 text-xs text-faint">
		Agents reach this board only while this tab is open. The board stays in this browser; the
		server only passes each request to this tab. Keep the token secret, and make a new one to cut
		off old agents.
	</p>
</div>
