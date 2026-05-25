import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { expect, test } from 'vitest';
import ModeView from './ModeView.svelte';
import { MODES } from '$lib/stores/ui-logic';

test('renders the given mode title and description', async () => {
	render(ModeView, { props: { mode: 'render' } });
	const meta = MODES.find((m) => m.id === 'render')!;
	await expect.element(page.getByRole('heading', { name: meta.label })).toBeInTheDocument();
	await expect.element(page.getByText(meta.blurb)).toBeInTheDocument();
});

test('labels its region for assistive tech', async () => {
	render(ModeView, { props: { mode: 'explore' } });
	await expect.element(page.getByRole('region', { name: 'Explore workspace' })).toBeInTheDocument();
});
