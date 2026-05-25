<script lang="ts">
	import GpuCanvas from '$lib/components/engine/GpuCanvas.svelte';
	import { getEngineStore } from '$lib/stores/engine.svelte';

	const engine = getEngineStore();
</script>

<GpuCanvas onbackend={(type) => engine.setBackend(type)} />
