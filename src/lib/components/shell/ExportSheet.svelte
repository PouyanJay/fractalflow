<script lang="ts">
	import { tick } from 'svelte';
	import { ImageDown, Film, X } from '@lucide/svelte';
	import { zipSync } from 'fflate';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getJourneyStore } from '$lib/stores/journey.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { getRenderer } from '$lib/fractals/registry';
	import { formatZoom } from '$lib/engine/camera';
	import { JOURNEYS, journeyKeyframes } from '$lib/animate/journey';
	import { sequenceScenes, frameCountFor, frameFilename } from '$lib/render/sequence';
	import {
		EXPORT_SIZES,
		captureScene,
		captureSequence,
		downloadBlob,
		exportFilename,
		exportTagFor
	} from '$lib/engine/capture';

	const ui = getUiStore();
	const scene = getSceneStore();
	const journey = getJourneyStore();

	/** Keep movie exports bounded regardless of duration × fps. */
	const MAX_FRAMES = 300;

	let mode = $state<'still' | 'movie'>('still');
	let sizeId = $state('fhd');

	let busy = $state(false);
	let failed = $state(false);
	let saved = $state(false);

	let fps = $state(24);
	let seqBusy = $state(false);
	let seqFailed = $state(false);
	let seqDone = $state(0);
	let seqSaved = $state(false);

	const size = $derived(EXPORT_SIZES.find((s) => s.id === sizeId) ?? EXPORT_SIZES[1]);
	const renderer = $derived(getRenderer(ui.selectedStyle));
	const styleLabel = $derived(
		ART_STYLES.find((s) => s.id === ui.selectedStyle)?.label ?? 'Fractal'
	);
	const exportTag = $derived(
		exportTagFor(ui.selectedStyle, {
			formula: scene.formula,
			attractor: scene.attractor,
			flame: scene.flame
		})
	);
	const zoom = $derived(formatZoom(scene.camera.scale));
	const frameCount = $derived(Math.min(MAX_FRAMES, frameCountFor(journey.durationMs, fps)));

	let firstControl = $state<HTMLSelectElement | null>(null);
	let restoreTo: HTMLElement | null = null;

	// Move focus into the sheet on open and back to the trigger on close.
	$effect(() => {
		if (ui.exportOpen) {
			restoreTo = (document.activeElement as HTMLElement) ?? null;
			mode = 'still';
			failed = false;
			saved = false;
			seqFailed = false;
			seqSaved = false;
			tick().then(() => firstControl?.focus());
		} else if (restoreTo) {
			restoreTo.focus();
			restoreTo = null;
		}
	});

	function onkeydown(event: KeyboardEvent) {
		if (ui.exportOpen && event.key === 'Escape') {
			event.preventDefault();
			ui.closeExport();
		}
	}

	async function exportPng() {
		if (!renderer || busy) return;
		busy = true;
		failed = false;
		saved = false;
		try {
			const blob = await captureScene(renderer, scene.scene, size.width, size.height);
			if (!blob) {
				failed = true;
				return;
			}
			downloadBlob(blob, exportFilename(exportTag));
			saved = true;
			setTimeout(() => (saved = false), 2000);
		} catch {
			failed = true;
		} finally {
			busy = false;
		}
	}

	async function exportMovie() {
		if (!renderer || seqBusy) return;
		seqBusy = true;
		seqFailed = false;
		seqSaved = false;
		seqDone = 0;
		try {
			const scenes = sequenceScenes(journeyKeyframes(journey.type, scene.scene), frameCount);
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
			const name = exportFilename(`${exportTag}-${journey.type}`).replace(/\.png$/, '.zip');
			downloadBlob(new Blob([zip], { type: 'application/zip' }), name);
			seqSaved = true;
			setTimeout(() => (seqSaved = false), 2000);
		} catch {
			seqFailed = true;
		} finally {
			seqBusy = false;
		}
	}
</script>

<svelte:window {onkeydown} />

