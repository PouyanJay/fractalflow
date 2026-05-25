<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { WARPS } from '$lib/fractals/post';

	const scene = getSceneStore();
</script>

<NodeShell title="Warp" target source>
	<label class="field">
		<span>Mode</span>
		<select
			class="select nodrag"
			aria-label="Warp"
			value={scene.post.warp}
			onchange={(e) => scene.setPost({ warp: e.currentTarget.value })}
		>
			{#each WARPS as w (w.id)}
				<option value={w.id}>{w.label}</option>
			{/each}
		</select>
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
	.select {
		height: 30px;
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
