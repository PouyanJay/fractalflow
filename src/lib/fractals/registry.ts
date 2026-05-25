/**
 * Maps an art-style id (Library selection) to its renderer plugin, or null if
 * that style isn't implemented yet (the UI then shows a "coming soon" state).
 */
import type { ArtStyleId } from '$lib/stores/ui-logic';
import type { Camera2D, FractalRenderer } from '$lib/engine/types';
import { mandelbrotRenderer } from './deep-zoom-2d/renderer';
import { mandelbulbRenderer } from './geometric-3d/renderer';
import { attractorsRenderer } from './glowing-attractors/renderer';

const RENDERERS: Partial<Record<ArtStyleId, FractalRenderer>> = {
	'deep-zoom-2d': mandelbrotRenderer,
	'geometric-3d': mandelbulbRenderer,
	attractors: attractorsRenderer
};

export function getRenderer(styleId: ArtStyleId | null): FractalRenderer | null {
	return (styleId && RENDERERS[styleId]) ?? null;
}

/** A camera that frames a renderer of the given kind (2D pan/zoom or 3D orbit). */
export function defaultCameraFor(kind: '2d' | '3d'): Camera2D {
	return kind === '3d'
		? { centerX: 0.7, centerY: 0.4, scale: 1 }
		: { centerX: -0.5, centerY: 0, scale: 3 };
}
