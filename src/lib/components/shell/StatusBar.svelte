<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { MODES, modeFromPath } from '$lib/stores/ui-logic';
	import { getEngineStore } from '$lib/stores/engine.svelte';
	import { chooseBackendType, detectSupport } from '$lib/engine/capabilities';

	const activeMode = $derived(MODES.find((m) => m.id === modeFromPath(page.url.pathname)));
	const engine = getEngineStore();

	function label(type: 'webgpu' | 'webgl2' | null): string {
		if (type === 'webgpu') return 'WebGPU';
		if (type === 'webgl2') return 'WebGL2';
		return 'None';
	}

	// Show the backend the engine actually initialised with; before that, the
	// one capability detection predicts for this device.
	const backend = $derived.by(() => {
		if (engine.backend) return label(engine.backend);
		if (!browser) return 'Detecting…';
		return label(chooseBackendType(detectSupport()));
	});
</script>

<footer class="statusbar">
	<div class="left">
		<span class="dot" aria-hidden="true"></span>
		<span class="mode">{activeMode?.label ?? 'Explore'}</span>
	</div>

	<div class="readouts" aria-label="Viewport readouts">
		<span class="readout">center <span class="ff-num">—</span></span>
		<span class="readout">zoom <span class="ff-num">—</span></span>
		<span class="readout">iters <span class="ff-num">—</span></span>
	</div>

	<div class="right">
		<span class="backend" title="Rendering backend">{backend}</span>
	</div>
</footer>

<style>
	.statusbar {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--ff-space-4);
		height: var(--ff-statusbar-h);
		padding: 0 var(--ff-space-3);
		background: var(--ff-surface);
		border-top: 1px solid var(--ff-border);
		font-size: var(--ff-text-xs);
		color: var(--ff-text-muted);
	}
	.left {
		display: flex;
		align-items: center;
		gap: var(--ff-space-2);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: var(--ff-radius-full);
		background: var(--ff-accent);
	}
	.mode {
		color: var(--ff-text-secondary);
		font-weight: var(--ff-weight-medium);
	}
	.readouts {
		display: flex;
		align-items: center;
		gap: var(--ff-space-4);
		margin-left: auto;
	}
	.readout .ff-num {
		color: var(--ff-text-secondary);
		margin-left: 4px;
	}
	.right {
		display: flex;
		align-items: center;
	}
	.backend {
		padding: 1px var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		color: var(--ff-text-secondary);
		font-family: var(--ff-font-mono);
		font-size: var(--ff-text-xs);
	}
	@media (max-width: 720px) {
		.readouts {
			display: none;
		}
	}
</style>
