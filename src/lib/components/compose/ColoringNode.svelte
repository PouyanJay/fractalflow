<script lang="ts">
	import { Sparkles, Save, Trash2, SlidersHorizontal } from '@lucide/svelte';
	import NodeShell from './NodeShell.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getCustomPalettesStore } from '$lib/stores/custom-palettes.svelte';
	import {
		PALETTES,
		paletteGradient,
		defaultCustomCoeffs,
		randomCustomCoeffs
	} from '$lib/fractals/palette';

	const ui = getUiStore();
	const scene = getSceneStore();
	const customs = getCustomPalettesStore();

	const detailLabel = $derived(
		ui.selectedStyle === 'deep-zoom-2d'
			? 'Iterations'
			: ui.selectedStyle === 'attractors' || ui.selectedStyle === 'flames'
				? 'Exposure'
				: 'Detail'
	);
	const detailMax = $derived(ui.selectedStyle === 'deep-zoom-2d' ? 8000 : 1200);

	let editing = $state(false);
	let name = $state('');

	// The coefficients the editor sliders reflect (live = the scene's custom palette).
	const cc = $derived(scene.paletteCoeffs ?? defaultCustomCoeffs());
	const isCustom = $derived(!!scene.paletteCoeffs);

	function startEditing() {
		editing = true;
		if (!scene.paletteCoeffs) scene.setPaletteCoeffs(defaultCustomCoeffs());
	}
	const update = (next: typeof cc) => scene.setPaletteCoeffs(next);
	const setUniform = (key: 'a' | 'b' | 'c', v: number) => update({ ...cc, [key]: [v, v, v] });
	function setPhase(i: number, v: number) {
		const d = [...cc.d] as [number, number, number];
		d[i] = v;
		update({ ...cc, d });
	}
	function save() {
		customs.add(name.trim() || `Custom ${customs.list.length + 1}`, cc);
		name = '';
	}
</script>

