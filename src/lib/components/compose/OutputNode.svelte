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
		width: 240px;
		height: 160px;
		display: flex;
		border-radius: var(--ff-radius-md);
		overflow: hidden;
		background: var(--ff-bg);
	}
	.hint {
		margin: auto;
		padding: var(--ff-space-3);
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		text-align: center;
	}
</style>
