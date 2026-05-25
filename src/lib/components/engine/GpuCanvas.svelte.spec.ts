import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import GpuCanvas from './GpuCanvas.svelte';

test('mounts a labelled canvas for the fractal viewport', async () => {
	render(GpuCanvas);
	await expect.element(page.getByTestId('fractal-viewport')).toBeInTheDocument();
});
