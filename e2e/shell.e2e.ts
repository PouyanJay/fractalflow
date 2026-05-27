import { test, expect, type Page } from '@playwright/test';

/** Wait until the engine has initialised (status badge resolved) and a frame drawn. */
async function waitForEngine(page: Page) {
	await expect(page.locator('canvas')).toBeVisible();
	await expect(page.getByText(/^(WebGPU|WebGL2)$/)).toBeVisible();
	await page.waitForTimeout(400);
}

/** Pick an art style from Compose's Start palette (the picker lives there now). */
async function pickStyle(page: Page, name: RegExp) {
	await page.goto('/compose');
	await page.getByRole('option', { name }).click();
}

/** Pick an option from a custom Select (trigger button + popover listbox). */
async function choose(page: Page, ariaLabel: string, optionName: string) {
	await page.locator(`button[aria-label="${ariaLabel}"]:visible`).first().click();
	await page
		.getByRole('listbox', { name: ariaLabel })
		.getByRole('option', { name: optionName, exact: true })
		.click();
}

/** Load a preset from Compose's Start palette — it applies the scene and lands on Explore. */
async function loadPreset(page: Page, name: string) {
	await page.goto('/compose');
	await choose(page, 'Preset', name);
	await expect(page).toHaveURL(/\/explore$/);
}

test('root redirects to Explore and renders the shell', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/explore$/);
	await expect(page.getByText('FractalFlow')).toBeVisible();
	await expect(page.locator('canvas')).toBeVisible();
	// Explore is immersive: Codex on the right, no left chrome (Start is Compose-only).
	await expect(page.getByRole('complementary', { name: 'Codex' })).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Start' })).toHaveCount(0);
});

test('the engine initialises a backend (badge resolves)', async ({ page }) => {
	await page.goto('/explore');
	await expect(page.getByText(/^(WebGPU|WebGL2)$/)).toBeVisible();
});

test('the Codex describes the current fractal and its position', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	const codex = page.getByRole('complementary', { name: 'Codex' });
	await expect(codex).toContainText('Mandelbrot');
	await expect(codex.getByText('Zoom')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reset view' })).toBeVisible();
});

test('Compose reveals the Julia seed inputs for the Julia formula', async ({ page }) => {
	await page.goto('/compose');
	await choose(page, 'Formula', 'Julia');
	await expect(page.locator('input[aria-label="Julia seed real part"]:visible')).toBeVisible();
	await expect(page.locator('input[aria-label="Julia seed imaginary part"]:visible')).toBeVisible();
	// Other formulas hide the seed inputs again.
	await choose(page, 'Formula', 'Burning Ship');
	await expect(page.getByLabel('Julia seed real part')).toHaveCount(0);
});

test('Compose edits the iteration count', async ({ page }) => {
	await page.goto('/compose');
	const iters = page.locator('input[aria-label="Iterations"]:visible');
	await iters.fill('600');
	await expect(iters).toHaveValue('600');
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
	await page.goto('/compose');
	// Pick the art style in the Start palette, then edit its Source node.
	await page.getByRole('option', { name: /Glowing Attractors/ }).click();
	await expect(page.getByText('Coloring')).toBeVisible();
	await expect(page.getByText('Output')).toBeVisible();
	// On Compose the right panel defers — editing is the node graph.
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('node graph');
	// Editing the Source node mutates the shared scene.
	const family = page.locator('button[aria-label="Attractor family"]:visible').first();
	await expect(family).toContainText('Clifford');
	await choose(page, 'Attractor family', 'Lorenz');
	// One shared scene: Explore's Codex reflects the attractor, and the edit persists.
	await page.getByRole('link', { name: 'Explore' }).click();
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Attractor');
	await page.getByRole('link', { name: 'Compose' }).click();
	await expect(page.locator('button[aria-label="Attractor family"]:visible').first()).toContainText(
		'Lorenz'
	);
});

test('Compose Warp/Post-FX nodes drive the shared post-processing', async ({ page }) => {
	await page.goto('/compose');
	// Svelte Flow renders hidden measurement copies, so target the visible control.
	const warp = page.locator('button[aria-label="Warp"]:visible').first();
	await expect(warp).toBeVisible();
	await expect(warp).toContainText('None');
	await choose(page, 'Warp', 'Kaleidoscope');
	await expect(warp).toContainText('Kaleidoscope');
	// Post lives in the shared scene, so it's encoded into Explore's deep-link URL.
	await page.getByRole('link', { name: 'Explore' }).click();
	await expect.poll(() => page.url(), { timeout: 5000 }).toContain('kaleido');
});

