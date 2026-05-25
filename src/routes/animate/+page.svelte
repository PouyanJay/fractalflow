<script lang="ts">
	import FractalStage from '$lib/components/engine/FractalStage.svelte';
	import TimelineDock from '$lib/components/animate/TimelineDock.svelte';
</script>

<div class="animate" aria-label="Animate workspace">
	<FractalStage />
	<TimelineDock />
</div>

<style>
	.animate {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
</style>
