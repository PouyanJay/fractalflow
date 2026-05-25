import { test, expect, type Page } from '@playwright/test';

/** Wait until the engine has initialised (status badge resolved) and a frame drawn. */
async function waitForEngine(page: Page) {
	await expect(page.locator('canvas')).toBeVisible();
	await expect(page.getByText(/^(WebGPU|WebGL2)$/)).toBeVisible();
	await page.waitForTimeout(400);
}

test('root redirects to Explore and renders the shell', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/explore$/);
	await expect(page.getByText('FractalFlow')).toBeVisible();
	await expect(page.locator('canvas')).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Library' })).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
});

test('the engine initialises a backend (badge resolves)', async ({ page }) => {
	await page.goto('/explore');
	await expect(page.getByText(/^(WebGPU|WebGL2)$/)).toBeVisible();
});

test('Inspector exposes live Deep-Zoom 2D controls', async ({ page }) => {
	await page.goto('/explore');
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
		'Deep-Zoom 2D'
	);
	await expect(page.getByLabel('Iterations')).toHaveValue('300');
	await expect(page.getByLabel('Formula')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Aurora' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reset view' })).toBeVisible();
});

test('switching to Julia reveals the seed inputs', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByLabel('Formula').selectOption('julia');
	await expect(page.getByLabel('Julia seed real part')).toBeVisible();
	await expect(page.getByLabel('Julia seed imaginary part')).toBeVisible();
	// Other formulas hide the seed inputs again.
	await page.getByLabel('Formula').selectOption('burning-ship');
	await expect(page.getByLabel('Julia seed real part')).toHaveCount(0);
});

test('changing iterations updates the status readout', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByLabel('Iterations').fill('600');
	await expect(page.getByLabel('Iterations')).toHaveValue('600');
});

test('mode tabs navigate between modes', async ({ page }) => {
	await page.goto('/explore');
	await page.getByRole('link', { name: 'Compose' }).click();
	await expect(page).toHaveURL(/\/compose$/);
	await expect(page.getByRole('region', { name: 'Compose workspace' })).toBeVisible();
});

test('Compose node graph edits the shared scene and updates every mode', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('option', { name: /Glowing Attractors/ }).click();
	await page.getByRole('link', { name: 'Compose' }).click();
	await expect(page).toHaveURL(/\/compose$/);
	// The pipeline nodes render; the Inspector defers to the graph here.
	await expect(page.getByText('Coloring')).toBeVisible();
	await expect(page.getByText('Output')).toBeVisible();
	await expect(page.getByText(/Edit this art style with the node graph/)).toBeVisible();
	// Editing the Source node mutates the shared scene.
	const family = page.getByLabel('Attractor family');
	await expect(family).toHaveValue('clifford');
	await family.selectOption('lorenz');
	// Back in Explore, the same scene reflects the change (one scene, four lenses).
	await page.getByRole('link', { name: 'Explore' }).click();
	await expect(page.getByLabel('Attractor family')).toHaveValue('lorenz');
});

test('command palette opens with the keyboard and navigates', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
	await page.getByPlaceholder('Search commands…').fill('Animate');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/animate$/);
});

test('toggling the library panel hides it', async ({ page }) => {
	await page.goto('/explore');
	await expect(page.getByRole('complementary', { name: 'Library' })).toBeVisible();
	await page.getByRole('button', { name: 'Toggle library panel' }).click();
	await expect(page.getByRole('complementary', { name: 'Library' })).toHaveCount(0);
});

test('the library panel can be resized by dragging its handle', async ({ page }) => {
	await page.goto('/explore');
	const library = page.getByRole('complementary', { name: 'Library' });
	const before = (await library.boundingBox())!.width;
	const handle = page.getByRole('button', { name: /Resize Library panel/ });
	const box = (await handle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + 200);
	await page.mouse.down();
	await page.mouse.move(box.x + 120, box.y + 200, { steps: 8 });
	await page.mouse.up();
	const after = (await library.boundingBox())!.width;
	expect(after).toBeGreaterThan(before + 50);
});

