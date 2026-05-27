<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { PALETTES, paletteCssGradient } from '$lib/fractals/palette';

	const ui = getUiStore();
	const scene = getSceneStore();

	const detailLabel = $derived(
		ui.selectedStyle === 'deep-zoom-2d'
			? 'Iterations'
			: ui.selectedStyle === 'attractors' || ui.selectedStyle === 'flames'
				? 'Exposure'
				: 'Detail'
	);
	// Deep zoom needs far more iterations (escape times climb with depth); the
	// other styles keep the original exposure/detail range.
	const detailMax = $derived(ui.selectedStyle === 'deep-zoom-2d' ? 8000 : 1200);
</script>

<NodeShell title="Coloring" target source>
	<div class="field">
		<span>Palette</span>
		<div class="palettes">
			{#each PALETTES as p, i (p.id)}
				<button
					type="button"
					class="swatch nodrag"
					class:active={scene.paletteIndex === i}
					style="background: {paletteCssGradient(p.coeffs)}"
					onclick={() => scene.setPaletteIndex(i)}
					aria-label={p.label}
					aria-pressed={scene.paletteIndex === i}
					title={p.label}
				></button>
			{/each}
		</div>
	</div>

	<label class="field">
		<span>{detailLabel}</span>
		<div class="row">
			<input
				class="nodrag"
				type="range"
				min="1"
				max={detailMax}
				step="1"
				value={scene.maxIter}
				oninput={(e) => scene.setMaxIter(Number(e.currentTarget.value))}
				aria-label={detailLabel}
			/>
			<span class="ff-num val">{scene.maxIter}</span>
		</div>
	</label>
</NodeShell>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-2);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
	}
	.palettes {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--ff-space-2);
		width: 180px;
	}
	.swatch {
		height: 26px;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		cursor: pointer;
		padding: 0;
	}
	.swatch.active {
		border-color: var(--ff-accent);
		box-shadow: 0 0 0 1px var(--ff-accent);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
	}
	input[type='range'] {
		flex: 1;
		accent-color: var(--ff-accent);
	}
	.val {
		min-width: 34px;
		text-align: right;
		color: var(--ff-text-secondary);
	}
</style>