<NodeShell title="Coloring" target source>
	<div class="field">
		<span>Palette</span>
		<div class="palettes">
			{#each PALETTES as p, i (p.id)}
				<button
					type="button"
					class="swatch nodrag"
					class:active={!isCustom && scene.paletteIndex === i}
					style="background: {paletteGradient(p)}"
					onclick={() => scene.setPaletteIndex(i)}
					aria-label={p.label}
					aria-pressed={!isCustom && scene.paletteIndex === i}
					title={p.label}
				></button>
			{/each}
		</div>
	</div>

	{#if customs.list.length > 0}
		<div class="field">
			<span>My palettes</span>
			<div class="palettes">
				{#each customs.list as p (p.id)}
					<div class="saved">
						<button
							type="button"
							class="swatch nodrag"
							style="background: {paletteGradient({ id: p.id, label: p.label, coeffs: p.coeffs })}"
							onclick={() => scene.setPaletteCoeffs(p.coeffs)}
							aria-label={`Apply palette ${p.label}`}
							title={p.label}
						></button>
						<button
							type="button"
							class="del nodrag"
							onclick={() => customs.remove(p.id)}
							aria-label={`Delete palette ${p.label}`}
						>
							<Trash2 size={11} aria-hidden="true" />
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<button
		type="button"
		class="customize nodrag"
		class:active={editing || isCustom}
		onclick={() => (editing ? (editing = false) : startEditing())}
	>
		<SlidersHorizontal size={13} aria-hidden="true" />
		{editing ? 'Close editor' : 'Customize'}
	</button>

	{#if editing}
		<div class="editor">
			<div
				class="preview"
				style="background: {paletteGradient({ id: 'live', label: '', coeffs: cc })}"
			></div>
			<label class="ed-row"
				><span>Brightness</span>
				<input
					class="nodrag"
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={cc.a[0]}
					oninput={(e) => setUniform('a', Number(e.currentTarget.value))}
					aria-label="Palette brightness"
				/></label
			>
			<label class="ed-row"
				><span>Contrast</span>
				<input
					class="nodrag"
					type="range"
					min="0"
					max="0.8"
					step="0.01"
					value={cc.b[0]}
					oninput={(e) => setUniform('b', Number(e.currentTarget.value))}
					aria-label="Palette contrast"
				/></label
			>
			<label class="ed-row"
				><span>Frequency</span>
				<input
					class="nodrag"
					type="range"
					min="0.5"
					max="4"
					step="0.05"
					value={cc.c[0]}
					oninput={(e) => setUniform('c', Number(e.currentTarget.value))}
					aria-label="Palette frequency"
				/></label
			>
			{#each ['Phase R', 'Phase G', 'Phase B'] as label, i (label)}
				<label class="ed-row"
					><span>{label}</span>
					<input
						class="nodrag"
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={cc.d[i]}
						oninput={(e) => setPhase(i, Number(e.currentTarget.value))}
						aria-label={label}
					/></label
				>
			{/each}
			<div class="ed-actions">
				<button type="button" class="ed-btn nodrag" onclick={() => update(randomCustomCoeffs())}>
					<Sparkles size={12} aria-hidden="true" /> Random
				</button>
				<input
					class="nodrag name"
					type="text"
					placeholder="Name…"
					bind:value={name}
					aria-label="Custom palette name"
				/>
				<button type="button" class="ed-btn primary nodrag" onclick={save}>
					<Save size={12} aria-hidden="true" /> Save
				</button>
			</div>
		</div>
	{/if}

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
	.field + .field,
	.customize {
		margin-top: var(--ff-space-3);
	}
	.palettes {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--ff-space-1);
		width: 200px;
	}
	.swatch {
		height: 26px;
		width: 100%;
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		cursor: pointer;
		padding: 0;
	}
	.swatch.active {
		border-color: var(--ff-accent);
		box-shadow: 0 0 0 1px var(--ff-accent);
	}
	.saved {
		position: relative;
	}
	.del {
		position: absolute;
		top: -5px;
		right: -5px;
		display: none;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		border-radius: var(--ff-radius-full);
		background: var(--ff-surface-raised);
		color: var(--ff-text-muted);
		cursor: pointer;
	}
	.saved:hover .del {
		display: inline-flex;
	}
	.del:hover {
		color: var(--ff-danger);
	}
	.customize {
		display: inline-flex;
		align-items: center;
		gap: var(--ff-space-2);
		height: 28px;
		padding: 0 var(--ff-space-3);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-xs);
		cursor: pointer;
	}
	.customize.active {
		border-color: var(--ff-accent);
		color: var(--ff-text);
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
		margin-top: var(--ff-space-2);
		padding: var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
		width: 200px;
	}
	.preview {
		height: 22px;
		border-radius: var(--ff-radius-sm);
		border: 1px solid var(--ff-border);
		margin-bottom: var(--ff-space-1);
	}
	.ed-row {
		display: grid;
		grid-template-columns: 60px 1fr;
		align-items: center;
		gap: var(--ff-space-2);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
	}
	.ed-actions {
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
		margin-top: var(--ff-space-2);
	}
	.ed-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		height: 26px;
		padding: 0 var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		background: var(--ff-surface);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-xs);
		cursor: pointer;
		white-space: nowrap;
	}
	.ed-btn.primary {
		background: var(--ff-accent);
		color: var(--ff-accent-contrast);
		border-color: transparent;
	}
	.name {
		flex: 1;
		min-width: 0;
		height: 26px;
		padding: 0 var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		background: var(--ff-surface);
		color: var(--ff-text);
		font: inherit;
		font-size: var(--ff-text-xs);
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
	}
	input[type='range'] {
		flex: 1;
		min-width: 0;
		accent-color: var(--ff-accent);
	}
	.val {
		min-width: 34px;
		text-align: right;
		color: var(--ff-text-secondary);
	}
</style>
