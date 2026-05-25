<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { sourceLabel } from '$lib/compose/graph';
	import { FORMULAS } from '$lib/fractals/deep-zoom-2d/reference';
	import { ATTRACTORS } from '$lib/fractals/glowing-attractors/attractors';
	import { FLAMES } from '$lib/fractals/painterly-flames/flames';
	import type { FormulaId } from '$lib/engine/types';

	const ui = getUiStore();
	const scene = getSceneStore();
	const style = $derived(ui.selectedStyle);
</script>

<NodeShell title={sourceLabel(style)} source>
	{#if style === 'deep-zoom-2d'}
		<label class="field">
			<span>Formula</span>
			<select
				class="select nodrag"
				aria-label="Formula"
				value={scene.formula}
				onchange={(e) => scene.setFormula(e.currentTarget.value as FormulaId)}
			>
				{#each FORMULAS as f (f.id)}
					<option value={f.id}>{f.label}</option>
				{/each}
			</select>
		</label>
	{:else if style === 'attractors'}
		<label class="field">
			<span>Attractor</span>
			<select
				class="select nodrag"
				aria-label="Attractor family"
				value={scene.attractor}
				onchange={(e) => scene.setAttractor(e.currentTarget.value)}
			>
				{#each ATTRACTORS as a (a.id)}
					<option value={a.id}>{a.label}</option>
				{/each}
			</select>
		</label>
	{:else if style === 'flames'}
		<label class="field">
			<span>Flame</span>
			<select
				class="select nodrag"
				aria-label="Flame"
				value={scene.flame}
				onchange={(e) => scene.setFlame(e.currentTarget.value)}
			>
				{#each FLAMES as fl (fl.id)}
					<option value={fl.id}>{fl.label}</option>
				{/each}
			</select>
		</label>
	{:else}
		<p class="hint">Raymarched Mandelbulb — orbit and zoom in Explore.</p>
	{/if}
</NodeShell>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
	}
	.select {
		height: 30px;
		padding: 0 var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		font: inherit;
		cursor: pointer;
	}
	.hint {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		max-width: 180px;
		line-height: var(--ff-leading-tight);
	}
</style>