test('Compose Post-FX bloom intensity drives the shared scene', async ({ page }) => {
	await page.goto('/compose');
	const intensity = page.locator('input[aria-label="Intensity"]:visible');
	await expect(intensity).toBeVisible();
	await expect(intensity).toHaveValue('0'); // bloom off by default
	// Set the slider via its bound value; bloom lives in the shared scene.
	await intensity.fill('1.4');
	await intensity.dispatchEvent('input');
	await expect(intensity).toHaveValue('1.4');
	await page.getByRole('link', { name: 'Explore' }).click();
	// The scene token (?s=) carries the bloom amount. It's the last non-default
	// field here, so the compact codec trims everything after it — match `~1.4`.
	await expect.poll(() => decodeURIComponent(page.url()), { timeout: 5000 }).toContain('~1.4');
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

test('toggling the Start panel hides it (Compose)', async ({ page }) => {
	await page.goto('/compose');
	await expect(page.getByRole('complementary', { name: 'Start' })).toBeVisible();
	await page.getByRole('button', { name: 'Toggle Start panel' }).click();
	await expect(page.getByRole('complementary', { name: 'Start' })).toHaveCount(0);
});

test('the Start panel can be resized by dragging its handle (Compose)', async ({ page }) => {
	await page.goto('/compose');
	const start = page.getByRole('complementary', { name: 'Start' });
	const before = (await start.boundingBox())!.width;
	const handle = page.getByRole('button', { name: /Resize Start panel/ });
	const box = (await handle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + 200);
	await page.mouse.down();
	await page.mouse.move(box.x + 120, box.y + 200, { steps: 8 });
	await page.mouse.up();
	const after = (await start.boundingBox())!.width;
	expect(after).toBeGreaterThan(before + 50);
});

test('a deep link restores the scene', async ({ page }) => {
	// Loading a preset changes the shared scene, which Explore writes to the URL.
	await loadPreset(page, 'Julia Dendrite');
	await waitForEngine(page);
	await page.waitForTimeout(400); // allow the debounced URL write
	const url = page.url();
	expect(url).toContain('s=');
	await page.goto(url);
	await waitForEngine(page);
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Julia set');
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
	await loadPreset(page, 'Burning Ship');
	await waitForEngine(page);
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Burning Ship');
});

test('the Codex names the landmark when the view sits in a famous region', async ({ page }) => {
	await loadPreset(page, 'Seahorse Valley');
	await waitForEngine(page);
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Seahorse Valley');
});

test('a bookmark can be saved and deleted in the Codex', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	const del = page.getByRole('button', { name: /^Delete bookmark/ });
	await expect(del).toBeVisible();
	await del.click();
	await expect(page.getByText('Save a view to pin it here', { exact: false })).toBeVisible();
});

test('selecting Geometric 3D switches to the 3D renderer', async ({ page }) => {
	await pickStyle(page, /Geometric 3D/);
	await page.getByRole('link', { name: 'Explore' }).click();
	await waitForEngine(page);
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Mandelbulb');
	await expect(page.locator('canvas')).toBeVisible();
});

test('loading a 2D preset while in 3D switches back to the 2D renderer', async ({ page }) => {
	await pickStyle(page, /Geometric 3D/);
	// A 2D preset must pull the studio back to Deep-Zoom 2D, not feed a 2D scene to Mandelbulb.
	await choose(page, 'Preset', 'Burning Ship');
	await waitForEngine(page);
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Burning Ship');
});

test('selecting Glowing Attractors shows its Codex and renders (or asks for WebGPU)', async ({
	page
}) => {
	await pickStyle(page, /Glowing Attractors/);
	await page.getByRole('link', { name: 'Explore' }).click();
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Attractor');
	// WebGPU-only: a live canvas or the designed "needs WebGPU" notice, never a crash.
	const canvasOrNotice = page
		.locator('canvas')
		.or(page.getByText(/needs WebGPU/i))
		.first();
	await expect(canvasOrNotice).toBeVisible();
});

test('Compose exposes the attractor family selector', async ({ page }) => {
	await pickStyle(page, /Glowing Attractors/);
	await page.locator('button[aria-label="Attractor family"]:visible').first().click();
	const list = page.getByRole('listbox', { name: 'Attractor family' });
	await expect(list.getByRole('option')).toHaveText([
		'Clifford',
		'de Jong',
		'Lorenz',
		'Thomas',
		'Aizawa',
		'Rössler',
		'Halvorsen',
		'Chen',
		'Dadras'
	]);
	await list.getByRole('option', { name: 'Lorenz', exact: true }).click();
	await expect(page.locator('button[aria-label="Attractor family"]:visible').first()).toContainText(
		'Lorenz'
	);
});

test('loading the Lorenz preset switches to the attractors renderer', async ({ page }) => {
	await loadPreset(page, 'Lorenz Butterfly');
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Attractor');
});

test('selecting Painterly Flames shows its Codex and renders (or asks for WebGPU)', async ({
	page
}) => {
	await pickStyle(page, /Painterly Flames/);
	await page.getByRole('link', { name: 'Explore' }).click();
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Flame');
	const canvasOrNotice = page
		.locator('canvas')
		.or(page.getByText(/needs WebGPU/i))
		.first();
	await expect(canvasOrNotice).toBeVisible();
});

test('Compose exposes the flame selector', async ({ page }) => {
	await pickStyle(page, /Painterly Flames/);
	await page.locator('button[aria-label="Flame"]:visible').first().click();
	const list = page.getByRole('listbox', { name: 'Flame' });
	await expect(list.getByRole('option')).toHaveText([
		'Sierpinski',
		'Sinusoidal Web',
		'Swirl Bloom',
		'Horseshoe',
		'Polar Bloom',
		'Disc',
		'Heartfield',
		'Bubbles',
		'Popcorn'
	]);
	await list.getByRole('option', { name: 'Swirl Bloom', exact: true }).click();
	await expect(page.locator('button[aria-label="Flame"]:visible').first()).toContainText(
		'Swirl Bloom'
	);
});

test('loading the Sinusoidal Web preset switches to the flames renderer', async ({ page }) => {
	await loadPreset(page, 'Sinusoidal Web');
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Flame');
});

test('selecting Iterated Systems shows its Codex and renders (or asks for WebGPU)', async ({
	page
}) => {
	await pickStyle(page, /Iterated Systems/);
	await page.getByRole('link', { name: 'Explore' }).click();
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText(
		'Iterated Function System'
	);
	// WebGPU-only compute renderer: a live canvas or the designed notice, never a crash.
	const canvasOrNotice = page
		.locator('canvas')
		.or(page.getByText(/needs WebGPU/i))
		.first();
	await expect(canvasOrNotice).toBeVisible();
});

test('Compose exposes the IFS system selector', async ({ page }) => {
	await pickStyle(page, /Iterated Systems/);
	await page.locator('button[aria-label="IFS system"]:visible').first().click();
	const list = page.getByRole('listbox', { name: 'IFS system' });
	await expect(list.getByRole('option')).toHaveText([
		'Barnsley Fern',
		'Sierpiński Triangle',
		'Dragon Curve',
		'Koch Curve',
		'Lévy C Curve',
		'Sierpiński Carpet'
	]);
	await list.getByRole('option', { name: 'Dragon Curve', exact: true }).click();
	await expect(page.locator('button[aria-label="IFS system"]:visible').first()).toContainText(
		'Dragon Curve'
	);
});

test('loading the Barnsley Fern preset switches to the IFS renderer', async ({ page }) => {
	await loadPreset(page, 'Barnsley Fern');
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText(
		'Iterated Function System'
	);
});

test('selecting Lyapunov reframes into (a,b) space and describes it', async ({ page }) => {
	await page.goto('/compose');
	await choose(page, 'Formula', 'Lyapunov');
	await page.getByRole('link', { name: 'Explore' }).click();
	await waitForEngine(page);
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Lyapunov');
	// The camera reframes into logistic-rate space (a ≈ 3.2), not the Mandelbrot
	// origin — the scene token carries the formula and its (a,b) home centre.
	await expect
		.poll(() => decodeURIComponent(page.url()), { timeout: 5000 })
		.toContain('lyapunov~3.2');
});

test('selecting Apollonian describes the gasket', async ({ page }) => {
	await page.goto('/compose');
	await choose(page, 'Formula', 'Apollonian');
	await page.getByRole('link', { name: 'Explore' }).click();
	await waitForEngine(page);
	await expect(page.getByRole('complementary', { name: 'Codex' })).toContainText('Apollonian');
});

test('the Journey tab plays a curated journey', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('tab', { name: 'Journey' }).click();
	await page.getByRole('button', { name: 'Zoom', exact: true }).click();

	const progress = page.getByRole('progressbar', { name: 'Journey progress' });
	await expect(progress).toHaveAttribute('aria-valuenow', '0');
	await page.getByRole('button', { name: 'Play journey' }).click();
	// Playback streams the journey's frames through the live scene, so progress
	// advances from 0 (and the viewport animates).
	await expect
		.poll(async () => Number(await progress.getAttribute('aria-valuenow')))
		.toBeGreaterThan(0);
});

