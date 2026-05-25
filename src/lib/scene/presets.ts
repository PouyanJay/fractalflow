/**
 * Curated starting locations across the fractal families. Each preset carries
 * its art style so loading it switches to the right renderer.
 */
import type { ArtStyleId } from '$lib/stores/ui-logic';
import type { SceneState } from '$lib/engine/types';

export interface Preset {
	id: string;
	label: string;
	styleId: ArtStyleId;
	scene: SceneState;
}

const DEEP_ZOOM: ArtStyleId = 'deep-zoom-2d';
const DEFAULT_SEED = { x: -0.8, y: 0.156 };
const DEFAULT_ATTRACTOR = 'clifford';

export const PRESETS: Preset[] = [
	{
		id: 'seahorse-valley',
		label: 'Seahorse Valley',
		styleId: DEEP_ZOOM,
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: -0.745, centerY: 0.113, scale: 0.05 },
			maxIter: 600,
			paletteIndex: 1,
			juliaSeed: DEFAULT_SEED,
			attractor: DEFAULT_ATTRACTOR
		}
	},
	{
		id: 'elephant-valley',
		label: 'Elephant Valley',
		styleId: DEEP_ZOOM,
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: 0.275, centerY: 0.006, scale: 0.05 },
			maxIter: 500,
			paletteIndex: 0,
			juliaSeed: DEFAULT_SEED,
			attractor: DEFAULT_ATTRACTOR
		}
	},
	{
		id: 'mini-mandelbrot',
		label: 'Mini Mandelbrot',
		styleId: DEEP_ZOOM,
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: -1.7497, centerY: 0, scale: 0.012 },
			maxIter: 800,
			paletteIndex: 3,
			juliaSeed: DEFAULT_SEED,
			attractor: DEFAULT_ATTRACTOR
		}
	},
	{
		id: 'julia-dendrite',
		label: 'Julia Dendrite',
		styleId: DEEP_ZOOM,
		scene: {
			formula: 'julia',
			camera: { centerX: 0, centerY: 0, scale: 3 },
			maxIter: 400,
			paletteIndex: 2,
			juliaSeed: { x: -0.8, y: 0.156 },
			attractor: DEFAULT_ATTRACTOR
		}
	},
	{
		id: 'julia-spiral',
		label: 'Julia Spiral',
		styleId: DEEP_ZOOM,
		scene: {
			formula: 'julia',
			camera: { centerX: 0, centerY: 0, scale: 3 },
			maxIter: 400,
			paletteIndex: 1,
			juliaSeed: { x: 0.285, y: 0.01 },
			attractor: DEFAULT_ATTRACTOR
		}
	},
	{
		id: 'burning-ship',
		label: 'Burning Ship',
		styleId: DEEP_ZOOM,
		scene: {
			formula: 'burning-ship',
			camera: { centerX: -1.755, centerY: -0.03, scale: 0.2 },
			maxIter: 500,
			paletteIndex: 3,
			juliaSeed: DEFAULT_SEED,
			attractor: DEFAULT_ATTRACTOR
		}
	},
	{
		id: 'mandelbulb',
		label: 'Mandelbulb',
		styleId: 'geometric-3d',
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: 0.7, centerY: 0.4, scale: 1 },
			maxIter: 200,
			paletteIndex: 1,
			juliaSeed: DEFAULT_SEED,
			attractor: DEFAULT_ATTRACTOR
		}
	},
	{
		id: 'lorenz-butterfly',
		label: 'Lorenz Butterfly',
		styleId: 'attractors',
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: 0.7, centerY: 0.4, scale: 1 },
			maxIter: 280,
			paletteIndex: 0,
			juliaSeed: DEFAULT_SEED,
			attractor: 'lorenz'
		}
	}
];
