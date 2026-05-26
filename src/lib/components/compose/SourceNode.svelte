<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import Select from '$lib/components/ui/Select.svelte';
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

	const toOptions = (items: readonly { id: string; label: string }[]) =>
		items.map((i) => ({ value: i.id, label: i.label }));
</script>

<NodeShell title={sourceLabel(style)} source>
	{#if style === 'deep-zoom-2d'}
		<label class="field">
			<span>Formula</span>
			<Select
				ariaLabel="Formula"
				options={toOptions(FORMULAS)}
				value={scene.formula}
				onchange={(v) => scene.setFormula(v as FormulaId)}
			/>
		</label>
		{#if scene.formula === 'julia'}
			<div class="field">
				<span>Julia seed</span>
				<div class="seeds">
					<label class="seed">
						<span class="seed-label">Re</span>
						<input
							class="nodrag"
							type="number"
							step="0.01"
							value={scene.juliaSeed.x}
							oninput={(e) => scene.setJuliaSeed(Number(e.currentTarget.value), scene.juliaSeed.y)}
							aria-label="Julia seed real part"
						/>
					</label>
					<label class="seed">
						<span class="seed-label">Im</span>
						<input
							class="nodrag"
							type="number"
							step="0.01"
							value={scene.juliaSeed.y}
							oninput={(e) => scene.setJuliaSeed(scene.juliaSeed.x, Number(e.currentTarget.value))}
							aria-label="Julia seed imaginary part"
						/>
					</label>
				</div>
			</div>
		{/if}
	{:else if style === 'attractors'}
		<label class="field">
			<span>Attractor</span>
			<Select
				ariaLabel="Attractor family"
				options={toOptions(ATTRACTORS)}
				value={scene.attractor}
				onchange={(v) => scene.setAttractor(v)}
			/>
		</label>
	{:else if style === 'flames'}
		<label class="field">
			<span>Flame</span>
			<Select
				ariaLabel="Flame"
				options={toOptions(FLAMES)}
				value={scene.flame}
				onchange={(v) => scene.setFlame(v)}
			/>
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
	.seeds {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ff-space-2);
	}
	.seed {
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
		min-width: 0;
	}
	.seed-label {
		flex: none;
	}
	.seed input {
		flex: 1;
		min-width: 0;
		width: 100%;
		padding: 4px 6px;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		font: inherit;
		font-variant-numeric: tabular-nums;
	}
	.hint {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		max-width: 180px;
		line-height: var(--ff-leading-tight);
	}
</style>