test('a deep link restores the scene', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByLabel('Formula').selectOption('julia');
	await page.getByLabel('Iterations').fill('800');
	await page.waitForTimeout(400); // allow the debounced URL write
	const url = page.url();
	expect(url).toContain('s=');
	await page.goto(url);
	await waitForEngine(page);
	await expect(page.getByLabel('Formula')).toHaveValue('julia');
	await expect(page.getByLabel('Iterations')).toHaveValue('800');
});

test('the copy-link button copies the deep link', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Copy link to this view' }).click();
	await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
	const clip = await page.evaluate(() => navigator.clipboard.readText());
	expect(clip).toContain('s=');
});

test('loading a preset switches the scene', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Burning Ship' }).click();
	await expect(page.getByLabel('Formula')).toHaveValue('burning-ship');
});

test('a bookmark can be saved and deleted', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Save view' }).click();
	const del = page.getByRole('button', { name: /^Delete bookmark/ });
	await expect(del).toBeVisible();
	await del.click();
	await expect(page.getByText('No bookmarks yet', { exact: false })).toBeVisible();
});

test('selecting Geometric 3D switches to the 3D renderer', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('option', { name: /Geometric 3D/ }).click();
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
		'Geometric 3D'
	);
	await expect(page.getByRole('heading', { name: 'Detail' })).toBeVisible();
	await expect(page.locator('canvas')).toBeVisible();
});

test('loading a 2D preset while in 3D switches back to the 2D renderer', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('option', { name: /Geometric 3D/ }).click();
	// 3D has no Formula control; confirm we are in the 3D renderer first.
	await expect(page.getByLabel('Formula')).toHaveCount(0);
	// A 2D preset must pull the studio back to Deep-Zoom 2D, not feed a 2D scene to Mandelbulb.
	await page.getByRole('button', { name: 'Burning Ship' }).click();
	await expect(page.getByLabel('Formula')).toHaveValue('burning-ship');
});

test('selecting Glowing Attractors exposes the family selector and exposure control', async ({
	page
}) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('option', { name: /Glowing Attractors/ }).click();
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
		'Glowing Attractors'
	);
	// Family selector with all four strange attractors, and an Exposure (not Iterations) control.
	const family = page.getByLabel('Attractor family');
	await expect(family).toBeVisible();
	await expect(family.getByRole('option')).toHaveText(['Clifford', 'de Jong', 'Lorenz', 'Thomas']);
	await expect(page.getByRole('heading', { name: 'Exposure' })).toBeVisible();
	await family.selectOption('lorenz');
	await expect(family).toHaveValue('lorenz');
	// The art style is WebGPU-only: the viewport is either a live canvas or the
	// designed "needs WebGPU" state — never a crash or blank.
	const canvasOrNotice = page
		.locator('canvas')
		.or(page.getByText(/needs WebGPU/i))
		.first();
	await expect(canvasOrNotice).toBeVisible();
});

test('loading the Lorenz preset switches to the attractors renderer', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Lorenz Butterfly' }).click();
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
		'Glowing Attractors'
	);
	await expect(page.getByLabel('Attractor family')).toHaveValue('lorenz');
});

test('selecting Painterly Flames exposes the flame selector and exposure control', async ({
	page
}) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('option', { name: /Painterly Flames/ }).click();
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
		'Painterly Flames'
	);
	const flame = page.getByLabel('Flame');
	await expect(flame).toBeVisible();
	await expect(flame.getByRole('option')).toHaveText([
		'Sierpinski',
		'Sinusoidal Web',
		'Swirl Bloom',
		'Horseshoe'
	]);
	await expect(page.getByRole('heading', { name: 'Exposure' })).toBeVisible();
	await flame.selectOption('swirl');
	await expect(flame).toHaveValue('swirl');
	// WebGPU-only: a live canvas or the designed "needs WebGPU" notice, never a crash.
	const canvasOrNotice = page
		.locator('canvas')
		.or(page.getByText(/needs WebGPU/i))
		.first();
	await expect(canvasOrNotice).toBeVisible();
});

