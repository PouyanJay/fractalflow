<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { MODES, modeFromPath } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getIcon } from '$lib/components/icons';
	import IconButton from '$lib/components/ui/IconButton.svelte';
	import { Command, PanelLeft, PanelRight, Share2, Check, Download } from '@lucide/svelte';
	import { SPIRAL_PETAL } from '$lib/components/brand';

	// Build-time app version (injected from package.json via Vite define).
	const appVersion = __APP_VERSION__;
	const ui = getUiStore();
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
		<span class="title">Fractal <span class="sub">Studio</span></span>
		<span class="ver" title="Version {appVersion}">v{appVersion}</span>
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
		/* min-height (not height) so the safe-area inset can extend the bar under a
		 * notch without squashing its contents; insets are 0 on desktop. */
		min-height: var(--ff-topbar-h);
		padding-top: env(safe-area-inset-top);
		padding-left: max(var(--ff-space-3), env(safe-area-inset-left));
		padding-right: max(var(--ff-space-3), env(safe-area-inset-right));
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
	.ver {
		font-family: var(--ff-font-mono);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
		background: var(--ff-surface-raised);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		padding: 1px 5px;
		letter-spacing: 0;
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
		.topbar {
			gap: var(--ff-space-2);
		}
		.tab span,
		.search span {
			display: none;
		}
		.brand {
			min-width: 0;
		}
	}

	/* Phones: keep just the mark + the essential actions so the bar never wraps. */
	@media (max-width: 560px) {
		.title,
		.ver,
		.export span {
			display: none;
		}
		.export {
			padding: 0 var(--ff-space-2);
		}
		.search {
			padding: 0 var(--ff-space-2);
		}
	}
</style>
