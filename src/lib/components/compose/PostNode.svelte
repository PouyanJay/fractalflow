<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';

	const scene = getSceneStore();

	const sliders = [
		{ key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.05 },
		{ key: 'gamma', label: 'Gamma', min: 0.4, max: 2.2, step: 0.05 },
		{ key: 'grain', label: 'Grain', min: 0, max: 1, step: 0.05 }
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
