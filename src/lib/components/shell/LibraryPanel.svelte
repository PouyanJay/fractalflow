<script lang="ts">
	import SidePanel from './SidePanel.svelte';
	import { ART_STYLES, modeFromPath } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getSceneStore } from '$lib/stores/scene.svelte';
	import { getBookmarksStore } from '$lib/stores/bookmarks.svelte';
	import { getIcon } from '$lib/components/icons';
	import { PRESETS } from '$lib/scene/presets';
	import { encodeScene, decodeScene } from '$lib/scene/codec';
	import { FORMULAS } from '$lib/fractals/deep-zoom-2d/reference';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { X } from '@lucide/svelte';
	import type { SceneState } from '$lib/engine/types';

	const ui = getUiStore();
	const sceneStore = getSceneStore();
	const bookmarks = getBookmarksStore();

	function loadScene(scene: SceneState) {
		sceneStore.setScene(scene);
		if (modeFromPath(page.url.pathname) !== 'explore') goto(resolve('/explore'));
	}

	function saveCurrent() {
		const s = sceneStore.scene;
		const formula = FORMULAS.find((f) => f.id === s.formula)?.label ?? s.formula;
		const mag = 3 / s.camera.scale;
		const magStr =
			mag >= 1000 ? mag.toExponential(0) : mag >= 10 ? `${Math.round(mag)}` : mag.toFixed(1);
		bookmarks.add(`${formula} · ${magStr}×`, encodeScene(s));
	}
</script>

<SidePanel title="Library" panelId="library">
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
						onclick={() => ui.selectArtStyle(style.id)}
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
		<ul class="list">
			{#each PRESETS as preset (preset.id)}
				<li>
					<button type="button" class="entry" onclick={() => loadScene(preset.scene)}>
						{preset.label}
					</button>
				</li>
			{/each}
		</ul>
	</section>

	<section class="group">
		<div class="group-head">
			<h3 class="group-label">Bookmarks</h3>
			<button type="button" class="add" onclick={saveCurrent}>Save view</button>
		</div>
		{#if bookmarks.list.length === 0}
			<p class="empty">No bookmarks yet — save a view to pin it here.</p>
		{:else}
			<ul class="list">
				{#each bookmarks.list as bookmark (bookmark.id)}
					<li class="bookmark">
						<button
							type="button"
							class="entry"
							onclick={() => loadScene(decodeScene(bookmark.token))}
						>
							{bookmark.label}
						</button>
						<button
							type="button"
							class="del"
							onclick={() => bookmarks.remove(bookmark.id)}
							aria-label="Delete bookmark {bookmark.label}"
						>
							<X size={14} aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
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
	.group-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--ff-space-2);
	}
	.group-head .group-label {
		margin-bottom: 0;
	}
	.add {
		border: none;
		background: transparent;
		color: var(--ff-accent);
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-medium);
		padding: 2px 6px;
		border-radius: var(--ff-radius-sm);
		cursor: pointer;
	}
	.add:hover {
		background: var(--ff-surface-hover);
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
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.entry {
		width: 100%;
		padding: 6px var(--ff-space-3);
		border: none;
		border-radius: var(--ff-radius-md);
		background: transparent;
		text-align: left;
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-sm);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: background var(--ff-dur-fast) var(--ff-ease);
	}
	.entry:hover {
		background: var(--ff-surface-hover);
		color: var(--ff-text);
	}
	.bookmark {
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
	}
	.bookmark .entry {
		flex: 1;
		min-width: 0;
	}
	.del {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: var(--ff-radius-sm);
		background: transparent;
		color: var(--ff-text-muted);
		cursor: pointer;
	}
	.del:hover {
		color: var(--ff-danger);
		background: var(--ff-surface-hover);
	}
	.empty {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
		padding: var(--ff-space-2) var(--ff-space-3);
		border: 1px dashed var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
</style>
