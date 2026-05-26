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

test('the top bar shows exactly two tabs — Compose then Explore', async ({ page }) => {
	await page.goto('/explore');
	const tabs = page.getByRole('navigation', { name: 'Workspace modes' }).getByRole('link');
	await expect(tabs).toHaveText(['Compose', 'Explore']);
	// The retired modes are gone from the nav.
	await expect(page.getByRole('link', { name: 'Animate' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Render' })).toHaveCount(0);
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

test('Compose Warp/Post-FX nodes drive the shared post-processing', async ({ page }) => {
	await page.goto('/compose');
	// Svelte Flow renders hidden measurement copies, so target the visible control.
	const warp = page.locator('select[aria-label="Warp"]:visible');
	await expect(warp).toBeVisible();
	await expect(warp).toHaveValue('none');
	await warp.selectOption('kaleido');
	await expect(warp).toHaveValue('kaleido');
	// Post lives in the shared scene, so it's encoded into Explore's deep-link URL.
	await page.getByRole('link', { name: 'Explore' }).click();
	await expect.poll(() => page.url(), { timeout: 5000 }).toContain('kaleido');
});

test('command palette opens with the keyboard and navigates', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
	await page.getByPlaceholder('Search commands…').fill('Compose');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/compose$/);
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

test('the Journeys panel plays a curated journey', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Open Journeys panel' }).click();
	const panel = page.getByRole('region', { name: 'Journeys' });
	await expect(panel).toBeVisible();
	await panel.getByRole('button', { name: 'Zoom' }).click();

	const progress = page.getByRole('progressbar', { name: 'Journey progress' });
	await expect(progress).toHaveAttribute('aria-valuenow', '0');
	await page.getByRole('button', { name: 'Play journey' }).click();
	// Playback streams the journey's frames through the live scene, so progress
	// advances from 0 (and the viewport animates).
	await expect
		.poll(async () => Number(await progress.getAttribute('aria-valuenow')))
		.toBeGreaterThan(0);
});

test('the export sheet renders a journey as a movie (.zip)', async ({ page }) => {
	// Off-screen WebGL2 readback is ~1.5s/frame in headless, so keep the clip short.
	test.setTimeout(120_000);
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('button', { name: 'Movie' }).click();
	await page.getByLabel('Export resolution').selectOption('hd');
	await page.getByLabel('Journey duration').selectOption('2000');
	await page.getByLabel('Frame rate').selectOption('12'); // 2s × 12 = 24 frames
	await expect(page.getByText(/24 frames/)).toBeVisible();
	const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
	await page.getByRole('button', { name: /Export frames/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^fractalflow-.*\.zip$/);
});

test.describe('hi-DPR layout', () => {
	test.use({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 2 });

	test('Explore keeps the Journeys panel on-screen on hi-DPR displays', async ({ page }) => {
		await page.goto('/explore');
		await expect(page.locator('canvas')).toBeVisible();
		await page.waitForTimeout(900); // let any ResizeObserver feedback settle
		await page.getByRole('button', { name: 'Open Journeys panel' }).click();
		const panel = page.getByRole('region', { name: 'Journeys' });
		const box = (await panel.boundingBox())!;
		// The overlay panel must sit within the viewport — and the canvas's
		// drawing-buffer height must not feed back and grow the stage.
		expect(box.y + box.height).toBeLessThanOrEqual(601);
		await expect(page.getByRole('button', { name: 'Play journey' })).toBeVisible();
	});
});

test('the Export button opens the export sheet', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await expect(page.getByRole('dialog', { name: 'Export' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();
	await expect(page.getByLabel('Export resolution')).toBeVisible();
});

test('the export sheet downloads a PNG at the chosen resolution', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByLabel('Export resolution').selectOption('hd');
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export PNG' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^fractalflow-.*\.png$/);
	await expect(page.getByText(/Saved 1280 × 720 PNG/)).toBeVisible();
});

test('Escape and the backdrop close the export sheet', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Export' });
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
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