{#if ui.exportOpen}
	<div class="layer">
		<button
			type="button"
			class="backdrop"
			aria-label="Close export"
			onclick={() => ui.closeExport()}
		></button>
		<div class="sheet" role="dialog" aria-modal="true" aria-label="Export">
			<header class="head">
				<h2>Export</h2>
				<button
					type="button"
					class="close"
					aria-label="Close export"
					onclick={() => ui.closeExport()}
				>
					<X size={16} aria-hidden="true" />
				</button>
			</header>

			<div class="modes" role="group" aria-label="Export type">
				<button
					type="button"
					class="seg"
					class:active={mode === 'still'}
					aria-pressed={mode === 'still'}
					onclick={() => (mode = 'still')}
				>
					Still
				</button>
				<button
					type="button"
					class="seg"
					class:active={mode === 'movie'}
					aria-pressed={mode === 'movie'}
					onclick={() => (mode = 'movie')}
				>
					Movie
				</button>
			</div>

			<p class="blurb">
				{mode === 'still'
					? 'Save the current view as a high-resolution image.'
					: 'Render a journey from Explore as a sequence of frames (.zip).'}
			</p>

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
					<dd class="ff-num">{scene.maxIter}</dd>
				</div>
			</dl>

			<label class="field">
				<span class="field-label">Resolution</span>
				<select bind:this={firstControl} bind:value={sizeId} aria-label="Export resolution">
					{#each EXPORT_SIZES as s (s.id)}
						<option value={s.id}>{s.label}</option>
					{/each}
				</select>
			</label>

			{#if mode === 'still'}
				<button class="export" type="button" onclick={exportPng} disabled={busy || !renderer}>
					<ImageDown size={16} aria-hidden="true" />
					{busy ? 'Rendering…' : 'Export PNG'}
				</button>

				<p class="status" role="status" aria-live="polite">
					{#if !renderer}
						<span class="err">Pick an art style to export.</span>
					{:else if failed}
						<span class="err"
							>Export failed — Painterly Flames and Glowing Attractors need WebGPU.</span
						>
					{:else if saved}
						<span class="ok">Saved {size.width} × {size.height} PNG.</span>
					{/if}
				</p>
			{:else}
				<div class="field">
					<span class="field-label">Journey</span>
					<div class="modes" role="group" aria-label="Journey">
						{#each JOURNEYS as j (j.id)}
							<button
								type="button"
								class="seg"
								class:active={journey.type === j.id}
								aria-pressed={journey.type === j.id}
								onclick={() => journey.setType(j.id)}
							>
								{j.label}
							</button>
						{/each}
					</div>
				</div>

				<div class="row">
					<label class="field">
						<span class="field-label">Duration</span>
						<select
							value={journey.durationMs}
							onchange={(e) => journey.setDuration(Number(e.currentTarget.value))}
							aria-label="Journey duration"
						>
							<option value={2000}>2 s</option>
							<option value={4000}>4 s</option>
							<option value={8000}>8 s</option>
							<option value={15000}>15 s</option>
							<option value={30000}>30 s</option>
						</select>
					</label>
					<label class="field">
						<span class="field-label">Frame rate</span>
						<select bind:value={fps} aria-label="Frame rate">
							<option value={12}>12 fps</option>
							<option value={24}>24 fps</option>
							<option value={30}>30 fps</option>
						</select>
					</label>
				</div>

				<p class="note">
					{frameCount} frames at {size.width} × {size.height}{frameCount === MAX_FRAMES
						? ' · capped'
						: ''}
				</p>

				<button class="export" type="button" onclick={exportMovie} disabled={seqBusy || !renderer}>
					<Film size={16} aria-hidden="true" />
					{seqBusy ? `Rendering ${seqDone}/${frameCount}…` : 'Export frames (.zip)'}
				</button>

				<p class="status" role="status" aria-live="polite">
					{#if !renderer}
						<span class="err">Pick an art style to export.</span>
					{:else if seqFailed}
						<span class="err"
							>Export failed — Painterly Flames and Glowing Attractors need WebGPU.</span
						>
					{:else if seqSaved}
						<span class="ok">Saved {frameCount} frames (.zip).</span>
					{/if}
				</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.layer {
		position: fixed;
		inset: 0;
		z-index: var(--ff-z-overlay);
		display: flex;
		justify-content: center;
		align-items: flex-start;
		padding-top: 12vh;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		background: rgba(4, 6, 10, 0.6);
		cursor: default;
	}
	.sheet {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-3);
		width: min(360px, calc(100vw - var(--ff-space-8)));
		padding: var(--ff-space-5);
		background: var(--ff-surface-overlay);
		border: 1px solid var(--ff-border-strong);
		border-radius: var(--ff-radius-lg);
		box-shadow: var(--ff-shadow-overlay);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.head h2 {
		font-size: var(--ff-text-lg);
		font-weight: var(--ff-weight-semibold);
		color: var(--ff-text);
	}
	.close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 1px solid transparent;
		border-radius: var(--ff-radius-md);
		background: transparent;
		color: var(--ff-text-muted);
		cursor: pointer;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.close:hover {
		background: var(--ff-surface-hover);
		color: var(--ff-text);
	}
	.blurb {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-secondary);
		line-height: var(--ff-leading-normal);
	}
	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ff-space-1);
		padding: 3px;
		background: var(--ff-surface-raised);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
	.seg {
		height: 28px;
		border: none;
		border-radius: var(--ff-radius-sm);
		background: transparent;
		color: var(--ff-text-muted);
		font-size: var(--ff-text-sm);
		font-weight: var(--ff-weight-medium);
		cursor: pointer;
		transition:
			background var(--ff-dur-fast) var(--ff-ease),
			color var(--ff-dur-fast) var(--ff-ease);
	}
	.seg:hover {
		color: var(--ff-text);
	}
	.seg.active {
		background: var(--ff-surface-active);
		color: var(--ff-text);
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ff-space-3);
	}
	.note {
		margin: 0;
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
	}
	.summary {
		display: flex;
		gap: var(--ff-space-5);
		margin: 0;
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
	.status {
		min-height: var(--ff-text-sm);
		margin: 0;
		font-size: var(--ff-text-sm);
		line-height: var(--ff-leading-tight);
	}
	.status .err {
		color: var(--ff-danger);
	}
	.status .ok {
		color: var(--ff-text-secondary);
	}
</style>
