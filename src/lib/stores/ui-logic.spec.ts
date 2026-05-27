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
	toggleCommandPalette,
	setCommandPalette,
	setExport,
	toggleExport,
	selectArtStyle,
	setPanelWidth,
	setCompact,
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
	it('defines the five selectable art styles', () => {
		expect(ART_STYLES.map((s) => s.id)).toEqual([
			'geometric-3d',
			'flames',
			'attractors',
			'deep-zoom-2d',
			'ifs'
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
	it('starts with both panels open, palette + export closed, deep-zoom selected', () => {
		const s = createInitialUiState();
		expect(s).toEqual({
			panels: { library: true, inspector: true },
			panelWidths: { library: 264, inspector: 264 },
			commandPaletteOpen: false,
			exportOpen: false,
			selectedStyle: 'deep-zoom-2d',
			compact: false
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

	it('toggleCommandPalette and setCommandPalette control the palette', () => {
		const opened = toggleCommandPalette(createInitialUiState());
		expect(opened.commandPaletteOpen).toBe(true);
		expect(setCommandPalette(opened, false).commandPaletteOpen).toBe(false);
	});

	it('toggleExport and setExport control the export sheet without touching other state', () => {
		const opened = toggleExport(createInitialUiState());
		expect(opened.exportOpen).toBe(true);
		expect(opened.commandPaletteOpen).toBe(false);
		expect(setExport(opened, false).exportOpen).toBe(false);
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

	it('defaults to the docked (non-compact) layout with both panels open', () => {
		const s = createInitialUiState();
		expect(s.compact).toBe(false);
		expect(s.panels).toEqual({ library: true, inspector: true });
	});

	it('setCompact(true) closes both panels so the canvas is full-bleed on mobile', () => {
		const s = setCompact(createInitialUiState(), true);
		expect(s.compact).toBe(true);
		expect(s.panels).toEqual({ library: false, inspector: false });
	});

	it('setCompact(false) restores the docked panels', () => {
		const mobile = setCompact(createInitialUiState(), true);
		const back = setCompact(mobile, false);
		expect(back.compact).toBe(false);
		expect(back.panels).toEqual({ library: true, inspector: true });
	});

	it('setCompact is a no-op (same reference) when the layout is unchanged', () => {
		const s = createInitialUiState();
		expect(setCompact(s, false)).toBe(s);
	});
});
