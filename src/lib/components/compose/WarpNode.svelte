<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { WARPS } from '$lib/fractals/post';

	const scene = getSceneStore();
	const warpOptions = WARPS.map((w) => ({ value: w.id, label: w.label }));
</script>

<NodeShell title="Warp" target source>
	<label class="field">
		<span>Mode</span>
		<Select
			ariaLabel="Warp"
			options={warpOptions}
			value={scene.post.warp}
			onchange={(v) => scene.setPost({ warp: v })}
		/>
	</label>

	{#if scene.post.warp === 'kaleido'}
		<label class="field">
			<span>Segments</span>
			<div class="row">
				<input
					class="nodrag"
					type="range"
					min="2"
					max="16"
					step="1"
					value={scene.post.warpAmount}
					oninput={(e) => scene.setPost({ warpAmount: Number(e.currentTarget.value) })}
					aria-label="Kaleidoscope segments"
				/>
				<span class="ff-num val">{Math.round(scene.post.warpAmount)}</span>
			</div>
		</label>
	{/if}
</NodeShell>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
		width: 170px;
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
		min-width: 22px;
		text-align: right;
		color: var(--ff-text-secondary);
	}
</style>
