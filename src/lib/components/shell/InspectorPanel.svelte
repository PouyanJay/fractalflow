<script lang="ts">
	import SidePanel from './SidePanel.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { PALETTES, cosinePalette, type PaletteCoeffs } from '$lib/fractals/palette';
	import { FORMULAS } from '$lib/fractals/deep-zoom-2d/reference';
	import { getRenderer } from '$lib/fractals/registry';
	import type { FormulaId } from '$lib/engine/types';

	const ui = getUiStore();
	const scene = getSceneStore();

	const style = $derived(ART_STYLES.find((s) => s.id === ui.selectedStyle) ?? null);
	const hasRenderer = $derived(getRenderer(ui.selectedStyle) !== null);
	const isDeepZoom = $derived(ui.selectedStyle === 'deep-zoom-2d');

	function gradientFor(coeffs: PaletteCoeffs): string {
		const stops: string[] = [];
		for (let i = 0; i <= 6; i++) {
			const t = i / 6;
			const [r, g, b] = cosinePalette(coeffs, t);
			const c = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
			stops.push(`${c} ${Math.round(t * 100)}%`);
		}
		return `linear-gradient(90deg, ${stops.join(', ')})`;
	}
</script>

<SidePanel title="Inspector" panelId="inspector" side="right">
	{#if hasRenderer}
		<section class="group">
			<h3 class="group-label">Renderer</h3>
			<p class="value">{style?.label}</p>
			<p class="hint">{style?.blurb}</p>
		</section>

		{#if isDeepZoom}
			<section class="group">
				<h3 class="group-label">Formula</h3>
				<select
					class="select"
					aria-label="Formula"
					value={scene.formula}
					onchange={(e) => scene.setFormula(e.currentTarget.value as FormulaId)}
				>
					{#each FORMULAS as f (f.id)}
						<option value={f.id}>{f.label}</option>
					{/each}
				</select>
			</section>

			{#if scene.formula === 'julia'}
				<section class="group">
					<h3 class="group-label">Julia seed</h3>
					<div class="seeds">
						<label class="seed">
							<span class="seed-label">Re</span>
							<input
								type="number"
								step="0.01"
								value={scene.juliaSeed.x}
								oninput={(e) =>
									scene.setJuliaSeed(Number(e.currentTarget.value), scene.juliaSeed.y)}
								aria-label="Julia seed real part"
							/>
						</label>
						<label class="seed">
							<span class="seed-label">Im</span>
							<input
								type="number"
								step="0.01"
								value={scene.juliaSeed.y}
								oninput={(e) =>
									scene.setJuliaSeed(scene.juliaSeed.x, Number(e.currentTarget.value))}
								aria-label="Julia seed imaginary part"
							/>
						</label>
					</div>
				</section>
			{/if}
		{/if}

		<section class="group">
			<h3 class="group-label">{isDeepZoom ? 'Iterations' : 'Detail'}</h3>
			<div class="row">
				<input
					type="range"
					min="50"
					max="1200"
					step="10"
					value={scene.maxIter}
					oninput={(e) => scene.setMaxIter(Number(e.currentTarget.value))}
					aria-label="Maximum iterations"
				/>
				<span class="ff-num val">{scene.maxIter}</span>
			</div>
			<p class="hint">Higher values add more detail (slower).</p>
		</section>

		<section class="group">
			<h3 class="group-label">Palette</h3>
			<div class="palettes">
				{#each PALETTES as p, i (p.id)}
					<button
						type="button"
						class="swatch"
						class:active={scene.paletteIndex === i}
						style="background: {gradientFor(p.coeffs)}"
						onclick={() => scene.setPaletteIndex(i)}
						aria-label={p.label}
						aria-pressed={scene.paletteIndex === i}
						title={p.label}
					></button>
				{/each}
			</div>
		</section>

		<section class="group">
			<button type="button" class="reset" onclick={() => scene.reset()}>Reset view</button>
		</section>
	{:else if style}
		<section class="group">
			<h3 class="group-label">Renderer</h3>
			<p class="value">{style.label}</p>
			<p class="hint">{style.blurb}</p>
		</section>
		<section class="group">
			<p class="empty">This renderer arrives in a later phase. Pick Deep-Zoom 2D to explore now.</p>
		</section>
	{:else}
		<div class="placeholder">
			<p class="placeholder-title">No fractal selected</p>
			<p class="placeholder-body">
				Choose an art style in the Library to edit its parameters here.
			</p>
		</div>
	{/if}
</SidePanel>

<style>
	.group + .group {
		margin-top: var(--ff-space-5);
	}
	.group-label {
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ff-text-muted);
		margin-bottom: var(--ff-space-2);
	}
	.value {
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-medium);
		color: var(--ff-text);
	}
	.hint {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		margin-top: var(--ff-space-2);
		line-height: var(--ff-leading-tight);
	}
	.select {
		width: 100%;
		height: 32px;
		padding: 0 var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		font: inherit;
		cursor: pointer;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--ff-space-3);
	}
	.seeds {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ff-space-2);
	}
	.seed {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
		min-width: 0;
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
	}
	.seed-label {
		flex: none;
	}
	.seed input {
		flex: 1;
		min-width: 0;
		width: 100%;
		padding: 5px 6px;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		font: inherit;
		font-variant-numeric: tabular-nums;
	}
	input[type='range'] {
		flex: 1;
		accent-color: var(--ff-accent);
	}
	.val {
		min-width: 38px;
		text-align: right;
		color: var(--ff-text-secondary);
	}
	.palettes {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--ff-space-2);
	}
	.swatch {
		height: 28px;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		cursor: pointer;
		padding: 0;
	}
	.swatch.active {
		border-color: var(--ff-accent);
		box-shadow: 0 0 0 1px var(--ff-accent);
	}
	.reset {
		width: 100%;
		height: 32px;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		cursor: pointer;
	}
	.reset:hover {
		border-color: var(--ff-border-strong);
		color: var(--ff-text);
	}
	.empty {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
		padding: var(--ff-space-2) var(--ff-space-3);
		border: 1px dashed var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-2);
		padding: var(--ff-space-4) var(--ff-space-3);
		text-align: center;
		color: var(--ff-text-muted);
	}
	.placeholder-title {
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-medium);
		color: var(--ff-text-secondary);
	}
	.placeholder-body {
		font-size: var(--ff-text-sm);
		line-height: var(--ff-leading-normal);
	}
</style>
