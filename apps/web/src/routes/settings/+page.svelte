<script lang="ts">
	import { goto } from '$app/navigation';
	import TokenSetup from '../../components/TokenSetup.svelte';

	function onDone() {
		goto('/');
	}
</script>

<TokenSetup {onDone} />
