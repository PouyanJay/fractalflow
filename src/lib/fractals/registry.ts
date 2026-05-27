/**
 * Maps an art-style id (Library selection) to its renderer plugin, or null if
 * that style isn't implemented yet (the UI then shows a "coming soon" state).
 */
import type { ArtStyleId } from '$lib/stores/ui-logic';
import type { Camera2D, FractalRenderer } from '$lib/engine/types';
import { mandelbrotRenderer } from './deep-zoom-2d/renderer';
import { mandelbulbRenderer } from './geometric-3d/renderer';
import { attractorsRenderer } from './glowing-attractors/renderer';
import { flamesRenderer } from './painterly-flames/renderer';
import { ifsRenderer } from './ifs/renderer';

const RENDERERS: Partial<Record<ArtStyleId, FractalRenderer>> = {
	'deep-zoom-2d': mandelbrotRenderer,
	'geometric-3d': mandelbulbRenderer,
	attractors: attractorsRenderer,
	flames: flamesRenderer,
	ifs: ifsRenderer
};

export function getRenderer(styleId: ArtStyleId | null): FractalRenderer | null {
	return (styleId && RENDERERS[styleId]) ?? null;
}

/** A camera that frames the given art style's renderer. 3D styles orbit; 2D
 * styles differ (the Mandelbrot sits left of origin, a flame is centred). */
export function defaultCameraFor(styleId: ArtStyleId | null): Camera2D {
	switch (styleId) {
		case 'flames':
		case 'ifs':
			return { centerX: 0, centerY: 0, scale: 2.5 };
		case 'geometric-3d':
		case 'attractors':
			return { centerX: 0.7, centerY: 0.4, scale: 1 };
		default:
			return { centerX: -0.5, centerY: 0, scale: 3 };
	}
}
