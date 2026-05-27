<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MODES, modeFromPath } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getIcon } from '$lib/components/icons';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import { Command, PanelLeft, PanelRight, Share2, Check, Download } from '@lucide/svelte';

	const ui = getUiStore();
	const activeMode = $derived(modeFromPath(page.url.pathname));

	// One logarithmic-spiral petal; the brand mark renders it three times at 120°.
	// Mirrors static/favicon.svg.
	const SPIRAL_PETAL =
		'M 13.57 12.24 L 13.38 12.41 L 13.22 12.55 L 13.06 12.67 L 12.90 12.77 L 12.75 12.85 L 12.59 12.91 L 12.44 12.95 L 12.30 12.98 L 12.16 13.00 L 12.02 13.00 L 11.90 13.00 L 11.78 12.99 L 11.66 12.98 L 11.55 12.96 L 11.45 12.94 L 11.35 12.92 L 11.25 12.90 L 11.15 12.88 L 11.05 12.86 L 10.95 12.85 L 10.84 12.83 L 10.73 12.81 L 10.60 12.78 L 10.47 12.76 L 10.33 12.72 L 10.18 12.68 L 10.01 12.62 L 9.83 12.55 L 9.64 12.46 L 9.45 12.36 L 9.24 12.22 L 9.03 12.06 L 8.81 11.87 L 8.60 11.65 L 8.39 11.39 L 8.18 11.09 L 7.99 10.75 L 7.82 10.38 L 7.67 9.96 L 7.55 9.51 L 7.47 9.01 L 7.43 8.48 L 7.44 7.91 L 7.50 7.31 L 7.61 6.69 L 7.80 6.04 L 8.04 5.36 L 8.34 4.65 L 8.34 4.65 L 7.69 5.09 L 7.13 5.60 L 6.63 6.16 L 6.19 6.75 L 5.81 7.37 L 5.50 8.01 L 5.25 8.67 L 5.06 9.34 L 4.94 10.02 L 4.89 10.69 L 4.89 11.35 L 4.96 12.00 L 5.08 12.63 L 5.26 13.24 L 5.50 13.82 L 5.78 14.37 L 6.11 14.87 L 6.48 15.34 L 6.89 15.76 L 7.32 16.13 L 7.79 16.45 L 8.27 16.72 L 8.77 16.93 L 9.27 17.09 L 9.78 17.20 L 10.28 17.25 L 10.78 17.25 L 11.26 17.20 L 11.72 17.11 L 12.16 16.97 L 12.57 16.79 L 12.95 16.57 L 13.29 16.32 L 13.59 16.05 L 13.85 15.75 L 14.07 15.44 L 14.25 15.11 L 14.38 14.78 L 14.47 14.45 L 14.52 14.12 L 14.52 13.80 L 14.49 13.50 L 14.42 13.22 L 14.32 12.96 L 14.18 12.72 L 14.02 12.52 L 13.82 12.36 L 13.57 12.24 Z';

	let copied = $state(false);
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(window.location.href);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// Clipboard may be unavailable (e.g. insecure context); ignore.
		}
	}
</script>

