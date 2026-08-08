<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applyTheme, getTheme } from '$lib/theme';

	const { children } = $props();

	onMount(() => {
		applyTheme(getTheme());
	});
</script>

<div class="h-svh">
	<main class="h-full overflow-y-auto">
		{@render children()}
	</main>
</div>
