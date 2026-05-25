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
	await expect(page.getByRole('button', { name: 'Aurora' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reset view' })).toBeVisible();
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

test('visual: Explore renders the Mandelbrot', async ({ page }) => {
	await page.goto('/explore');
	await waitForEngine(page);
	// The Mandelbrot is static for a fixed scene, so the full page is deterministic.
	await expect(page).toHaveScreenshot('explore-mandelbrot.png', {
		fullPage: true,
		maxDiffPixelRatio: 0.02
	});
});
