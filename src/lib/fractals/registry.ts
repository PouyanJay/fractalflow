/**
 * Maps an art-style id (Library selection) to its renderer plugin, or null if
 * that style isn't implemented yet (the UI then shows a "coming soon" state).
 */
import type { ArtStyleId } from '$lib/stores/ui-logic';
import type { FractalRenderer } from '$lib/engine/types';
import { mandelbrotRenderer } from './deep-zoom-2d/renderer';

const RENDERERS: Partial<Record<ArtStyleId, FractalRenderer>> = {
	'deep-zoom-2d': mandelbrotRenderer
};

export function getRenderer(styleId: ArtStyleId | null): FractalRenderer | null {
	return (styleId && RENDERERS[styleId]) ?? null;
}
