<script lang="ts">
	import { ImageDown, Film } from '@lucide/svelte';
	import { zipSync } from 'fflate';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getTimelineStore } from '$lib/stores/timeline.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { getRenderer } from '$lib/fractals/registry';
	import {
		EXPORT_SIZES,
		captureScene,
		captureSequence,
		downloadBlob,
		exportFilename
	} from '$lib/engine/capture';
	import { sequenceScenes, frameCountFor, frameFilename } from '$lib/render/sequence';

	const sceneStore = getSceneStore();
	const ui = getUiStore();
	const timeline = getTimelineStore();

	/** Keep sequence exports bounded regardless of duration × fps. */
	const MAX_FRAMES = 300;

	let sizeId = $state('fhd');
	let busy = $state(false);
	let failed = $state(false);

	let fps = $state(24);
	let seqBusy = $state(false);
	let seqFailed = $state(false);
	let seqDone = $state(0);

	const size = $derived(EXPORT_SIZES.find((s) => s.id === sizeId) ?? EXPORT_SIZES[1]);
	const renderer = $derived(getRenderer(ui.selectedStyle));
	const frameCount = $derived(Math.min(MAX_FRAMES, frameCountFor(timeline.durationMs, fps)));
	const canSequence = $derived(timeline.keyframes.length >= 2 && !!renderer);
	const styleLabel = $derived(
		ART_STYLES.find((s) => s.id === ui.selectedStyle)?.label ?? 'Fractal'
	);
	const zoom = $derived.by(() => {
		const mag = 3 / sceneStore.camera.scale;
		if (mag >= 1000) return `${mag.toExponential(1)}×`;
		if (mag >= 10) return `${Math.round(mag)}×`;
		return `${mag.toFixed(1)}×`;
	});
	// A filename tag describing the active subject (style + its variant).
	const exportTag = $derived(
		ui.selectedStyle === 'deep-zoom-2d'
			? sceneStore.formula
			: ui.selectedStyle === 'attractors'
				? `attractor-${sceneStore.attractor}`
				: ui.selectedStyle === 'flames'
					? `flame-${sceneStore.flame}`
					: (ui.selectedStyle ?? 'fractal')
	);

	async function exportPng() {
		if (!renderer) return;
		busy = true;
		failed = false;
		try {
			const blob = await captureScene(renderer, sceneStore.scene, size.width, size.height);
			if (!blob) {
				failed = true;
				return;
			}
			downloadBlob(blob, exportFilename(exportTag));
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	async function exportSequence() {
		if (!renderer || !canSequence) return;
		seqBusy = true;
		seqFailed = false;
		seqDone = 0;
		try {
			const scenes = sequenceScenes(timeline.keyframes, frameCount);
			const blobs = await captureSequence(
				renderer,
				scenes,
				size.width,
				size.height,
				(done) => (seqDone = done)
			);
			if (!blobs) {
				seqFailed = true;
				return;
			}
			const files: Record<string, Uint8Array> = {};
			for (let i = 0; i < blobs.length; i++) {
				files[frameFilename(i, blobs.length)] = new Uint8Array(await blobs[i].arrayBuffer());
			}
			// PNGs are already compressed, so store (level 0) — fast, no extra CPU.
			const zip = zipSync(files, { level: 0 });
			const name = exportFilename(`${exportTag}-frames`).replace(/\.png$/, '.zip');
			downloadBlob(new Blob([zip], { type: 'application/zip' }), name);
		} catch {
			seqFailed = true;
		} finally {
			seqBusy = false;
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
				<dt>Art style</dt>
				<dd>{styleLabel}</dd>
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

		<button class="export" type="button" onclick={exportPng} disabled={busy || !renderer}>
			<ImageDown size={16} aria-hidden="true" />
			{busy ? 'Rendering…' : 'Export PNG'}
		</button>

		{#if !renderer}
			<p class="error" role="alert">Pick an art style in the Library to render.</p>
		{:else if failed}
			<p class="error" role="alert">
				Export failed — Painterly Flames and Glowing Attractors need WebGPU.
			</p>
		{/if}

		<hr class="divider" />

		<div class="anim-head">
			<Film size={16} aria-hidden="true" />
			<h2>Animation</h2>
		</div>

		{#if timeline.keyframes.length < 2}
			<p class="note">
				Add at least two keyframes in <strong>Animate</strong> to export a zoom movie as a frame sequence.
			</p>
		{:else}
			<label class="field">
				<span class="field-label">Frame rate</span>
				<select bind:value={fps} aria-label="Frame rate">
					<option value={12}>12 fps</option>
					<option value={24}>24 fps</option>
					<option value={30}>30 fps</option>
				</select>
			</label>
			<p class="note">
				{frameCount} frames at {size.width} × {size.height} ({(timeline.durationMs / 1000).toFixed(
					1
				)}s clip){frameCount === MAX_FRAMES ? ' · capped' : ''}
			</p>
			<button
				class="export secondary"
				type="button"
				onclick={exportSequence}
				disabled={seqBusy || !canSequence}
			>
				<Film size={16} aria-hidden="true" />
				{seqBusy ? `Rendering ${seqDone}/${frameCount}…` : 'Export frames (.zip)'}
			</button>
			{#if seqFailed}
				<p class="error" role="alert">Frame export failed — compute styles need WebGPU.</p>
			{/if}
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
	.divider {
		width: 100%;
		height: 1px;
		margin: var(--ff-space-3) 0 0;
		border: none;
		background: var(--ff-border);
	}
	.anim-head {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
		align-self: flex-start;
		color: var(--ff-text-secondary);
	}
	.anim-head h2 {
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.note {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
		text-align: left;
		align-self: flex-start;
	}
	.note strong {
		color: var(--ff-text-secondary);
		font-weight: var(--ff-weight-medium);
	}
	.export.secondary {
		background: var(--ff-surface-raised);
		color: var(--ff-text);
		border: 1px solid var(--ff-border-strong);
	}
	.export.secondary:hover:not(:disabled) {
		background: var(--ff-surface-hover);
	}
</style>
