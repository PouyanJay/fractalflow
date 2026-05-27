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
		// Restore a shared view: art style (?r=) then scene (?s=).
		const params = page.url.searchParams;
		const styleParam = params.get('r');
		if (styleParam && isValidArtStyle(styleParam)) ui.selectArtStyle(styleParam);
		const token = params.get('s');
		if (token) sceneStore.setScene(decodeScene(token));
		hydrated = true;
	});

	$effect(() => {
		const token = encodeScene(sceneStore.scene);
		const styleId = ui.selectedStyle ?? 'deep-zoom-2d';
		// While a journey plays it streams frames through the scene store; don't
		// churn the deep-link URL with those intermediate views (it ends back at
		// the user's framed scene anyway).
		if (!hydrated || journey.playing) return;
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			// Build the query directly rather than via URL/URLSearchParams, whose
			// form-encoding turns the token's `~` separators into `%7E`.
			// encodeURIComponent leaves `~` literal (and still escapes `+` etc.).
			const query = `?s=${encodeURIComponent(token)}&r=${encodeURIComponent(styleId)}`;
			history.replaceState(history.state, '', `${location.pathname}${query}${location.hash}`);
		}, 250);
	});

	onDestroy(() => clearTimeout(urlTimer));
</script>

<FractalStage />
