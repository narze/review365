/**
 * PROTOTYPE — THROWAWAY. Delete along with `src/components/prototype/`.
 *
 * Question: how should the column header menu items look and behave?
 * Four variants of the column header, switchable via `?variant=` on the
 * existing board route (`/`), driven by the floating bar at the bottom.
 */

export type SortMode = 'default' | 'pr-asc' | 'pr-desc' | 'age-asc' | 'age-desc';

export const SORT_OPTIONS = [
	{ value: 'default', label: 'Drag order', short: 'Manual', hint: 'as arranged', icon: '↕' },
	{ value: 'pr-asc', label: 'PR number ↑', short: 'PR ↑', hint: 'low → high', icon: '#' },
	{ value: 'pr-desc', label: 'PR number ↓', short: 'PR ↓', hint: 'high → low', icon: '#' },
	{ value: 'age-asc', label: 'Oldest first', short: 'Oldest', hint: 'stale at top', icon: '🕐' },
	{ value: 'age-desc', label: 'Newest first', short: 'Newest', hint: 'fresh at top', icon: '🕐' }
] as const satisfies ReadonlyArray<{
	value: SortMode;
	label: string;
	short: string;
	hint: string;
	icon: string;
}>;

export function sortOption(mode: SortMode) {
	return SORT_OPTIONS.find((o) => o.value === mode) ?? SORT_OPTIONS[0];
}

export const VARIANTS = [
	{ key: '0', name: 'Current (baseline)' },
	{ key: 'A', name: 'One menu' },
	{ key: 'B', name: 'Hover toolbar + chips' },
	{ key: 'C', name: 'Header panel' }
] as const;

export type VariantKey = (typeof VARIANTS)[number]['key'];

function fromUrl(): VariantKey {
	if (typeof window === 'undefined') return '0';
	const raw = (new URLSearchParams(window.location.search).get('variant') ?? '0').toUpperCase();
	return (VARIANTS.find((v) => v.key === raw)?.key ?? '0') as VariantKey;
}

class PrototypeVariant {
	key = $state<VariantKey>(fromUrl());

	get name() {
		return VARIANTS.find((v) => v.key === this.key)?.name ?? '';
	}

	set(key: VariantKey) {
		this.key = key;
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (key === '0') url.searchParams.delete('variant');
		else url.searchParams.set('variant', key);
		window.history.replaceState(window.history.state, '', url);
	}

	cycle(step: 1 | -1) {
		const i = VARIANTS.findIndex((v) => v.key === this.key);
		this.set(VARIANTS[(i + step + VARIANTS.length) % VARIANTS.length].key);
	}
}

export const prototypeVariant = new PrototypeVariant();
