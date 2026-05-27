<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { sourceLabel } from '$lib/compose/graph';
	import { FORMULAS } from '$lib/fractals/deep-zoom-2d/reference';
	import { ATTRACTORS } from '$lib/fractals/glowing-attractors/attractors';
	import { FLAMES } from '$lib/fractals/painterly-flames/flames';
	import { GEOMETRIC_SHAPES } from '$lib/fractals/geometric-3d/renderer';
	import type { FormulaId, GeometricShapeId } from '$lib/engine/types';

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
		{#if scene.formula === 'julia' || scene.formula === 'phoenix'}
			{@const phoenix = scene.formula === 'phoenix'}
			<div class="field">
				<span>{phoenix ? 'Constant & coupling' : 'Julia seed'}</span>
				<div class="seeds">
					<label class="seed">
						<span class="seed-label">{phoenix ? 'c' : 'Re'}</span>
						<input
							class="nodrag"
							type="number"
							step="0.01"
							value={scene.juliaSeed.x}
							oninput={(e) => scene.setJuliaSeed(Number(e.currentTarget.value), scene.juliaSeed.y)}
							aria-label={phoenix ? 'Phoenix constant c' : 'Julia seed real part'}
						/>
					</label>
					<label class="seed">
						<span class="seed-label">{phoenix ? 'p' : 'Im'}</span>
						<input
							class="nodrag"
							type="number"
							step="0.01"
							value={scene.juliaSeed.y}
							oninput={(e) => scene.setJuliaSeed(scene.juliaSeed.x, Number(e.currentTarget.value))}
							aria-label={phoenix ? 'Phoenix coupling p' : 'Julia seed imaginary part'}
						/>
					</label>
				</div>
			</div>
		{/if}
		{#if scene.formula === 'multibrot'}
			<label class="field">
				<span>Power (d)</span>
				<div class="power">
					<input
						class="nodrag"
						type="range"
						min="2"
						max="8"
						step="0.1"
						value={scene.power}
						oninput={(e) => scene.setPower(Number(e.currentTarget.value))}
						aria-label="Multibrot power"
					/>
					<span class="ff-num val">{scene.power.toFixed(1)}</span>
				</div>
			</label>
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
		<label class="field">
			<span>Shape</span>
			<Select
				ariaLabel="3D shape"
				options={toOptions(GEOMETRIC_SHAPES)}
				value={scene.geometricShape}
				onchange={(v) => scene.setGeometricShape(v as GeometricShapeId)}
			/>
		</label>
		<p class="hint">Raymarched 3D fractal — orbit and zoom in Explore.</p>
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
	.power {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
	}
	.power input[type='range'] {
		flex: 1;
		min-width: 0;
		accent-color: var(--ff-accent);
	}
	.power .val {
		min-width: 28px;
		text-align: right;
		color: var(--ff-text-secondary);
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
