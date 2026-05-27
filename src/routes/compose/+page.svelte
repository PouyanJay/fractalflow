<script lang="ts">
	import { SvelteFlow, Background, Controls, type NodeTypes } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import { composeNodes, composeEdges } from '$lib/compose/graph';
	import SourceNode from '$lib/components/compose/SourceNode.svelte';
	import WarpNode from '$lib/components/compose/WarpNode.svelte';
	import ColoringNode from '$lib/components/compose/ColoringNode.svelte';
	import PostNode from '$lib/components/compose/PostNode.svelte';
	import OutputNode from '$lib/components/compose/OutputNode.svelte';
	import LayersPanel from '$lib/components/compose/LayersPanel.svelte';

	// Fixed pipeline; nodes read/write the shared scene store, so editing here
	// updates every other mode's view of the same scene.
	let nodes = $state.raw(composeNodes());
	let edges = $state.raw(composeEdges());

	// These nodes read/write the shared scene store via context and ignore the
	// per-node `data` props, so we register them with a cast.
	const nodeTypes = {
		source: SourceNode,
		warp: WarpNode,
		coloring: ColoringNode,
		post: PostNode,
		output: OutputNode
	} as unknown as NodeTypes;
</script>

<section class="compose" aria-label="Compose workspace">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		colorMode="dark"
		fitView
		minZoom={0.4}
		maxZoom={1.5}
		proOptions={{ hideAttribution: true }}
	>
		<Background gap={28} />
		<Controls showLock={false} />
	</SvelteFlow>
	<LayersPanel />
</section>

<style>
	.compose {
		flex: 1;
		min-width: 0;
		display: flex;
		position: relative; /* anchor the floating Layers panel */
	}
	.compose :global(.svelte-flow) {
		width: 100%;
		height: 100%;
		/* Match the studio's dark stage rather than Svelte Flow's default. */
		background: var(--ff-bg);
	}
	.compose :global(.svelte-flow__handle) {
		width: 9px;
		height: 9px;
		background: var(--ff-accent);
		border: none;
	}
	.compose :global(.svelte-flow__edge-path) {
		stroke: var(--ff-border-strong);
	}
	/* The Output node's preview canvas is absolutely positioned, so it can't size
	   the node itself — give the node a definite width and let the preview fill it. */
	.compose :global(.svelte-flow__node-output) {
		width: 300px;
	}
</style>