<header class="topbar">
	<div class="brand">
		<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
			<!-- Spiral swirl: three logarithmic-spiral petals at 120°, our brand mark. -->
			<g fill="currentColor">
				<path d={SPIRAL_PETAL} />
				<path d={SPIRAL_PETAL} transform="rotate(120 12 12)" />
				<path d={SPIRAL_PETAL} transform="rotate(240 12 12)" />
			</g>
		</svg>
		<span class="title">FractalFlow <span class="sub">Studio</span></span>
	</div>

	<nav class="modes" aria-label="Workspace modes">
		{#each MODES as m (m.id)}
			{@const Icon = getIcon(m.icon)}
			<a
				class="tab"
				class:active={activeMode === m.id}
				href={resolve(m.path)}
				aria-current={activeMode === m.id ? 'page' : undefined}
			>
				{#if Icon}<Icon size={16} aria-hidden="true" />{/if}
				<span>{m.label}</span>
			</a>
		{/each}
	</nav>

	<div class="actions">
		<button
			class="search"
			type="button"
			onclick={() => ui.openCommandPalette()}
			aria-label="Open command palette"
		>
			<Command size={14} aria-hidden="true" />
			<span>Search</span>
			<kbd>⌘K</kbd>
		</button>
		<IconButton
			label={copied ? 'Link copied' : 'Copy link to this view'}
			active={copied}
			onclick={copyLink}
		>
			{#if copied}
				<Check size={16} aria-hidden="true" />
			{:else}
				<Share2 size={16} aria-hidden="true" />
			{/if}
		</IconButton>
		<div class="divider" aria-hidden="true"></div>
		{#if activeMode === 'compose'}
			<IconButton
				label="Toggle Start panel"
				active={ui.panels.library}
				onclick={() => ui.togglePanel('library')}
			>
				<PanelLeft size={16} aria-hidden="true" />
			</IconButton>
		{/if}
		<IconButton
			label="Toggle Codex panel"
			active={ui.panels.inspector}
			onclick={() => ui.togglePanel('inspector')}
		>
			<PanelRight size={16} aria-hidden="true" />
		</IconButton>
		<div class="divider" aria-hidden="true"></div>
		<button class="export" type="button" onclick={() => ui.openExport()}>
			<Download size={15} aria-hidden="true" />
			<span>Export</span>
		</button>
	</div>
</header>

<style>
	.topbar {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--ff-space-4);
		height: var(--ff-topbar-h);
		padding: 0 var(--ff-space-3);
		background: var(--ff-surface);
		border-bottom: 1px solid var(--ff-border);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
		min-width: var(--ff-panel-w);
	}
	.mark {
		width: 22px;
		height: 22px;
		color: var(--ff-accent);
		flex: none;
	}
	.title {
		font-weight: var(--ff-weight-semibold);
		font-size: var(--ff-text-md);
		letter-spacing: 0.01em;
		white-space: nowrap;
	}
	.title .sub {
		color: var(--ff-text-muted);
		font-weight: var(--ff-weight-regular);
	}

	/* Segmented control: a calm raised group; the active mode is a filled chip.
	   No accent glow or underline — the fractal art supplies the colour. */
	.modes {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 3px;
		background: var(--ff-surface-raised);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		height: 28px;
		padding: 0 var(--ff-space-3);
		border-radius: var(--ff-radius-sm);
		color: var(--ff-text-muted);
		font-size: var(--ff-text-sm);
		font-weight: var(--ff-weight-medium);
		transition:
			background var(--ff-dur-fast) var(--ff-ease),
			color var(--ff-dur-fast) var(--ff-ease);
	}
	.tab:hover {
		color: var(--ff-text);
	}
	.tab.active {
		background: var(--ff-surface-active);
		color: var(--ff-text);
		box-shadow: var(--ff-shadow-1);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
		margin-left: auto;
	}
	.search {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		height: 30px;
		padding: 0 var(--ff-space-2) 0 var(--ff-space-3);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text-muted);
		font-size: var(--ff-text-sm);
		cursor: pointer;
		transition:
			border-color var(--ff-dur-fast) var(--ff-ease),
			color var(--ff-dur-fast) var(--ff-ease);
	}
	.search:hover {
		border-color: var(--ff-border-strong);
		color: var(--ff-text);
	}
	.search kbd {
		font-family: var(--ff-font-mono);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
		background: var(--ff-surface-overlay);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		padding: 1px 5px;
	}
	.divider {
		width: 1px;
		height: 20px;
		background: var(--ff-border);
		margin: 0 var(--ff-space-1);
	}
	.export {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		height: 30px;
		padding: 0 var(--ff-space-3);
		border: 1px solid transparent;
		border-radius: var(--ff-radius-md);
		background: var(--ff-accent);
		color: var(--ff-accent-contrast);
		font-size: var(--ff-text-sm);
		font-weight: var(--ff-weight-semibold);
		cursor: pointer;
		white-space: nowrap;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.export:hover {
		background: var(--ff-primary-strong);
	}

	@media (max-width: 720px) {
		.tab span,
		.search span {
			display: none;
		}
		.brand {
			min-width: 0;
		}
	}
</style>
