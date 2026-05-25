<script lang="ts">
	import GpuCanvas from '$lib/components/engine/GpuCanvas.svelte';
	import { getEngineStore } from '$lib/stores/engine.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { mandelbrotRenderer } from '$lib/fractals/deep-zoom-2d/renderer';
	import { panCamera, zoomCameraAt } from '$lib/engine/camera';

	const engine = getEngineStore();
	const sceneStore = getSceneStore();

	let stage = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	function onpointerdown(event: PointerEvent) {
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onpointermove(event: PointerEvent) {
		if (!dragging || !stage) return;
		const { height } = stage.getBoundingClientRect();
		sceneStore.setCamera(panCamera(sceneStore.camera, event.movementX, event.movementY, height));
	}

	function onpointerup(event: PointerEvent) {
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}

	function onwheel(event: WheelEvent) {
		if (!stage) return;
		const rect = stage.getBoundingClientRect();
		const factor = event.deltaY > 0 ? 1.1 : 1 / 1.1;
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

<div
	class="stage"
	class:dragging
	bind:this={stage}
	role="application"
	aria-label="Mandelbrot viewport — drag to pan, scroll to zoom"
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onwheel}
>
	<GpuCanvas
		renderer={mandelbrotRenderer}
		getScene={() => sceneStore.scene}
		onbackend={(type) => engine.setBackend(type)}
	/>
</div>

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
</style>
