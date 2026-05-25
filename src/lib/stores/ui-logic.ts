/**
 * Pure UI/routing logic for the studio shell.
 *
 * Kept framework-agnostic and side-effect-free so it is trivially unit-testable
 * (see ui-logic.spec.ts). The reactive wrapper lives in ui.svelte.ts.
 */

export type ModeId = 'explore' | 'compose' | 'animate' | 'render';
export type ArtStyleId = 'geometric-3d' | 'flames' | 'attractors' | 'deep-zoom-2d';
export type PanelId = 'library' | 'inspector';
export type Density = 'comfortable' | 'compact';

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

export const MODES: readonly ModeMeta[] = [
	{
		id: 'explore',
		label: 'Explore',
		path: '/explore',
		icon: 'compass',
		blurb: 'Navigate fractal space like a map — pan, zoom, and dive.'
	},
	{
		id: 'compose',
		label: 'Compose',
		path: '/compose',
		icon: 'workflow',
		blurb: 'Build a look by wiring formula, color, and post-effect nodes.'
	},
	{
		id: 'animate',
		label: 'Animate',
		path: '/animate',
		icon: 'clapperboard',
		blurb: 'Keyframe any parameter on a timeline and scrub the result.'
	},
	{
		id: 'render',
		label: 'Render',
		path: '/render',
		icon: 'image-down',
		blurb: 'Export high-resolution stills and video from your scene.'
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

export interface UiState {
	panels: Record<PanelId, boolean>;
	density: Density;
	commandPaletteOpen: boolean;
	selectedStyle: ArtStyleId | null;
}

export function createInitialUiState(): UiState {
	return {
		panels: { library: true, inspector: true },
		density: 'comfortable',
		commandPaletteOpen: false,
		// Deep-Zoom 2D is the implemented renderer, so it's selected by default.
		selectedStyle: 'deep-zoom-2d'
	};
}

export function setPanel(state: UiState, panel: PanelId, visible: boolean): UiState {
	return { ...state, panels: { ...state.panels, [panel]: visible } };
}

export function togglePanel(state: UiState, panel: PanelId): UiState {
	return setPanel(state, panel, !state.panels[panel]);
}

export function setDensity(state: UiState, density: Density): UiState {
	return { ...state, density };
}

export function setCommandPalette(state: UiState, open: boolean): UiState {
	return { ...state, commandPaletteOpen: open };
}

export function toggleCommandPalette(state: UiState): UiState {
	return setCommandPalette(state, !state.commandPaletteOpen);
}

export function selectArtStyle(state: UiState, id: ArtStyleId): UiState {
	return { ...state, selectedStyle: id };
}
