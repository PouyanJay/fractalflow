<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MODES, modeFromPath } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getRenderer } from '$lib/fractals/registry';
	import { EXPORT_SIZES, captureScene, downloadBlob, exportFilename } from '$lib/engine/capture';
	import { getIcon } from '$lib/components/icons';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import { Command, PanelLeft, PanelRight, Rows3, Share2, Check, Download } from '@lucide/svelte';

	const ui = getUiStore();
	const scene = getSceneStore();
	const activeMode = $derived(modeFromPath(page.url.pathname));

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

	// Export the current view as a still. The full Still/Movie sheet (resolution,
	// progress, journey video) arrives in Step 2; for now Export does the one
	// universally useful thing — a high-res PNG of whatever the scene shows.
	const FHD = EXPORT_SIZES.find((s) => s.id === 'fhd') ?? EXPORT_SIZES[0];
	const renderer = $derived(getRenderer(ui.selectedStyle));
	// Tag the filename with the active subject (formula / attractor / flame).
	const exportTag = $derived(
		ui.selectedStyle === 'deep-zoom-2d'
			? scene.formula
			: ui.selectedStyle === 'attractors'
				? `attractor-${scene.attractor}`
				: ui.selectedStyle === 'flames'
					? `flame-${scene.flame}`
					: (ui.selectedStyle ?? 'fractal')
	);

	let exporting = $state(false);
	let exportFailed = $state(false);
	const exportLabel = $derived(
		exportFailed ? 'Export failed' : exporting ? 'Exporting…' : 'Export'
	);

	async function exportStill() {
		if (!renderer || exporting) return;
		exporting = true;
		exportFailed = false;
		try {
			const blob = await captureScene(renderer, scene.scene, FHD.width, FHD.height);
			if (!blob) {
				exportFailed = true;
				return;
			}
			downloadBlob(blob, exportFilename(exportTag));
		} catch {
			exportFailed = true;
		} finally {
			exporting = false;
			// Compute styles (Flames/Attractors) need WebGPU; surface the failure
			// briefly, then let the user try again.
			if (exportFailed) setTimeout(() => (exportFailed = false), 2400);
		}
	}
</script>

<header class="topbar">
	<div class="brand">
		<svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
			<path
				d="M12 3 L21 19 L3 19 Z M12 11 L16.5 19 L7.5 19 Z"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linejoin="round"
			/>
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
		<IconButton
			label="Toggle library panel"
			active={ui.panels.library}
			onclick={() => ui.togglePanel('library')}
		>
			<PanelLeft size={16} aria-hidden="true" />
		</IconButton>
		<IconButton
			label="Toggle inspector panel"
			active={ui.panels.inspector}
			onclick={() => ui.togglePanel('inspector')}
		>
			<PanelRight size={16} aria-hidden="true" />
		</IconButton>
		<IconButton
			label={`Density: ${ui.density} — click to toggle`}
			onclick={() => ui.cycleDensity()}
		>
			<Rows3 size={16} aria-hidden="true" />
		</IconButton>
		<div class="divider" aria-hidden="true"></div>
		<button
			class="export"
			class:failed={exportFailed}
			type="button"
			onclick={exportStill}
			disabled={!renderer || exporting}
			aria-busy={exporting}
		>
			<Download size={15} aria-hidden="true" />
			<span aria-live="polite">{exportLabel}</span>
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

	.modes {
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
	}
	.tab {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		height: 32px;
		padding: 0 var(--ff-space-3);
		border-radius: var(--ff-radius-md);
		color: var(--ff-text-muted);
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-medium);
		transition:
			background var(--ff-dur-fast) var(--ff-ease),
			color var(--ff-dur-fast) var(--ff-ease);
	}
	.tab:hover {
		background: var(--ff-surface-hover);
		color: var(--ff-text);
	}
	.tab.active {
		background: var(--ff-surface-active);
		color: var(--ff-text);
		box-shadow: inset 0 -2px 0 var(--ff-accent);
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
	.export:hover:not(:disabled) {
		background: var(--ff-primary-strong);
	}
	.export:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.export.failed {
		background: var(--ff-surface-raised);
		border-color: var(--ff-danger);
		color: var(--ff-danger);
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
