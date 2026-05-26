import { describe, it, expect } from 'vitest';
import {
	MODES,
	ART_STYLES,
	isValidMode,
	pathForMode,
	modeFromPath,
	createInitialUiState,
	togglePanel,
	setPanel,
	setDensity,
	toggleCommandPalette,
	setCommandPalette,
	selectArtStyle,
	setPanelWidth,
	PANEL_MIN_WIDTH,
	PANEL_MAX_WIDTH
} from './ui-logic';

describe('mode metadata', () => {
	it('defines exactly the two workflow modes — Compose then Explore', () => {
		expect(MODES.map((m) => m.id)).toEqual(['compose', 'explore']);
	});

	it('gives every mode a label, path, icon and blurb', () => {
		for (const m of MODES) {
			expect(m.label.length).toBeGreaterThan(0);
			expect(m.path).toBe(`/${m.id}`);
			expect(m.icon.length).toBeGreaterThan(0);
			expect(m.blurb.length).toBeGreaterThan(0);
		}
	});
});

describe('art styles', () => {
	it('defines the four selectable art styles', () => {
		expect(ART_STYLES.map((s) => s.id)).toEqual([
			'geometric-3d',
			'flames',
			'attractors',
			'deep-zoom-2d'
		]);
	});
});

describe('isValidMode', () => {
	it('accepts the two workflow modes and rejects the retired/unknown ones', () => {
		expect(isValidMode('explore')).toBe(true);
		expect(isValidMode('compose')).toBe(true);
		// Animate and Render are no longer modes (re-framed into Explore + Export).
		expect(isValidMode('animate')).toBe(false);
		expect(isValidMode('render')).toBe(false);
		expect(isValidMode('nope')).toBe(false);
		expect(isValidMode('')).toBe(false);
	});
});

describe('pathForMode / modeFromPath', () => {
	it('round-trips every mode through its path', () => {
		for (const m of MODES) {
			expect(modeFromPath(pathForMode(m.id))).toBe(m.id);
		}
	});

	it('resolves the mode even behind a base path prefix', () => {
		expect(modeFromPath('/fractalflow/compose')).toBe('compose');
	});

	it('defaults to explore for unknown or root paths', () => {
		expect(modeFromPath('/')).toBe('explore');
		expect(modeFromPath('/fractalflow')).toBe('explore');
		expect(modeFromPath('/something/else')).toBe('explore');
	});
});

describe('ui state transitions (pure & immutable)', () => {
	it('starts with both panels open, comfortable density, palette closed, deep-zoom selected', () => {
		const s = createInitialUiState();
		expect(s).toEqual({
			panels: { library: true, inspector: true },
			panelWidths: { library: 264, inspector: 264 },
			density: 'comfortable',
			commandPaletteOpen: false,
			selectedStyle: 'deep-zoom-2d'
		});
	});

	it('togglePanel flips one panel without mutating the input', () => {
		const s = createInitialUiState();
		const next = togglePanel(s, 'library');
		expect(next.panels.library).toBe(false);
		expect(next.panels.inspector).toBe(true);
		expect(s.panels.library).toBe(true); // original untouched
	});

	it('setPanel sets an explicit visibility', () => {
		const s = setPanel(createInitialUiState(), 'inspector', false);
		expect(s.panels.inspector).toBe(false);
	});

	it('setDensity changes density', () => {
		expect(setDensity(createInitialUiState(), 'compact').density).toBe('compact');
	});

	it('toggleCommandPalette and setCommandPalette control the palette', () => {
		const opened = toggleCommandPalette(createInitialUiState());
		expect(opened.commandPaletteOpen).toBe(true);
		expect(setCommandPalette(opened, false).commandPaletteOpen).toBe(false);
	});

	it('selectArtStyle records the chosen style', () => {
		expect(selectArtStyle(createInitialUiState(), 'flames').selectedStyle).toBe('flames');
	});

	it('setPanelWidth sets one panel, rounds, and leaves the other untouched', () => {
		const next = setPanelWidth(createInitialUiState(), 'library', 311.6);
		expect(next.panelWidths.library).toBe(312);
		expect(next.panelWidths.inspector).toBe(264);
	});

	it('setPanelWidth clamps to the allowed range', () => {
		expect(setPanelWidth(createInitialUiState(), 'library', 50).panelWidths.library).toBe(
			PANEL_MIN_WIDTH
		);
		expect(setPanelWidth(createInitialUiState(), 'inspector', 9999).panelWidths.inspector).toBe(
			PANEL_MAX_WIDTH
		);
	});
});
