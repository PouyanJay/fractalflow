/**
 * Curated starting locations across the fractal families. Each preset is a
 * full Scene the Library can load with one click.
 */
import type { SceneState } from '$lib/engine/types';

export interface Preset {
	id: string;
	label: string;
	scene: SceneState;
}

const DEFAULT_SEED = { x: -0.8, y: 0.156 };

export const PRESETS: Preset[] = [
	{
		id: 'seahorse-valley',
		label: 'Seahorse Valley',
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: -0.745, centerY: 0.113, scale: 0.05 },
			maxIter: 600,
			paletteIndex: 1,
			juliaSeed: DEFAULT_SEED
		}
	},
	{
		id: 'elephant-valley',
		label: 'Elephant Valley',
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: 0.275, centerY: 0.006, scale: 0.05 },
			maxIter: 500,
			paletteIndex: 0,
			juliaSeed: DEFAULT_SEED
		}
	},
	{
		id: 'mini-mandelbrot',
		label: 'Mini Mandelbrot',
		scene: {
			formula: 'mandelbrot',
			camera: { centerX: -1.7497, centerY: 0, scale: 0.012 },
			maxIter: 800,
			paletteIndex: 3,
			juliaSeed: DEFAULT_SEED
		}
	},
	{
		id: 'julia-dendrite',
		label: 'Julia Dendrite',
		scene: {
			formula: 'julia',
			camera: { centerX: 0, centerY: 0, scale: 3 },
			maxIter: 400,
			paletteIndex: 2,
			juliaSeed: { x: -0.8, y: 0.156 }
		}
	},
	{
		id: 'julia-spiral',
		label: 'Julia Spiral',
		scene: {
			formula: 'julia',
			camera: { centerX: 0, centerY: 0, scale: 3 },
			maxIter: 400,
			paletteIndex: 1,
			juliaSeed: { x: 0.285, y: 0.01 }
		}
	},
	{
		id: 'burning-ship',
		label: 'Burning Ship',
		scene: {
			formula: 'burning-ship',
			camera: { centerX: -1.755, centerY: -0.03, scale: 0.2 },
			maxIter: 500,
			paletteIndex: 3,
			juliaSeed: DEFAULT_SEED
		}
	}
];
