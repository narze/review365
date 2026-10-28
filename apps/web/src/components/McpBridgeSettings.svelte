<script lang="ts">
	import { loadBridgeSettings, mcpBridge, setBridgeEnabled } from '$lib/mcp-bridge.svelte';

	const statusLabel = { off: '', connecting: 'Waiting for MCP server…', connected: 'Connected' };
</script>

<div class="rounded-lg border border-panel p-4">
	<div class="flex items-center gap-3">
		<label class="flex items-center gap-2 text-sm text-body">
			<input
				type="checkbox"
				checked={mcpBridge.enabled}
				onchange={(e) => setBridgeEnabled((e.target as HTMLInputElement).checked)}
			/>
			Connect to local MCP server
		</label>
		{#if mcpBridge.enabled}
			<span
				class="text-xs {mcpBridge.status === 'connected' ? 'text-green-600 dark:text-green-400' : 'text-faint'}"
			>
				{statusLabel[mcpBridge.status]}
			</span>
		{/if}
	</div>
	<p class="mt-2 text-xs text-faint">
		Lets an AI agent read and move cards in this tab through the review365 MCP server on
		localhost:{loadBridgeSettings().port}. The board stays in this browser.
	</p>
</div>
