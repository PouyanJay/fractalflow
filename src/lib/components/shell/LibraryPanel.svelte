<script lang="ts">
	import SidePanel from './SidePanel.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { getIcon } from '$lib/components/icons';

	const ui = getUiStore();
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
		<p class="empty">No presets yet — save a scene to start your gallery.</p>
	</section>

	<section class="group">
		<h3 class="group-label">Bookmarks</h3>
		<p class="empty">Bookmark a location while exploring to pin it here.</p>
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
	.empty {
		font-size: var(--ff-text-sm);
		color: var(--ff-text-muted);
		line-height: var(--ff-leading-normal);
		padding: var(--ff-space-2) var(--ff-space-3);
		border: 1px dashed var(--ff-border);
		border-radius: var(--ff-radius-md);
	}
</style>
