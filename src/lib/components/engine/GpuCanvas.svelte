<script lang="ts">
	import { onMount } from 'svelte';
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

	onMount(() => {
		if (!canvas) return;
		let engine: Engine | null = null;
		let disposed = false;

		createEngine(canvas, { renderer, getScene, prefer, onBackend: onbackend })
			.then((created) => {
				if (!created) {
					failed = true;
					return;
				}
				if (disposed) {
					created.destroy();
					return;
				}
				engine = created;
				engine.start();
			})
			.catch(() => {
				failed = true;
			});

		return () => {
			disposed = true;
			engine?.destroy();
		};
	});
</script>

<div class="gpu">
	<canvas bind:this={canvas} aria-label="Fractal viewport" data-testid="fractal-viewport"></canvas>
	{#if failed}
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
