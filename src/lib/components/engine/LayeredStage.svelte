<script lang="ts">
	/**
	 * The Explore viewport with multi-layer compositing. One layer is "active" and
	 * interactive (the existing FractalStage, driven by the live scene); the rest
	 * are static LayerCanvas instances stacked in order. The browser composites
	 * them via each wrapper's mix-blend-mode + opacity (the blend ids ARE CSS
	 * mix-blend-mode values). With a single layer it renders FractalStage directly,
	 * so the common case is byte-identical to the pre-layering viewport.
	 */
	import FractalStage from './FractalStage.svelte';
	import LayerCanvas from './LayerCanvas.svelte';
	import { getLayersStore } from '$lib/stores/layers.svelte';

	const layers = getLayersStore();
</script>

{#if layers.count === 1}
	<FractalStage />
{:else}
	<div class="layered">
		{#each layers.layers as layer (layer.id)}
			<div
				class="layer"
				class:active={layer.id === layers.activeId}
				class:hidden={!layer.visible}
				style="mix-blend-mode: {layer.blend}; opacity: {layer.opacity};"
			>
				{#if layer.id === layers.activeId}
					<FractalStage />
				{:else}
					<LayerCanvas style={layer.style} scene={layer.scene} />
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.layered {
		position: relative;
		flex: 1;
		min-width: 0;
		min-height: 0;
		display: flex;
		/* Contain blending so layers composite over the stage, not the page. */
		isolation: isolate;
		background: var(--ff-bg);
	}
	.layer {
		position: absolute;
		inset: 0;
		display: flex;
		/* Static layers must let gestures fall through to the active one. */
		pointer-events: none;
	}
	.layer.active {
		pointer-events: auto;
	}
	.layer.hidden {
		display: none;
	}
</style>
