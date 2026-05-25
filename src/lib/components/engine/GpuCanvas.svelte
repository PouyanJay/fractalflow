<script lang="ts">
	import { untrack } from 'svelte';
	import { createEngine, type Engine } from '$lib/engine/engine';
	import type { BackendType, FractalRenderer, SceneState } from '$lib/engine/types';

	interface Props {
		renderer: FractalRenderer;
		/** Pulled each frame so UI edits take effect live. */
		getScene: () => SceneState;
		prefer?: BackendType;
		/** Reports the backend the engine actually initialised with. */
		onbackend?: (type: BackendType) => void;
	}

	let { renderer, getScene, prefer, onbackend }: Props = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let failed = $state(false);

	// Compute-pipeline art styles are WebGPU-only; on a WebGL2-only browser the
	// engine can't initialise, so we explain that rather than claim "no GPU".
	const needsWebGPU = $derived(failed && renderer.pipeline === 'compute');

	// Serialize engine lifecycle across renderer changes. Engine creation and
	// teardown both (re)configure the shared canvas context, so they must not
	// overlap — otherwise a stale engine's teardown can unconfigure the context
	// the next engine is rendering into (getCurrentTexture: not configured).
	let lifecycle = Promise.resolve();

	// (Re)create the engine whenever the canvas mounts or the renderer changes.
	$effect(() => {
		const el = canvas;
		const activeRenderer = renderer;
		if (!el) return;

		const opts = untrack(() => ({ getScene, prefer, onBackend: onbackend }));
		failed = false;
		let engine: Engine | null = null;
		let disposed = false;

		// Chain after any in-flight create/destroy so they run strictly in order.
		lifecycle = lifecycle.then(async () => {
			if (disposed) return;
			try {
				const created = await createEngine(el, { renderer: activeRenderer, ...opts });
				if (disposed) {
					created?.destroy();
					return;
				}
				if (!created) {
					failed = true;
					return;
				}
				engine = created;
				engine.start();
			} catch {
				if (!disposed) failed = true;
			}
		});

		return () => {
			disposed = true;
			lifecycle = lifecycle.then(() => engine?.destroy());
		};
	});
</script>

<div class="gpu">
	<canvas bind:this={canvas} aria-label="Fractal viewport" data-testid="fractal-viewport"></canvas>
	{#if needsWebGPU}
		<div class="error" role="alert">
			<p class="error-title">This art style needs WebGPU</p>
			<p class="error-body">
				Glowing Attractors renders on the GPU compute pipeline, which your browser doesn't expose.
				Try a recent Chrome, Edge, or Safari — or pick Deep-Zoom 2D, which runs on WebGL2.
			</p>
		</div>
	{:else if failed}
		<div class="error" role="alert">
			<p class="error-title">GPU unavailable</p>
			<p class="error-body">
				This device supports neither WebGPU nor WebGL2. Try a recent desktop browser.
			</p>
		</div>
	{/if}
</div>

<style>
	.gpu {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	.error {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--ff-space-2);
		text-align: center;
		padding: var(--ff-space-6);
		background: var(--ff-bg);
	}
	.error-title {
		font-size: var(--ff-text-lg);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.error-body {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		max-width: 320px;
		line-height: var(--ff-leading-normal);
	}
</style>
