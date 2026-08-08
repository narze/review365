<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { applyTheme, getTheme } from '$lib/theme';
	// PROTOTYPE — throwaway variant switcher for the column header menu.
	import PrototypeSwitcher from '../components/prototype/PrototypeSwitcher.svelte';

	const { children } = $props();

	onMount(() => {
		applyTheme(getTheme());
	});
</script>

<div class="h-svh">
	<main class="h-full overflow-y-auto">
		{@render children()}
	</main>
	<PrototypeSwitcher />
</div>
