<script module lang="ts">
	// Hold the startup splash for at least this long so it reads as an intentional
	// "loading the studio" moment rather than a flash. Applied once per page load
	// (the flag below), so switching art styles or panels doesn't re-trigger it.
	const MIN_SPLASH_MS = 5000;
	let initialLoadShown = false;
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { createEngine, type Engine } from '$lib/engine/engine';
	import type { BackendType, FractalRenderer, SceneState } from '$lib/engine/types';
	import { SPIRAL_PETAL } from '$lib/components/brand';

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
	// False until the engine has drawn its first frame — gates the loading overlay
	// so the blank canvas during backend init / first render reads as "loading".
	let ready = $state(false);

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

		// Hold the very first load on the splash for a beat; later (re)inits clear
		// as soon as the first frame paints.
		const enforceMinSplash = !initialLoadShown;
		const mountAt = performance.now();
		let splashTimer: ReturnType<typeof setTimeout> | undefined;

		const opts = untrack(() => ({
			getScene,
			prefer,
			onBackend: onbackend,
			onFirstFrame: () => {
				if (!enforceMinSplash) {
					ready = true;
					return;
				}
				initialLoadShown = true;
				const wait = Math.max(0, MIN_SPLASH_MS - (performance.now() - mountAt));
				splashTimer = setTimeout(() => (ready = true), wait);
			}
		}));
		failed = false;
		ready = false;
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
			clearTimeout(splashTimer);
			lifecycle = lifecycle.then(() => engine?.destroy());
		};
	});
</script>

<div class="gpu">
	<canvas bind:this={canvas} aria-label="Fractal viewport" data-testid="fractal-viewport"></canvas>
	{#if !ready && !failed && !needsWebGPU}
		<div class="loading" role="status" aria-live="polite" data-testid="viewport-loading">
			<svg class="loading-mark" viewBox="0 0 24 24" aria-hidden="true">
				<g fill="currentColor">
					<path d={SPIRAL_PETAL} />
					<path d={SPIRAL_PETAL} transform="rotate(120 12 12)" />
					<path d={SPIRAL_PETAL} transform="rotate(240 12 12)" />
				</g>
			</svg>
			<p class="loading-label">Initializing renderer…</p>
		</div>
	{/if}
	{#if needsWebGPU}
		<div class="error" role="alert">
			<p class="error-title">This art style needs WebGPU</p>
			<p class="error-body">
				This art style renders on the GPU compute pipeline, which your browser doesn't expose. Try a
				recent Chrome, Edge, or Safari — or pick Deep-Zoom 2D or Geometric 3D, which run on WebGL2.
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
		min-height: 0;
		display: flex;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		/* The drawing-buffer size must not contribute to layout (hi-DPR feedback). */
		min-width: 0;
		min-height: 0;
	}
	.loading {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--ff-space-5);
		background: var(--ff-bg);
	}
	.loading-mark {
		width: clamp(96px, 18vmin, 168px);
		height: clamp(96px, 18vmin, 168px);
		color: var(--ff-accent);
		transform-origin: 50% 50%;
		animation: ff-spin 1.6s linear infinite;
	}
	.loading-label {
		font-size: var(--ff-text-lg);
		font-weight: var(--ff-weight-medium);
		color: var(--ff-text-muted);
		letter-spacing: 0.04em;
	}
	@keyframes ff-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.loading-mark {
			animation: none;
		}
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
