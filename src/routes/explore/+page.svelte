<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import GpuCanvas from '$lib/components/engine/GpuCanvas.svelte';
	import { getEngineStore } from '$lib/stores/engine.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { getRenderer } from '$lib/fractals/registry';
	import { panCamera, zoomCameraAt, orbitCamera, dollyCamera } from '$lib/engine/camera';
	import { encodeScene, decodeScene } from '$lib/scene/codec';
	import type { BackendType } from '$lib/engine/types';

	const engine = getEngineStore();
	const sceneStore = getSceneStore();
	const ui = getUiStore();

	const activeRenderer = $derived(getRenderer(ui.selectedStyle));
	const comingSoonLabel = $derived(
		ART_STYLES.find((s) => s.id === ui.selectedStyle)?.label ?? 'This art style'
	);

	// Stable callbacks so GpuCanvas doesn't recreate the engine spuriously.
	const getScene = () => sceneStore.scene;
	const handleBackend = (type: BackendType) => engine.setBackend(type);

	function defaultCameraFor(kind: '2d' | '3d') {
		return kind === '3d'
			? { centerX: 0.7, centerY: 0.4, scale: 2.6 }
			: { centerX: -0.5, centerY: 0, scale: 3 };
	}

	// When switching between 2D and 3D, reset to a camera that frames that renderer.
	let previousKind: '2d' | '3d' | undefined;
	$effect(() => {
		const kind = activeRenderer?.kind;
		if (!kind) return;
		if (previousKind !== undefined && previousKind !== kind) {
			sceneStore.setCamera(defaultCameraFor(kind));
		}
		previousKind = kind;
	});

	let hydrated = $state(false);
	let urlTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		const token = page.url.searchParams.get('s');
		if (token) sceneStore.setScene(decodeScene(token));
		hydrated = true;
	});

	$effect(() => {
		const token = encodeScene(sceneStore.scene);
		if (!hydrated) return;
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const url = new URL(window.location.href);
			url.searchParams.set('s', token);
			history.replaceState(history.state, '', url);
		}, 250);
	});

	onDestroy(() => clearTimeout(urlTimer));

	let stage = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	function onpointerdown(event: PointerEvent) {
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onpointermove(event: PointerEvent) {
		if (!dragging || !stage) return;
		if (activeRenderer?.kind === '3d') {
			sceneStore.setCamera(orbitCamera(sceneStore.camera, event.movementX, event.movementY));
			return;
		}
		const { height } = stage.getBoundingClientRect();
		sceneStore.setCamera(panCamera(sceneStore.camera, event.movementX, event.movementY, height));
	}

	function onpointerup(event: PointerEvent) {
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}

	function onwheel(event: WheelEvent) {
		if (!stage) return;
		const factor = event.deltaY > 0 ? 1.1 : 1 / 1.1;
		if (activeRenderer?.kind === '3d') {
			sceneStore.setCamera(dollyCamera(sceneStore.camera, factor));
			return;
		}
		const rect = stage.getBoundingClientRect();
		sceneStore.setCamera(
			zoomCameraAt(
				sceneStore.camera,
				event.clientX - rect.left,
				event.clientY - rect.top,
				rect.width,
				rect.height,
				factor
			)
		);
	}
</script>

{#if activeRenderer}
	<div
		class="stage"
		class:dragging
		bind:this={stage}
		role="application"
		aria-label="Fractal viewport — drag to pan, scroll to zoom"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		{onwheel}
	>
		<GpuCanvas renderer={activeRenderer} {getScene} onbackend={handleBackend} />
	</div>
{:else}
	<section class="coming-soon" aria-label="{comingSoonLabel} workspace">
		<div class="message">
			<h1>{comingSoonLabel}</h1>
			<p>
				This art style is coming soon. Pick <strong>Deep-Zoom 2D</strong> in the Library to explore now.
			</p>
		</div>
	</section>
{/if}

<style>
	.stage {
		flex: 1;
		min-width: 0;
		display: flex;
		cursor: grab;
		touch-action: none;
	}
	.stage.dragging {
		cursor: grabbing;
	}
	.coming-soon {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--ff-space-8);
		background: radial-gradient(circle at 50% 40%, var(--ff-neutral-1), var(--ff-bg) 70%);
	}
	.message {
		max-width: 360px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-2);
	}
	.message h1 {
		font-size: var(--ff-text-xl);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.message p {
		font-size: var(--ff-text-md);
		color: var(--ff-text-secondary);
		line-height: var(--ff-leading-normal);
	}
	.message strong {
		color: var(--ff-text);
		font-weight: var(--ff-weight-medium);
	}
</style>
