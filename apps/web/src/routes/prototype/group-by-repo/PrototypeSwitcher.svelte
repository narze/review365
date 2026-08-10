<!-- PROTOTYPE — shared floating switcher bar. Cycles the `?variant=` param;
     hidden outside dev builds so a stray merge can't ship it. -->
<script lang="ts">
	import { goto } from '$app/navigation';

	let {
		variants,
		current
	}: {
		variants: { key: string; name: string }[];
		current: string;
	} = $props();

	const idx = $derived(Math.max(0, variants.findIndex((v) => v.key === current)));

	function go(delta: number) {
		const next = variants[(idx + delta + variants.length) % variants.length];
		goto(`?variant=${next.key}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function isEditable(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
	}

	function onKeydown(e: KeyboardEvent) {
		if (isEditable(e.target)) return;
		if (e.key === 'ArrowLeft') go(-1);
		else if (e.key === 'ArrowRight') go(1);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if !import.meta.env.PROD}
	<div
		class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-blue-500 bg-neutral-900 px-3 py-2 text-sm text-white shadow-xl dark:bg-neutral-800"
	>
		<button
			type="button"
			class="rounded-full px-2 py-1 hover:bg-white/10"
			onclick={() => go(-1)}
			aria-label="Previous variant"
		>
			←
		</button>
		<span class="font-semibold tracking-wide">
			{variants[idx]?.key} — {variants[idx]?.name}
		</span>
		<button
			type="button"
			class="rounded-full px-2 py-1 hover:bg-white/10"
			onclick={() => go(1)}
			aria-label="Next variant"
		>
			→
		</button>
	</div>
{/if}
