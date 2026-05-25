<script lang="ts">
	import SidePanel from './SidePanel.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';

	const ui = getUiStore();
	const style = $derived(ART_STYLES.find((s) => s.id === ui.selectedStyle) ?? null);
</script>

<SidePanel title="Inspector" side="right">
	{#if style}
		<section class="group">
			<h3 class="group-label">Renderer</h3>
			<p class="value">{style.label}</p>
			<p class="hint">{style.blurb}</p>
		</section>
		<section class="group">
			<h3 class="group-label">Parameters</h3>
			<p class="empty">
				Parameters appear here once this renderer ships. Building it is the next phase.
			</p>
		</section>
		<section class="group">
			<h3 class="group-label">Expedition log</h3>
			<p class="empty">Your steps to this image will be recorded here.</p>
		</section>
	{:else}
		<div class="placeholder">
			<p class="placeholder-title">No fractal selected</p>
			<p class="placeholder-body">
				Choose an art style in the Library to edit its parameters here.
			</p>
		</div>
	{/if}
</SidePanel>

<style>
	.group + .group {
		margin-top: var(--ff-space-5);
	}
	.group-label {
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ff-text-muted);
		margin-bottom: var(--ff-space-2);
	}
	.value {
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-medium);
		color: var(--ff-text);
	}
	.hint {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		margin-top: 2px;
		line-height: var(--ff-leading-tight);
	}
	.empty {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
		padding: var(--ff-space-2) var(--ff-space-3);
		border: 1px dashed var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-2);
		padding: var(--ff-space-4) var(--ff-space-3);
		text-align: center;
		color: var(--ff-text-muted);
	}
	.placeholder-title {
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-medium);
		color: var(--ff-text-secondary);
	}
	.placeholder-body {
		font-size: var(--ff-text-sm);
		line-height: var(--ff-leading-normal);
	}
</style>
