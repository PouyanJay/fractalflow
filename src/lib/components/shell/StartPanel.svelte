<script lang="ts">
	/**
	 * Compose's "Start" palette (left panel, Compose-only): choose an art style or
	 * load a curated preset to begin authoring. This is where composition begins —
	 * Explore stays immersive with no left chrome. (Saved views live in Explore's
	 * Codex.) Folded out of the old global Library in the two-act re-frame.
	 */
	import SidePanel from './SidePanel.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { ART_STYLES, modeFromPath } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getIcon } from '$lib/components/icons';
	import { PRESETS } from '$lib/scene/presets';
	import { defaultCameraFor } from '$lib/fractals/registry';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ArtStyleId } from '$lib/stores/ui-logic';
	import type { SceneState } from '$lib/engine/types';

	const ui = getUiStore();
	const sceneStore = getSceneStore();

	// Pick an art style: switch, and reframe the camera if the kind changed.
	function selectStyle(id: ArtStyleId) {
		if (id !== ui.selectedStyle) sceneStore.setCamera(defaultCameraFor(id));
		ui.selectArtStyle(id);
	}

	// Load a preset: apply its style + scene, then jump to Explore to inhabit it.
	function loadPreset(styleId: ArtStyleId, scene: SceneState) {
		ui.selectArtStyle(styleId);
		sceneStore.setScene(scene);
		if (modeFromPath(page.url.pathname) !== 'explore') goto(resolve('/explore'));
	}

	const presetOptions = PRESETS.map((p) => ({ value: p.id, label: p.label }));
	function onPickPreset(id: string) {
		const preset = PRESETS.find((p) => p.id === id);
		if (preset) loadPreset(preset.styleId, preset.scene);
	}
</script>

<SidePanel title="Start" panelId="library">
	<section class="group">
		<h3 class="group-label">Art style</h3>
		<ul class="styles" role="listbox" aria-label="Art style">
			{#each ART_STYLES as style (style.id)}
				{@const Icon = getIcon(style.icon)}
				{@const selected = ui.selectedStyle === style.id}
				<li>
					<button
						type="button"
						class="style"
						class:selected
						role="option"
						aria-selected={selected}
						onclick={() => selectStyle(style.id)}
					>
						<span class="style-icon" aria-hidden="true">
							{#if Icon}<Icon size={18} />{/if}
						</span>
						<span class="style-text">
							<span class="style-name">{style.label}</span>
							<span class="style-blurb">{style.blurb}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</section>

	<section class="group">
		<h3 class="group-label">Presets</h3>
		<Select
			ariaLabel="Preset"
			options={presetOptions}
			value=""
			placeholder="Load a preset…"
			onchange={onPickPreset}
		/>
	</section>
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
	.styles {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
	}
	.style {
		display: flex;
		align-items: flex-start;
		gap: var(--ff-space-3);
		width: 100%;
		padding: var(--ff-space-2) var(--ff-space-3);
		border: 1px solid transparent;
		border-radius: var(--ff-radius-md);
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition:
			background var(--ff-dur-fast) var(--ff-ease),
			border-color var(--ff-dur-fast) var(--ff-ease);
	}
	.style:hover {
		background: var(--ff-surface-hover);
	}
	.style.selected {
		background: var(--ff-surface-active);
		border-color: var(--ff-border-strong);
	}
	.style-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-overlay);
		color: var(--ff-text-secondary);
		flex: none;
		margin-top: 1px;
	}
	.style.selected .style-icon {
		color: var(--ff-accent);
	}
	.style-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.style-name {
		font-size: var(--ff-text-md);
		font-weight: var(--ff-weight-medium);
		color: var(--ff-text);
	}
	.style-blurb {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-tight);
	}
</style>
