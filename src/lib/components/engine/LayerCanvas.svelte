<script lang="ts">
	/**
	 * A single non-interactive composited layer: renders a fixed scene + art style
	 * to its own GPU canvas. The active layer uses the interactive FractalStage
	 * instead; these static layers sit above/below it and the browser composites
	 * them via the wrapper's mix-blend-mode (see LayeredStage).
	 */
	import GpuCanvas from './GpuCanvas.svelte';
	import { getRenderer } from '$lib/fractals/registry';
	import type { SceneState } from '$lib/engine/types';
	import type { ArtStyleId } from '$lib/stores/ui-logic';

	interface Props {
		style: ArtStyleId;
		scene: SceneState;
	}
	let { style, scene }: Props = $props();

	const renderer = $derived(getRenderer(style));
	const getScene = () => scene;
</script>

{#if renderer}
	<GpuCanvas {renderer} {getScene} />
{/if}
