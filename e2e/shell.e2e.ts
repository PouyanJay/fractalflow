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
	await expect(page.getByLabel('Maximum iterations')).toHaveValue('300');
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
	await page.getByLabel('Maximum iterations').fill('600');
	await expect(page.getByLabel('Maximum iterations')).toHaveValue('600');
});

test('mode tabs navigate between modes', async ({ page }) => {
	await page.goto('/explore');
	await page.getByRole('link', { name: 'Compose' }).click();
	await expect(page).toHaveURL(/\/compose$/);
	await expect(page.getByRole('heading', { name: 'Compose' })).toBeVisible();
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
	await page.getByLabel('Maximum iterations').fill('800');
	await page.waitForTimeout(400); // allow the debounced URL write
	const url = page.url();
	expect(url).toContain('s=');
	await page.goto(url);
	await waitForEngine(page);
	await expect(page.getByLabel('Formula')).toHaveValue('julia');
	await expect(page.getByLabel('Maximum iterations')).toHaveValue('800');
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

test('Render mode exports a PNG download', async ({ page }) => {
	await page.goto('/render');
	await expect(page.getByRole('heading', { name: 'Render', exact: true })).toBeVisible();
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /Export PNG/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^fractalflow-.*\.png$/);
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
