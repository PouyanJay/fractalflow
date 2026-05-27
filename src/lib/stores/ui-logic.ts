/**
 * Pure UI/routing logic for the studio shell.
 *
 * Kept framework-agnostic and side-effect-free so it is trivially unit-testable
 * (see ui-logic.spec.ts). The reactive wrapper lives in ui.svelte.ts.
 */

// Two acts on one shared Scene: Compose (author it) → Explore (inhabit it).
// Animation lives inside Explore as "Journeys"; output is the top-bar Export
// action — neither is a mode. See .claude/plans/07-product-reframe.md.
export type ModeId = 'compose' | 'explore';
export type ArtStyleId = 'geometric-3d' | 'flames' | 'attractors' | 'deep-zoom-2d';
export type PanelId = 'library' | 'inspector';

export interface ModeMeta {
	id: ModeId;
	label: string;
	/** Route path, always `/{id}`. Pass through SvelteKit's resolve() when linking. */
	path: `/${ModeId}`;
	/** Lucide icon name, resolved to a component in the UI layer. */
	icon: string;
	/** One-line description used by empty states. */
	blurb: string;
}

export interface ArtStyleMeta {
	id: ArtStyleId;
	label: string;
	icon: string;
	blurb: string;
}

// Listed Compose → Explore as the creation arrow; Explore is the default
// landing (see routes/+page.ts) so first impression is a living fractal.
export const MODES: readonly ModeMeta[] = [
	{
		id: 'compose',
		label: 'Compose',
		path: '/compose',
		icon: 'workflow',
		blurb: 'Build a look by wiring formula, color, and post-effect nodes.'
	},
	{
		id: 'explore',
		label: 'Explore',
		path: '/explore',
		icon: 'compass',
		blurb: 'Navigate fractal space like a map — pan, zoom, and dive.'
	}
] as const;

export const ART_STYLES: readonly ArtStyleMeta[] = [
	{
		id: 'geometric-3d',
		label: 'Geometric 3D',
		icon: 'boxes',
		blurb: 'Raymarched Mandelbulb & Mandelbox sculptures with lighting.'
	},
	{
		id: 'flames',
		label: 'Painterly Flames',
		icon: 'flame',
		blurb: 'Colorful organic flame art via particle accumulation.'
	},
	{
		id: 'attractors',
		label: 'Glowing Attractors',
		icon: 'orbit',
		blurb: 'Luminous Lorenz / Clifford particle clouds.'
	},
	{
		id: 'deep-zoom-2d',
		label: 'Deep-Zoom 2D',
		icon: 'spline',
		blurb: 'Mandelbrot & Julia spirals with vivid palettes and infinite zoom.'
	}
] as const;

const ART_STYLE_IDS = new Set<string>(ART_STYLES.map((s) => s.id));

export function isValidArtStyle(id: string): id is ArtStyleId {
	return ART_STYLE_IDS.has(id);
}

const MODE_IDS = new Set<string>(MODES.map((m) => m.id));

export function isValidMode(id: string): id is ModeId {
	return MODE_IDS.has(id);
}

export function pathForMode(id: ModeId): `/${ModeId}` {
	return `/${id}`;
}

/**
 * Derive the active mode from a URL pathname. Tolerates a base-path prefix
 * (e.g. `/fractalflow/compose`) by scanning segments from the end. Falls back
 * to `explore` so the app always has a valid active mode.
 */
export function modeFromPath(pathname: string): ModeId {
	const segments = pathname.split('/').filter(Boolean);
	for (let i = segments.length - 1; i >= 0; i--) {
		const segment = segments[i];
		if (isValidMode(segment)) return segment;
	}
	return 'explore';
}

export const PANEL_MIN_WIDTH = 200;
export const PANEL_MAX_WIDTH = 520;
export const DEFAULT_PANEL_WIDTH = 264;

export interface UiState {
	panels: Record<PanelId, boolean>;
	panelWidths: Record<PanelId, number>;
	commandPaletteOpen: boolean;
	exportOpen: boolean;
	selectedStyle: ArtStyleId | null;
}

export function createInitialUiState(): UiState {
	return {
		panels: { library: true, inspector: true },
		panelWidths: { library: DEFAULT_PANEL_WIDTH, inspector: DEFAULT_PANEL_WIDTH },
		commandPaletteOpen: false,
		exportOpen: false,
		// Deep-Zoom 2D is the implemented renderer, so it's selected by default.
		selectedStyle: 'deep-zoom-2d'
	};
}

/** Set a panel's width, clamped to [PANEL_MIN_WIDTH, PANEL_MAX_WIDTH] and rounded. */
export function setPanelWidth(state: UiState, panel: PanelId, width: number): UiState {
	const clamped = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, Math.round(width)));
	return { ...state, panelWidths: { ...state.panelWidths, [panel]: clamped } };
}

export function setPanel(state: UiState, panel: PanelId, visible: boolean): UiState {
	return { ...state, panels: { ...state.panels, [panel]: visible } };
}

export function togglePanel(state: UiState, panel: PanelId): UiState {
	return setPanel(state, panel, !state.panels[panel]);
}

export function setCommandPalette(state: UiState, open: boolean): UiState {
	return { ...state, commandPaletteOpen: open };
}

export function toggleCommandPalette(state: UiState): UiState {
	return setCommandPalette(state, !state.commandPaletteOpen);
}

export function setExport(state: UiState, open: boolean): UiState {
	return { ...state, exportOpen: open };
}

export function toggleExport(state: UiState): UiState {
	return setExport(state, !state.exportOpen);
}

export function selectArtStyle(state: UiState, id: ArtStyleId): UiState {
	return { ...state, selectedStyle: id };
}
