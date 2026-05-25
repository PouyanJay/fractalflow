<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { provideUiStore } from '$lib/stores/ui.svelte';
	import { provideEngineStore } from '$lib/stores/engine.svelte';
	import { provideSceneStore } from '$lib/stores/scene.svelte';
	import { provideBookmarksStore } from '$lib/stores/bookmarks.svelte';
	import { provideTimelineStore } from '$lib/stores/timeline.svelte';
	import TopBar from '$lib/components/shell/TopBar.svelte';
	import LibraryPanel from '$lib/components/shell/LibraryPanel.svelte';
	import InspectorPanel from '$lib/components/shell/InspectorPanel.svelte';
	import StatusBar from '$lib/components/shell/StatusBar.svelte';
	import CommandPalette from '$lib/components/shell/CommandPalette.svelte';

	let { children } = $props();
	const ui = provideUiStore();
	provideEngineStore();
	provideSceneStore();
	provideBookmarksStore();
	provideTimelineStore();

	// Reflect density on the root element so tokens can respond.
	$effect(() => {
		document.documentElement.dataset.density = ui.density;
	});

	function onkeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			ui.toggleCommandPalette();
		}
	}
</script>

<svelte:head>
	<title>FractalFlow Studio</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<svelte:window {onkeydown} />

<div class="shell">
	<TopBar />
	<div class="body">
		{#if ui.panels.library}<LibraryPanel />{/if}
		<main class="main">
			{@render children()}
		</main>
		{#if ui.panels.inspector}<InspectorPanel />{/if}
	</div>
	<StatusBar />
	<CommandPalette />
</div>

<style>
	.shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
	}
</style>
