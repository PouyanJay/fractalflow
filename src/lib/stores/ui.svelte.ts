/**
 * Reactive UI store (Svelte 5 runes) wrapping the pure transitions in ui-logic.
 * Provided via context by the root layout; read with getUiStore().
 */
import { browser } from '$app/environment';
import { getContext, setContext } from 'svelte';
import {
	COMPACT_QUERY,
	createInitialUiState,
	setCompact,
	setPanel,
	togglePanel,
	setCommandPalette,
	toggleCommandPalette,
	setExport,
	toggleExport,
	selectArtStyle,
	setPanelWidth,
	type ArtStyleId,
	type PanelId,
	type UiState
} from './ui-logic';

const KEY = Symbol('ff-ui-store');

const otherPanel = (panel: PanelId): PanelId => (panel === 'library' ? 'inspector' : 'library');

export function createUiStore() {
	let initial = createInitialUiState();
	// Decide the layout from the viewport before first paint (client only), so a
	// phone starts with the panels closed and the canvas full-bleed.
	if (browser && window.matchMedia(COMPACT_QUERY).matches) initial = setCompact(initial, true);
	let state = $state<UiState>(initial);

	// In the compact layout panels are overlay drawers, so only one opens at a
	// time — opening one closes the other.
	function openExclusive(next: UiState, panel: PanelId, opened: boolean): UiState {
		return next.compact && opened ? setPanel(next, otherPanel(panel), false) : next;
	}

	return {
		get panels() {
			return state.panels;
		},
		get panelWidths() {
			return state.panelWidths;
		},
		get commandPaletteOpen() {
			return state.commandPaletteOpen;
		},
		get exportOpen() {
			return state.exportOpen;
		},
		get selectedStyle() {
			return state.selectedStyle;
		},
		get compact() {
			return state.compact;
		},
		togglePanel: (panel: PanelId) => {
			const next = togglePanel(state, panel);
			state = openExclusive(next, panel, next.panels[panel]);
		},
		setPanel: (panel: PanelId, visible: boolean) => {
			state = openExclusive(setPanel(state, panel, visible), panel, visible);
		},
		setPanelWidth: (panel: PanelId, width: number) => (state = setPanelWidth(state, panel, width)),
		setCompact: (compact: boolean) => (state = setCompact(state, compact)),
		openCommandPalette: () => (state = setCommandPalette(state, true)),
		closeCommandPalette: () => (state = setCommandPalette(state, false)),
		toggleCommandPalette: () => (state = toggleCommandPalette(state)),
		openExport: () => (state = setExport(state, true)),
		closeExport: () => (state = setExport(state, false)),
		toggleExport: () => (state = toggleExport(state)),
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
