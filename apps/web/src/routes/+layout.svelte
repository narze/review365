<script lang="ts">
	import '../app.css';
	import Header from '../components/Header.svelte';
	import { onMount } from 'svelte';
	import { applyTheme, getTheme } from '$lib/theme';

	const { children } = $props();

	onMount(() => {
		applyTheme(getTheme());
	});
</script>

<div class="grid h-svh grid-rows-[auto_1fr]">
	<Header />
	<main class="overflow-y-auto">
		{@render children()}
	</main>
</div>
