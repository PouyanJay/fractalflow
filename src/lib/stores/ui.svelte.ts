/**
 * Reactive UI store (Svelte 5 runes) wrapping the pure transitions in ui-logic.
 * Provided via context by the root layout; read with getUiStore().
 */
import { getContext, setContext } from 'svelte';
import {
	createInitialUiState,
	setPanel,
	togglePanel,
	setDensity,
	setCommandPalette,
	toggleCommandPalette,
	selectArtStyle,
	type ArtStyleId,
	type Density,
	type PanelId,
	type UiState
} from './ui-logic';

const KEY = Symbol('ff-ui-store');

export function createUiStore() {
	let state = $state<UiState>(createInitialUiState());

	return {
		get panels() {
			return state.panels;
		},
		get density() {
			return state.density;
		},
		get commandPaletteOpen() {
			return state.commandPaletteOpen;
		},
		get selectedStyle() {
			return state.selectedStyle;
		},
		togglePanel: (panel: PanelId) => (state = togglePanel(state, panel)),
		setPanel: (panel: PanelId, visible: boolean) => (state = setPanel(state, panel, visible)),
		setDensity: (density: Density) => (state = setDensity(state, density)),
		cycleDensity: () =>
			(state = setDensity(state, state.density === 'comfortable' ? 'compact' : 'comfortable')),
		openCommandPalette: () => (state = setCommandPalette(state, true)),
		closeCommandPalette: () => (state = setCommandPalette(state, false)),
		toggleCommandPalette: () => (state = toggleCommandPalette(state)),
		selectArtStyle: (id: ArtStyleId) => (state = selectArtStyle(state, id))
	};
}

export type UiStore = ReturnType<typeof createUiStore>;

export function provideUiStore(): UiStore {
	const store = createUiStore();
	setContext(KEY, store);
	return store;
}

export function getUiStore(): UiStore {
	const store = getContext<UiStore>(KEY);
	if (!store)
		throw new Error('UI store not found in context — call provideUiStore() in the layout.');
	return store;
}
