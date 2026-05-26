<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import GpuCanvas from '$lib/components/engine/GpuCanvas.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getEngineStore } from '$lib/stores/engine.svelte';
	import { getRenderer } from '$lib/fractals/registry';
	import type { BackendType } from '$lib/engine/types';

	const ui = getUiStore();
	const scene = getSceneStore();
	const engine = getEngineStore();

	const renderer = $derived(getRenderer(ui.selectedStyle));
	const getScene = () => scene.scene;
	const handleBackend = (type: BackendType) => engine.setBackend(type);
</script>

<NodeShell title="Output" target>
	<div class="preview">
		{#if renderer}
			{#key renderer.id}
				<GpuCanvas {renderer} {getScene} onbackend={handleBackend} />
			{/key}
		{:else}
			<p class="hint">Pick an art style to preview the result.</p>
		{/if}
	</div>
</NodeShell>

<style>
	.preview {
		position: relative;
		/* Fills the node's fixed width (set on .svelte-flow__node-output); a wide
		   fractal frames inside the landscape box, and the canvas (absolute, below)
		   can't feed its hi-DPR drawing-buffer size back into layout. */
		width: 100%;
		aspect-ratio: 16 / 10;
		border-radius: var(--ff-radius-md);
		overflow: hidden;
		background: var(--ff-bg);
	}
	/* Lock the GPU canvas to the fixed preview box. */
	.preview :global(.gpu) {
		position: absolute;
		inset: 0;
	}
	.hint {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		padding: var(--ff-space-3);
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		text-align: center;
	}
</style>
