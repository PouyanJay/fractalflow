<script lang="ts">
	import NodeShell from './NodeShell.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { WARPS, warpDefaultAmount } from '$lib/fractals/post';

	const scene = getSceneStore();
	const warpOptions = WARPS.map((w) => ({ value: w.id, label: w.label }));
	// The active warp's amount control (label + range), or undefined if it takes none.
	const amount = $derived(WARPS.find((w) => w.id === scene.post.warp)?.amount);

	// Switching warps lands warpAmount on the new warp's default (each warp reads
	// the shared amount differently, so a stale value would be out of range).
	function setWarp(id: string) {
		scene.setPost({ warp: id, warpAmount: warpDefaultAmount(id) });
	}
	const fmt = (v: number, step: number) => (step >= 1 ? String(Math.round(v)) : v.toFixed(1));
</script>

<NodeShell title="Warp" target source>
	<label class="field">
		<span>Mode</span>
		<Select ariaLabel="Warp" options={warpOptions} value={scene.post.warp} onchange={setWarp} />
	</label>

	{#if amount}
		<label class="field">
			<span>{amount.label}</span>
			<div class="row">
				<input
					class="nodrag"
					type="range"
					min={amount.min}
					max={amount.max}
					step={amount.step}
					value={scene.post.warpAmount}
					oninput={(e) => scene.setPost({ warpAmount: Number(e.currentTarget.value) })}
					aria-label={`${amount.label}`}
				/>
				<span class="ff-num val">{fmt(scene.post.warpAmount, amount.step)}</span>
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
	.field + .field {
		margin-top: var(--ff-space-2);
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
		min-width: 28px;
		text-align: right;
		color: var(--ff-text-secondary);
		font-variant-numeric: tabular-nums;
	}
</style>
