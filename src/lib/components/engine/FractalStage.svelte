<script lang="ts">
	/**
	 * The interactive fractal viewport: the live GPU canvas plus pan/zoom (2D) or
	 * orbit/dolly (3D) over the shared scene. Reads stores from context so it can
	 * be dropped into any mode (Explore, Animate). Shows a coming-soon state when
	 * the selected art style has no renderer.
	 */
	import GpuCanvas from '$lib/components/engine/GpuCanvas.svelte';
	import { getEngineStore } from '$lib/stores/engine.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { getRenderer } from '$lib/fractals/registry';
	import { panCamera, zoomCameraAt, orbitCamera, dollyCamera } from '$lib/engine/camera';
	import type { BackendType } from '$lib/engine/types';

	const engine = getEngineStore();
	const sceneStore = getSceneStore();
	const ui = getUiStore();

	const activeRenderer = $derived(getRenderer(ui.selectedStyle));
	const comingSoonLabel = $derived(
		ART_STYLES.find((s) => s.id === ui.selectedStyle)?.label ?? 'This art style'
	);

	const getScene = () => sceneStore.scene;
	const handleBackend = (type: BackendType) => engine.setBackend(type);

	let stage = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);

	// Active pointers (mouse / touch / pen) keyed by id, in client coordinates.
	// One pointer pans (orbits in 3D); two pointers pinch-zoom (dolly in 3D) — the
	// touch equivalent of the mouse wheel, which touch devices never emit.
	// A plain Map by design: pure gesture bookkeeping, never rendered, and mutated
	// on every pointermove — reactivity (SvelteMap) is unwanted overhead here.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDist = 0;
	// Down-state + last tap, for double-tap / double-click to zoom in.
	let downX = 0;
	let downY = 0;
	let downTime = 0;
	let lastTapTime = 0;
	let lastTapX = 0;
	let lastTapY = 0;

	function pinchDistance(): number {
		const [a, b] = [...pointers.values()];
		return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
	}
	function pinchMid(): { x: number; y: number } {
		const [a, b] = [...pointers.values()];
		return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
	}

	/** Zoom about a client point — anchored zoom in 2D, dolly in 3D. */
	function zoomAt(clientX: number, clientY: number, factor: number) {
		if (!stage) return;
		if (activeRenderer?.kind === '3d') {
			sceneStore.setCamera(dollyCamera(sceneStore.camera, factor));
			return;
		}
		const rect = stage.getBoundingClientRect();
		sceneStore.setCamera(
			zoomCameraAt(
				sceneStore.camera,
				clientX - rect.left,
				clientY - rect.top,
				rect.width,
				rect.height,
				factor
			)
		);
	}

	function onpointerdown(event: PointerEvent) {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		dragging = pointers.size > 0;
		if (pointers.size === 2) pinchDist = pinchDistance();
		downX = event.clientX;
		downY = event.clientY;
		downTime = event.timeStamp;
	}

	function onpointermove(event: PointerEvent) {
		const prev = pointers.get(event.pointerId);
		if (!prev || !stage) return;

		// Two fingers → pinch-zoom about the midpoint, panning by its drift.
		if (pointers.size >= 2) {
			const prevMid = pinchMid();
			pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			const dist = pinchDistance();
			const mid = pinchMid();
			if (pinchDist > 0 && dist > 0) {
				zoomAt(mid.x, mid.y, pinchDist / dist); // spread → factor < 1 → zoom in
				if (activeRenderer?.kind !== '3d') {
					const { height } = stage.getBoundingClientRect();
					sceneStore.setCamera(
						panCamera(sceneStore.camera, mid.x - prevMid.x, mid.y - prevMid.y, height)
					);
				}
			}
			pinchDist = dist;
			return;
		}

		// One finger → pan (orbit in 3D). Delta from the pointer's own last point,
		// so lifting the second finger never causes a jump.
		const dx = event.clientX - prev.x;
		const dy = event.clientY - prev.y;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (activeRenderer?.kind === '3d') {
			sceneStore.setCamera(orbitCamera(sceneStore.camera, dx, dy));
			return;
		}
		const { height } = stage.getBoundingClientRect();
		sceneStore.setCamera(panCamera(sceneStore.camera, dx, dy, height));
	}

	function endPointer(event: PointerEvent) {
		(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		pointers.delete(event.pointerId);
		if (pointers.size < 2) pinchDist = 0;
		dragging = pointers.size > 0;
	}

	function onpointerup(event: PointerEvent) {
		const moved = Math.hypot(event.clientX - downX, event.clientY - downY);
		const tap = event.timeStamp - downTime < 250 && moved < 8;
		endPointer(event);
		if (!tap || pointers.size > 0) return;
		// A second clean tap near the first, soon after → zoom in at that point.
		const near = Math.hypot(event.clientX - lastTapX, event.clientY - lastTapY) < 32;
		if (event.timeStamp - lastTapTime < 300 && near) {
			zoomAt(event.clientX, event.clientY, 1 / 1.8);
			lastTapTime = 0;
		} else {
			lastTapTime = event.timeStamp;
			lastTapX = event.clientX;
			lastTapY = event.clientY;
		}
	}

	function onwheel(event: WheelEvent) {
		zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1.1 : 1 / 1.1);
	}
</script>

{#if activeRenderer}
	<div
		class="stage"
		class:dragging
		bind:this={stage}
		role="application"
		aria-label="Fractal viewport — drag to pan, pinch or scroll to zoom, double-tap to zoom in"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={endPointer}
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
		/* Both min-* are 0 so the flex item shrinks to its allocated box instead
		 * of the canvas's intrinsic (drawing-buffer) size. Without min-height: 0
		 * the canvas height feeds back through the ResizeObserver and grows the
		 * stage on hi-DPR screens, pushing siblings (the Animate dock) off-screen. */
		min-width: 0;
		min-height: 0;
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
