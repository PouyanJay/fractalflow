<script lang="ts">
	import { ImageDown } from '@lucide/svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { mandelbrotRenderer } from '$lib/fractals/deep-zoom-2d/renderer';
	import { FORMULAS } from '$lib/fractals/deep-zoom-2d/reference';
	import { EXPORT_SIZES, captureScene, downloadBlob, exportFilename } from '$lib/engine/capture';

	const sceneStore = getSceneStore();

	let sizeId = $state('fhd');
	let busy = $state(false);
	let failed = $state(false);

	const size = $derived(EXPORT_SIZES.find((s) => s.id === sizeId) ?? EXPORT_SIZES[1]);
	const formulaLabel = $derived(
		FORMULAS.find((f) => f.id === sceneStore.formula)?.label ?? sceneStore.formula
	);
	const zoom = $derived.by(() => {
		const mag = 3 / sceneStore.camera.scale;
		if (mag >= 1000) return `${mag.toExponential(1)}×`;
		if (mag >= 10) return `${Math.round(mag)}×`;
		return `${mag.toFixed(1)}×`;
	});

	async function exportPng() {
		busy = true;
		failed = false;
		try {
			const blob = await captureScene(
				mandelbrotRenderer,
				sceneStore.scene,
				size.width,
				size.height
			);
			if (!blob) {
				failed = true;
				return;
			}
			downloadBlob(blob, exportFilename(sceneStore.formula));
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}
</script>

<section class="render" aria-label="Render workspace">
	<div class="card">
		<div class="icon" aria-hidden="true"><ImageDown size={26} /></div>
		<h1>Render</h1>
		<p class="blurb">Export your current view as a high-resolution PNG.</p>

		<dl class="summary">
			<div>
				<dt>Fractal</dt>
				<dd>{formulaLabel}</dd>
			</div>
			<div>
				<dt>Zoom</dt>
				<dd class="ff-num">{zoom}</dd>
			</div>
			<div>
				<dt>Iterations</dt>
				<dd class="ff-num">{sceneStore.maxIter}</dd>
			</div>
		</dl>

		<label class="field">
			<span class="field-label">Resolution</span>
			<select bind:value={sizeId} aria-label="Export resolution">
				{#each EXPORT_SIZES as s (s.id)}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</label>

		<button class="export" type="button" onclick={exportPng} disabled={busy}>
			<ImageDown size={16} aria-hidden="true" />
			{busy ? 'Rendering…' : 'Export PNG'}
		</button>

		{#if failed}
			<p class="error" role="alert">Export failed — this browser may not support WebGL2.</p>
		{/if}
	</div>
</section>

<style>
	.render {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--ff-space-8);
		background: radial-gradient(circle at 50% 40%, var(--ff-neutral-1), var(--ff-bg) 70%);
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--ff-space-3);
		width: 320px;
		max-width: 100%;
		padding: var(--ff-space-6);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-lg);
		background: var(--ff-surface);
		text-align: center;
	}
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-lg);
		background: var(--ff-surface-raised);
		color: var(--ff-accent);
	}
	h1 {
		font-size: var(--ff-text-xl);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.blurb {
		font-size: var(--ff-text-md);
		color: var(--ff-text-secondary);
		line-height: var(--ff-leading-normal);
	}
	.summary {
		display: flex;
		gap: var(--ff-space-5);
		margin: var(--ff-space-2) 0;
	}
	.summary div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.summary dt {
		font-size: var(--ff-text-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ff-text-muted);
	}
	.summary dd {
		margin: 0;
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-medium);
		color: var(--ff-text);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-2);
		width: 100%;
		text-align: left;
	}
	.field-label {
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ff-text-muted);
	}
	select {
		width: 100%;
		height: 34px;
		padding: 0 var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		font: inherit;
		cursor: pointer;
	}
	.export {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--ff-space-2);
		width: 100%;
		height: 38px;
		margin-top: var(--ff-space-2);
		border: none;
		border-radius: var(--ff-radius-md);
		background: var(--ff-accent);
		color: var(--ff-accent-contrast);
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-semibold);
		cursor: pointer;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.export:hover:not(:disabled) {
		background: var(--ff-primary-strong);
	}
	.export:disabled {
		opacity: 0.7;
		cursor: default;
	}
	.error {
		font-size: var(--ff-text-sm);
		color: var(--ff-danger);
	}
</style>
