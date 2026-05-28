<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import FractalStage from '$lib/components/engine/FractalStage.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getJourneyStore } from '$lib/stores/journey.svelte';
	import { isValidArtStyle } from '$lib/stores/ui-logic';
	import { encodeScene, decodeScene } from '$lib/scene/codec';

	const sceneStore = getSceneStore();
	const ui = getUiStore();
	const journey = getJourneyStore();

	let hydrated = $state(false);
	let urlTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		// Restore a shared view from the single-scene art style (?r=) then scene (?s=).
		const params = page.url.searchParams;
		const styleParam = params.get('r');
		if (styleParam && isValidArtStyle(styleParam)) ui.selectArtStyle(styleParam);
		const token = params.get('s');
		if (token) sceneStore.setScene(decodeScene(token));
		hydrated = true;
	});

	$effect(() => {
		// Guard first: while a journey streams frames through the scene store (or
		// before hydration) skip the whole body — no per-frame encode work, no URL
		// churn. Reading the stores below establishes the reactive dependencies, so
		// the URL re-writes whenever the scene or style changes.
		if (!hydrated || journey.playing) return;
		const token = encodeScene(sceneStore.scene);
		const styleId = ui.selectedStyle ?? 'deep-zoom-2d';
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			// Build the query directly (URLSearchParams would form-encode the token's
			// `~` separators); encodeURIComponent leaves them literal.
			const query = `?s=${encodeURIComponent(token)}&r=${encodeURIComponent(styleId)}`;
			history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`);
		}, 250);
	});

	onDestroy(() => clearTimeout(urlTimer));
</script>

<FractalStage />
