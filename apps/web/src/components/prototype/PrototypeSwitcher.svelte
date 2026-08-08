<script lang="ts">
	/** PROTOTYPE — floating variant switcher. Never renders in a production build. */
	import { prototypeVariant, VARIANTS } from '$lib/prototype-variant.svelte';

	const enabled = !import.meta.env.PROD;

	function isEditable(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		const tag = el.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
	}

	// The board already owns plain ←/→ for card navigation, so the switcher takes
	// Alt+←/→ instead.
	function onKeydown(e: KeyboardEvent) {
		if (!enabled || !e.altKey || isEditable(e.target)) return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prototypeVariant.cycle(-1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			prototypeVariant.cycle(1);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if enabled}
	<div
		class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 py-1 pl-1 pr-2 text-neutral-100 shadow-2xl"
	>
		<button
			type="button"
			class="grid h-7 w-7 place-items-center rounded-full hover:bg-neutral-700"
			onclick={() => prototypeVariant.cycle(-1)}
			aria-label="Previous variant"
		>
			◀
		</button>
		<span class="min-w-44 text-center text-xs font-medium">
			{prototypeVariant.key} — {prototypeVariant.name}
		</span>
		<button
			type="button"
			class="grid h-7 w-7 place-items-center rounded-full hover:bg-neutral-700"
			onclick={() => prototypeVariant.cycle(1)}
			aria-label="Next variant"
		>
			▶
		</button>
		<span class="ml-1 border-l border-neutral-700 pl-2 text-[10px] text-neutral-400">
			prototype · ⌥←/→
		</span>
		<span class="flex gap-0.5 pl-1">
			{#each VARIANTS as v}
				<button
					type="button"
					class="h-5 w-5 rounded text-[10px] {v.key === prototypeVariant.key
						? 'bg-blue-600 text-white'
						: 'text-neutral-400 hover:bg-neutral-700'}"
					onclick={() => prototypeVariant.set(v.key)}
					aria-label="Variant {v.key}: {v.name}"
					aria-pressed={v.key === prototypeVariant.key}
				>
					{v.key}
				</button>
			{/each}
		</span>
	</div>
{/if}