test('the Journey tab captures Zoom waypoints', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('tab', { name: 'Journey' }).click();
	await page.getByRole('button', { name: 'Zoom', exact: true }).click();
	const add = page.getByRole('button', { name: 'Add this view' });
	await add.click();
	await add.click();
	// Two captured stops appear, each removable.
	await expect(page.getByRole('button', { name: /Remove waypoint/ })).toHaveCount(2);
});

test('the export sheet renders a journey as a frame-sequence (.zip)', async ({ page }) => {
	// Off-screen WebGL2 readback is ~1.5s/frame in headless, so keep the clip short.
	test.setTimeout(120_000);
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('button', { name: 'Movie' }).click();
	await page.getByLabel('Export resolution').selectOption('hd');
	await page.getByLabel('Journey duration').selectOption('2000');
	await page.getByLabel('Frame rate').selectOption('12'); // 2s × 12 = 24 frames
	await page.getByLabel('Movie format').selectOption('zip');
	await expect(page.getByText(/24 frames/)).toBeVisible();
	const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
	await page.getByRole('button', { name: /Export frames/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^fractalflow-.*\.zip$/);
});

test('the export sheet renders an MP4 (or falls back to a .zip)', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/explore');
	await waitForEngine(page);
	await page.getByRole('button', { name: 'Export', exact: true }).click();
	await page.getByRole('button', { name: 'Movie' }).click();
	await page.getByLabel('Export resolution').selectOption('hd');
	await page.getByLabel('Journey duration').selectOption('2000');
	await page.getByLabel('Frame rate').selectOption('12');
	await page.getByLabel('Movie format').selectOption('mp4');
	const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
	await page.getByRole('button', { name: /Export MP4/ }).click();
	const download = await downloadPromise;
	// Real MP4 when WebCodecs/H.264 is available, otherwise the graceful .zip fallback.
	expect(download.suggestedFilename()).toMatch(/^fractalflow-.*\.(mp4|zip)$/);
});

