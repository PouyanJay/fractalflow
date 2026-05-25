<script lang="ts">
	import GpuCanvas from '$lib/components/engine/GpuCanvas.svelte';
	import { getEngineStore } from '$lib/stores/engine.svelte';
	import { mandelbrotRenderer, createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';

	const engine = getEngineStore();
	// Static default view for now; interaction (pan/zoom) and Inspector controls
	// arrive in the next sub-step.
	const scene = createDefaultScene();
</script>

<GpuCanvas
	renderer={mandelbrotRenderer}
	getScene={() => scene}
	onbackend={(type) => engine.setBackend(type)}
/>
