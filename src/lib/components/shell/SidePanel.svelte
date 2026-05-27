<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PanelId } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';

	interface Props {
		title: string;
		panelId: PanelId;
		side?: 'left' | 'right';
		/** Optional custom head content (e.g. a tab strip); falls back to the title. */
		header?: Snippet;
		children: Snippet;
	}

	let { title, panelId, side = 'left', header, children }: Props = $props();

	const ui = getUiStore();
	const width = $derived(ui.panelWidths[panelId]);
	// Open/closed is owned by the UI store. Docked: closed → removed from the flow
	// (the canvas reclaims the width). Compact: closed → slid off-screen (drawer).
	const open = $derived(ui.panels[panelId]);

	let dragging = $state(false);
	let startX = 0;
	let startWidth = 0;

	function onpointerdown(event: PointerEvent) {
		dragging = true;
		startX = event.clientX;
		startWidth = width;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onpointermove(event: PointerEvent) {
		if (!dragging) return;
		const dx = event.clientX - startX;
		ui.setPanelWidth(panelId, startWidth + (side === 'left' ? dx : -dx));
	}

	function onpointerup(event: PointerEvent) {
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const step = (event.shiftKey ? 32 : 16) * (event.key === 'ArrowRight' ? 1 : -1);
		ui.setPanelWidth(panelId, width + (side === 'left' ? step : -step));
	}
</script>

<aside
	class="panel"
	class:right={side === 'right'}
	class:open
	style="width: {width}px"
	aria-label={title}
	aria-hidden={!open}
>
	<div class="head" class:custom={header}>
		{#if header}{@render header()}{:else}<h2>{title}</h2>{/if}
	</div>
	<div class="body">
		{@render children()}
	</div>
	<button
		type="button"
		class="resize-handle"
		class:dragging
		class:right={side === 'right'}
		aria-label="Resize {title} panel (drag, or focus and use arrow keys)"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		{onkeydown}
	></button>
</aside>

<style>
	.panel {
		position: relative;
		display: flex;
		flex-direction: column;
		background: var(--ff-surface);
		border-right: 1px solid var(--ff-border);
		overflow: hidden;
		flex: none;
	}
	.panel.right {
		border-right: none;
		border-left: 1px solid var(--ff-border);
	}
	/* Docked layout: a closed panel leaves the flow so the canvas takes its width. */
	.panel:not(.open) {
		display: none;
	}

	/*
	 * Compact (mobile) layout: panels become overlay drawers so the canvas stays
	 * full-bleed. A closed drawer slides off-screen instead of unmounting, so it
	 * animates in and out. The preload guard (set by the inline script in
	 * app.html before hydration) hard-hides drawers on a cold mobile load so the
	 * docked SSR markup never flashes. Breakpoint mirrors COMPACT_QUERY (900px).
	 */
	:global(html[data-ff-preload]) .panel {
		display: none !important;
	}
	@media (max-width: 900px) {
		.panel,
		.panel:not(.open) {
			display: flex;
			position: fixed;
			top: var(--ff-topbar-h);
			bottom: var(--ff-statusbar-h);
			left: 0;
			right: auto;
			width: min(86vw, 340px) !important;
			z-index: var(--ff-z-overlay);
			border: none;
			border-right: 1px solid var(--ff-border);
			box-shadow: var(--ff-shadow-overlay);
			transform: translateX(-100%);
			transition: transform var(--ff-dur-base) var(--ff-ease);
		}
		.panel.right,
		.panel.right:not(.open) {
			left: auto;
			right: 0;
			border-right: none;
			border-left: 1px solid var(--ff-border);
			transform: translateX(100%);
		}
		.panel.open {
			transform: none;
		}
		.panel:not(.open) {
			pointer-events: none;
		}
		/* No drag-to-resize on a touch drawer. */
		.resize-handle {
			display: none;
		}
	}
	.head {
		display: flex;
		align-items: center;
		height: 36px;
		padding: 0 var(--ff-space-4);
		border-bottom: 1px solid var(--ff-border);
		flex: none;
	}
	/* A custom header (e.g. a tab strip) manages its own padding. */
	.head.custom {
		padding: 0;
	}
	.head h2 {
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ff-text-muted);
	}
	.body {
		flex: 1;
		overflow-y: auto;
		padding: var(--ff-space-3);
	}

	/* Drag-to-resize handle on the panel's inner edge. */
	.resize-handle {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 7px;
		right: -3px;
		padding: 0;
		border: none;
		background: transparent;
		appearance: none;
		cursor: col-resize;
		z-index: var(--ff-z-panel);
		touch-action: none;
	}
	.resize-handle.right {
		right: auto;
		left: -3px;
	}
	.resize-handle::after {
		content: '';
		position: absolute;
		inset: 0 3px;
		background: transparent;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.resize-handle:hover::after,
	.resize-handle:focus-visible::after,
	.resize-handle.dragging::after {
		background: var(--ff-accent);
	}
	.resize-handle:focus-visible {
		outline: none;
	}
</style>
