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
		const token = encodeScene(sceneStore.scene);
		const styleId = ui.selectedStyle ?? 'deep-zoom-2d';
		// Touch the stack so added layers / blend / opacity edits re-write the URL.
		const layerToken = layers.count > 1 ? encodeLayers(layers.current()) : '';
		// While a journey plays it streams frames through the scene store; don't
		// churn the deep-link URL with those intermediate views.
		if (!hydrated || journey.playing) return;
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
