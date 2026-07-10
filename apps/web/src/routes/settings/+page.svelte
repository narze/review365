<script lang="ts">
	import { goto } from '$app/navigation';
	import TokenSetup from '../../components/TokenSetup.svelte';

	function onDone() {
		goto('/');
	}
</script>

<svelte:head>
	<title>Settings · Review365</title>
</svelte:head>

<TokenSetup {onDone} />
