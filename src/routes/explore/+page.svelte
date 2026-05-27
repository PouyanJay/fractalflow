<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import LayeredStage from '$lib/components/engine/LayeredStage.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getLayersStore } from '$lib/stores/layers.svelte';
	import { getJourneyStore } from '$lib/stores/journey.svelte';
	import { isValidArtStyle } from '$lib/stores/ui-logic';
	import { encodeScene, decodeScene, encodeLayers, decodeLayers } from '$lib/scene/codec';

	const sceneStore = getSceneStore();
	const ui = getUiStore();
	const layers = getLayersStore();
	const journey = getJourneyStore();

	let hydrated = $state(false);
	let urlTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		// Restore a shared view: a multi-layer document (?l=) wins; otherwise the
		// single-scene art style (?r=) then scene (?s=).
		const params = page.url.searchParams;
		const layerToken = params.get('l');
		const stack = layerToken ? decodeLayers(layerToken) : null;
		if (stack) {
			layers.load(stack);
		} else {
			const styleParam = params.get('r');
			if (styleParam && isValidArtStyle(styleParam)) ui.selectArtStyle(styleParam);
			const token = params.get('s');
			if (token) sceneStore.setScene(decodeScene(token));
		}
		hydrated = true;
	});

	$effect(() => {
		// Guard first: while a journey streams frames through the scene store (or
		// before hydration) skip the whole body — no per-frame encode work, no URL
		// churn. Reading the stores below establishes the reactive dependencies, so
		// the URL re-writes whenever the scene, style, or layer stack changes.
		if (!hydrated || journey.playing) return;
		const token = encodeScene(sceneStore.scene);
		const styleId = ui.selectedStyle ?? 'deep-zoom-2d';
		const layerToken = layers.count > 1 ? encodeLayers(layers.current()) : '';
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			// Build the query directly (URLSearchParams would form-encode the token's
			// `~`/`!`/`_` separators); encodeURIComponent leaves them literal.
			let query = `?s=${encodeURIComponent(token)}&r=${encodeURIComponent(styleId)}`;
			if (layerToken) query += `&l=${encodeURIComponent(layerToken)}`;
			history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`);
		}, 250);
	});

	onDestroy(() => clearTimeout(urlTimer));
</script>

<LayeredStage />