test.describe('hi-DPR layout', () => {
	test.use({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 2 });

	test('Explore lays out the canvas and Codex panel on hi-DPR displays', async ({ page }) => {
		await page.goto('/explore');
		await expect(page.locator('canvas')).toBeVisible();
		await page.waitForTimeout(900); // let any ResizeObserver feedback settle
		const codex = page.getByRole('complementary', { name: 'Codex' });
		const box = (await codex.boundingBox())!;
		// The panel sits within the viewport — the canvas drawing-buffer height
		// must not feed back through the ResizeObserver and grow the layout.
		expect(box.y + box.height).toBeLessThanOrEqual(601);
		await expect(page.getByRole('tab', { name: 'Journey' })).toBeVisible();
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
	// The preset palette lives in Compose now; load a Julia preset and land on Explore.
	await loadPreset(page, 'Julia Dendrite');
	await waitForEngine(page);
	await page.waitForTimeout(300);
	await expect(page).toHaveScreenshot('explore-julia.png', {
		fullPage: true,
		maxDiffPixelRatio: 0.02
	});
});

test('visual: Lyapunov fractal', async ({ page }) => {
	// Deep-zoom GLSL/WGSL path → renders in headless like the Mandelbrot. The
	// (a,b) home view is static for a fixed scene, so the page is deterministic.
	await page.goto('/compose');
	await choose(page, 'Formula', 'Lyapunov');
	await page.getByRole('link', { name: 'Explore' }).click();
	await waitForEngine(page);
	await page.waitForTimeout(300);
	await expect(page).toHaveScreenshot('explore-lyapunov.png', {
		fullPage: true,
		maxDiffPixelRatio: 0.02
	});
});

test('visual: Apollonian gasket', async ({ page }) => {
	await page.goto('/compose');
	await choose(page, 'Formula', 'Apollonian');
	await page.getByRole('link', { name: 'Explore' }).click();
	await waitForEngine(page);
	await page.waitForTimeout(300);
	await expect(page).toHaveScreenshot('explore-apollonian.png', {
		fullPage: true,
		maxDiffPixelRatio: 0.02
	});
});

// On a phone the docked panels would crush the canvas, so they become overlay
// drawers and the canvas goes full-bleed. (See the compact layout in ui-logic.)
test.describe('mobile (compact viewport)', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the canvas is full-bleed and the Codex starts closed', async ({ page }) => {
		await page.goto('/explore');
		await waitForEngine(page);
		const canvas = await page.locator('canvas').boundingBox();
		expect(canvas?.width ?? 0).toBeGreaterThan(386); // ≈ the 390px viewport
		// Closed drawer: out of the a11y tree and off-screen.
		await expect(page.locator('aside[aria-label="Codex"]')).toHaveAttribute('aria-hidden', 'true');
	});

	test('the Codex opens as an overlay drawer with a backdrop, and Escape closes it', async ({
		page
	}) => {
		await page.goto('/explore');
		await waitForEngine(page);
		const codex = page.locator('aside[aria-label="Codex"]');
		await page.getByRole('button', { name: 'Toggle Codex panel' }).click();
		await expect(codex).toHaveAttribute('aria-hidden', 'false');
		await expect(page.getByRole('button', { name: 'Close panel' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(codex).toHaveAttribute('aria-hidden', 'true');
	});
});
