import { test, expect } from '@playwright/test';

test('root redirects to Explore and renders the shell', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/explore$/);
	await expect(page.getByText('FractalFlow')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
	// Both panels present by default.
	await expect(page.getByRole('complementary', { name: 'Library' })).toBeVisible();
	await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
});

test('mode tabs navigate between modes', async ({ page }) => {
	await page.goto('/explore');
	await page.getByRole('link', { name: 'Compose' }).click();
	await expect(page).toHaveURL(/\/compose$/);
	await expect(page.getByRole('heading', { name: 'Compose' })).toBeVisible();
});

test('command palette opens with the keyboard and navigates', async ({ page }) => {
	await page.goto('/explore');
	// Ensure the app has hydrated before exercising the keyboard shortcut.
	await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
	await page.keyboard.press('Control+k');
	const dialog = page.getByRole('dialog', { name: 'Command palette' });
	await expect(dialog).toBeVisible();
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

test('visual: Explore shell', async ({ page }) => {
	await page.goto('/explore');
	await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
	await expect(page).toHaveScreenshot('explore-shell.png', { fullPage: true });
});
