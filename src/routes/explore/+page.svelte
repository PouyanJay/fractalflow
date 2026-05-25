<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import FractalStage from '$lib/components/engine/FractalStage.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { isValidArtStyle } from '$lib/stores/ui-logic';
	import { encodeScene, decodeScene } from '$lib/scene/codec';

	const sceneStore = getSceneStore();
	const ui = getUiStore();

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
		if (!hydrated) return;
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const url = new URL(window.location.href);
			url.searchParams.set('s', token);
			url.searchParams.set('r', styleId);
			history.replaceState(history.state, '', url);
		}, 250);
	});

	onDestroy(() => clearTimeout(urlTimer));
</script>

<FractalStage />
