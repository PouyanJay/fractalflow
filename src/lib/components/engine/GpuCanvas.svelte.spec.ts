import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import GpuCanvas from './GpuCanvas.svelte';
import { mandelbrotRenderer, createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';

test('mounts a labelled canvas for the fractal viewport', async () => {
	const scene = createDefaultScene();
	render(GpuCanvas, { props: { renderer: mandelbrotRenderer, getScene: () => scene } });
	await expect.element(page.getByTestId('fractal-viewport')).toBeInTheDocument();
});
