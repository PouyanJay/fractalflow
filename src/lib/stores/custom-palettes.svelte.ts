/**
 * Reactive store of the user's saved custom palettes, backed by localStorage.
 * Wraps the pure operations in scene/custom-palettes.ts. Provided via context by
 * the root layout. Mirrors the bookmarks store.
 */
import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import type { PaletteCoeffs } from '$lib/fractals/palette';
import {
	addCustomPalette,
	removeCustomPalette,
	serializeCustomPalettes,
	parseCustomPalettes,
	type CustomPalette
} from '$lib/scene/custom-palettes';

const KEY = Symbol('ff-custom-palettes-store');
const STORAGE_KEY = 'fractalflow:custom-palettes';

export function createCustomPalettesStore() {
	let list = $state<CustomPalette[]>(
		browser ? parseCustomPalettes(localStorage.getItem(STORAGE_KEY) ?? '') : []
	);

	function persist() {
		if (browser) localStorage.setItem(STORAGE_KEY, serializeCustomPalettes(list));
	}

	return {
		get list() {
			return list;
		},
		add: (label: string, coeffs: PaletteCoeffs) => {
			list = addCustomPalette(list, label, coeffs);
			persist();
		},
		remove: (id: string) => {
			list = removeCustomPalette(list, id);
			persist();
		}
	};
}

export type CustomPalettesStore = ReturnType<typeof createCustomPalettesStore>;

export function provideCustomPalettesStore(): CustomPalettesStore {
	const store = createCustomPalettesStore();
	setContext(KEY, store);
	return store;
}

export function getCustomPalettesStore(): CustomPalettesStore {
	const store = getContext<CustomPalettesStore>(KEY);
	if (!store)
		throw new Error(
			'Custom palettes store not found in context — call provideCustomPalettesStore().'
		);
	return store;
}
