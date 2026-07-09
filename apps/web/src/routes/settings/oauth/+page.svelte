<script lang="ts">
	import { goto } from '$app/navigation';
	import OAuthCallback from '../../../components/OAuthCallback.svelte';

	function onDone() {
		goto('/');
	}
</script>

<OAuthCallback {onDone} />
