<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { COMPACT_QUERY, modeFromPath } from '$lib/stores/ui-logic';
	import { provideUiStore } from '$lib/stores/ui.svelte';
	import { provideEngineStore } from '$lib/stores/engine.svelte';
	import { provideSceneStore } from '$lib/stores/scene.svelte';
	import { provideBookmarksStore } from '$lib/stores/bookmarks.svelte';
	import { provideCustomPalettesStore } from '$lib/stores/custom-palettes.svelte';
	import { provideJourneyStore } from '$lib/stores/journey.svelte';
	import TopBar from '$lib/components/shell/TopBar.svelte';
	import StartPanel from '$lib/components/shell/StartPanel.svelte';
	import InspectorPanel from '$lib/components/shell/InspectorPanel.svelte';
	import StatusBar from '$lib/components/shell/StatusBar.svelte';
	import CommandPalette from '$lib/components/shell/CommandPalette.svelte';
	import ExportSheet from '$lib/components/shell/ExportSheet.svelte';

	let { children } = $props();
	const ui = provideUiStore();

	// The Start palette is Compose-only; Explore stays immersive (no left chrome).
	const isCompose = $derived(modeFromPath(page.url.pathname) === 'compose');
	// On a phone the panels are overlay drawers; a dimmed scrim sits behind the
	// open one to focus it and to give a tap target that closes it.
	const scrimOpen = $derived(
		ui.compact && (ui.panels.inspector || (isCompose && ui.panels.library))
	);
	provideEngineStore();
	provideSceneStore();
	provideBookmarksStore();
	provideCustomPalettesStore();
	provideJourneyStore();

	onMount(() => {
		// The compact/docked layout follows the viewport width. The store seeds
		// itself from the same query before first paint; here we keep it in sync
		// as the window resizes or the device rotates.
		const mq = window.matchMedia(COMPACT_QUERY);
		const sync = () => ui.setCompact(mq.matches);
		mq.addEventListener('change', sync);
		// Reveal the shell once hydrated (the preload guard hid mobile drawers to
		// avoid a flash of the docked layout before JS decides the breakpoint).
		document.documentElement.removeAttribute('data-ff-preload');
		return () => mq.removeEventListener('change', sync);
	});

	function closePanels() {
		ui.setPanel('inspector', false);
		ui.setPanel('library', false);
	}

	function onkeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			ui.toggleCommandPalette();
		}
		if (event.key === 'Escape' && scrimOpen) closePanels();
	}
</script>

<svelte:head>
	<title>Fractal Studio</title>
</svelte:head>

<svelte:window {onkeydown} />

<div class="shell">
	<TopBar />
	<div class="body">
		{#if isCompose}<StartPanel />{/if}
		<main class="main">
			{@render children()}
		</main>
		<InspectorPanel />
		{#if scrimOpen}
			<button class="scrim" type="button" aria-label="Close panel" onclick={closePanels}></button>
		{/if}
	</div>
	<StatusBar />
	<CommandPalette />
	<ExportSheet />
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		/* dvh tracks the dynamic viewport so the mobile URL bar can't clip the
		 * status bar; vh is the fallback for browsers without dvh. */
		height: 100vh;
		height: 100dvh;
		overflow: hidden;
	}
	.body {
		position: relative;
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	/* Dimmed backdrop behind an open drawer on compact viewports. */
	.scrim {
		position: absolute;
		inset: 0;
		z-index: calc(var(--ff-z-overlay) - 1);
		border: none;
		padding: 0;
		background: color-mix(in srgb, var(--ff-neutral-0) 60%, transparent);
		animation: scrim-in var(--ff-dur-base) var(--ff-ease);
		cursor: pointer;
	}
	@keyframes scrim-in {
		from {
			opacity: 0;
		}
	}
</style>