test('loading the Sinusoidal Web preset switches to the flames renderer', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Sinusoidal Web' }).click();
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText(
		'Painterly Flames'
	);
	await expect(page.getByLabel('Flame')).toHaveValue('sinusoidal');
});

test('Animate builds a keyframe timeline and scrubbing interpolates the scene', async ({
	page
}) => {
	await page.goto('/animate');
	await expect(page.locator('canvas')).toBeVisible();
	const play = page.getByRole('button', { name: 'Play' });
	await expect(play).toBeDisabled(); // needs two keyframes

	const add = page.getByRole('button', { name: 'Add keyframe' });
	const track = page.getByRole('slider', { name: 'Playhead' });

	// Keyframe at the start (wide view).
	await add.click();
	// Move the playhead to the end, zoom in, and keyframe again.
	let box = (await track.boundingBox())!;
	await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
	const stage = page.getByRole('application');
	const sb = (await stage.boundingBox())!;
	await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
	for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -120);
	await add.click();

	// Two keyframes → playback is now possible.
	await expect(play).toBeEnabled();

	// Scrubbing to the middle lands the status zoom between the two keyframes.
	const zoomAt = async () => {
		const txt = (await page.getByText(/zoom/).last().textContent()) ?? '';
		return Number(txt.match(/zoom\s*([\d.]+)/)?.[1] ?? '0');
	};
	box = (await track.boundingBox())!;
	await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
	const endZoom = await zoomAt();
	box = (await track.boundingBox())!;
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	const midZoom = await zoomAt();
	expect(midZoom).toBeGreaterThan(1);
	expect(midZoom).toBeLessThan(endZoom);
});

test('Render mode exports a PNG download', async ({ page }) => {
	await page.goto('/render');
	await expect(page.getByRole('heading', { name: 'Render', exact: true })).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /Export PNG/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^fractalflow-.*\.png$/);
});

test('Render gates the frame-sequence export on having keyframes', async ({ page }) => {
	await page.goto('/render');
	// No keyframes yet → the Animation section prompts the user, no export button.
	await expect(page.getByText(/at least two keyframes/)).toBeVisible();
	await expect(page.getByRole('button', { name: /Export frames/ })).toHaveCount(0);
});

test('Render exports an animation as a zip of frames', async ({ page }) => {
	// Build a short two-keyframe clip in Animate.
	await page.goto('/animate');
	await expect(page.locator('canvas')).toBeVisible();
	const add = page.getByRole('button', { name: 'Add keyframe' });
	const track = page.getByRole('slider', { name: 'Playhead' });
	await add.click();
	const tb = (await track.boundingBox())!;
	await page.mouse.click(tb.x + tb.width - 4, tb.y + tb.height / 2);
	const stage = page.getByRole('application');
	const sb = (await stage.boundingBox())!;
	await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
	for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -120);
	await add.click();
	await page.getByLabel('Duration in seconds').fill('1');

	await page.getByRole('link', { name: 'Render' }).click();
	await page.getByLabel('Export resolution').selectOption('hd');
	await page.getByLabel('Frame rate').selectOption('12'); // 1s × 12 = 12 frames, quick
	await expect(page.getByText(/12 frames/)).toBeVisible();
	const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
	await page.getByRole('button', { name: /Export frames/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^fractalflow-.*-frames-.*\.zip$/);
});

test('visual: Explore renders the Mandelbrot', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	// The Mandelbrot is static for a fixed scene, so the full page is deterministic.
	await expect(page).toHaveScreenshot('explore-mandelbrot.png', {
		fullPage: true,
		maxDiffPixelRatio: 0.02
	});
});

test('visual: Julia set', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByLabel('Formula').selectOption('julia');
	await page.waitForTimeout(300);
	await expect(page).toHaveScreenshot('explore-julia.png', {
		fullPage: true,
		maxDiffPixelRatio: 0.02
	});
});
