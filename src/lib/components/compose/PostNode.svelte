<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';

	const scene = getSceneStore();

	const sliders = [
		{ key: 'hueShift', label: 'Hue', min: -0.5, max: 0.5, step: 0.01 },
		{ key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.05 },
		{ key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.05 },
		{ key: 'gamma', label: 'Gamma', min: 0.4, max: 2.2, step: 0.05 },
		{ key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.05 }
	] as const;

	// Bloom (HDR glow). Intensity 0 keeps it off; the others shape the glow.
	const bloomSliders = [
		{ key: 'bloom', label: 'Intensity', min: 0, max: 2, step: 0.05 },
		{ key: 'bloomThreshold', label: 'Threshold', min: 0, max: 1, step: 0.02 },
		{ key: 'bloomRadius', label: 'Radius', min: 0, max: 2, step: 0.05 },
		{ key: 'bloomKnee', label: 'Knee', min: 0, max: 1, step: 0.05 }
	] as const;
</script>

<NodeShell title="Post-FX" target source>
	{#each sliders as s (s.key)}
		<label class="field">
			<span>{s.label}</span>
			<div class="row">
				<input
					class="nodrag"
					type="range"
					min={s.min}
					max={s.max}
					step={s.step}
					value={scene.post[s.key]}
					oninput={(e) => scene.setPost({ [s.key]: Number(e.currentTarget.value) })}
					aria-label={s.label}
				/>
				<span class="ff-num val">{scene.post[s.key].toFixed(2)}</span>
			</div>
		</label>
	{/each}

	<div class="group">Bloom</div>
	{#each bloomSliders as s (s.key)}
		<label class="field" class:muted={s.key !== 'bloom' && scene.post.bloom === 0}>
			<span>{s.label}</span>
			<div class="row">
				<input
					class="nodrag"
					type="range"
					min={s.min}
					max={s.max}
					step={s.step}
					value={scene.post[s.key]}
					oninput={(e) => scene.setPost({ [s.key]: Number(e.currentTarget.value) })}
					aria-label={s.label}
				/>
				<span class="ff-num val">{scene.post[s.key].toFixed(2)}</span>
			</div>
		</label>
	{/each}
</NodeShell>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
		width: 180px;
	}
	.group {
		margin-top: var(--ff-space-2);
		font-size: var(--ff-text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ff-text-secondary);
	}
	/* The shaping controls only bite once bloom intensity is up. */
	.field.muted {
		opacity: 0.5;
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
		font-variant-numeric: tabular-nums;
	}
</style>
