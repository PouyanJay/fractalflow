<script lang="ts">
	/**
	 * The Layers panel: stack multiple fractal layers and composite them with a
	 * per-layer blend mode + opacity. The active layer is the one Compose edits
	 * (its scene/style are the live stores); the others are snapshots. Listed
	 * top → bottom to match the visual stacking order.
	 */
	import { Plus, Eye, EyeOff, ChevronUp, ChevronDown, Trash2 } from '@lucide/svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { getLayersStore } from '$lib/stores/layers.svelte';
	import { getUiStore } from '$lib/stores/ui.svelte';
	import { ART_STYLES } from '$lib/stores/ui-logic';
	import { BLEND_MODES, MAX_LAYERS, type BlendMode } from '$lib/scene/layers';

	const layers = getLayersStore();
	const ui = getUiStore();

	const blendOptions = BLEND_MODES.map((b) => ({ value: b.id, label: b.label }));
	// Top of the stack renders last → show it first in the list.
	const ordered = $derived([...layers.layers].reverse());
	const styleLabel = (id: string) => ART_STYLES.find((s) => s.id === id)?.label ?? id;
</script>

<aside class="layers" aria-label="Layers">
	<header>
		<h2>Layers</h2>
		<button
			type="button"
			class="add"
			onclick={() => layers.add()}
			disabled={layers.count >= MAX_LAYERS}
			aria-label="Add layer"
		>
			<Plus size={14} aria-hidden="true" /> Add
		</button>
	</header>

	<ul>
		{#each ordered as layer (layer.id)}
			{@const active = layer.id === layers.activeId}
			<li class="layer" class:active>
				<div class="top">
					<button
						type="button"
						class="vis"
						onclick={() => layers.toggleVisible(layer.id)}
						aria-label={layer.visible ? `Hide layer` : `Show layer`}
						aria-pressed={layer.visible}
					>
						{#if layer.visible}<Eye size={13} aria-hidden="true" />{:else}<EyeOff
								size={13}
								aria-hidden="true"
							/>{/if}
					</button>
					<button
						type="button"
						class="name"
						onclick={() => layers.select(layer.id)}
						aria-pressed={active}
					>
						{active ? styleLabel(ui.selectedStyle ?? layer.style) : styleLabel(layer.style)}
						{#if active}<span class="badge">editing</span>{/if}
					</button>
					<div class="ops">
						<button
							type="button"
							onclick={() => layers.move(layer.id, 1)}
							aria-label="Move layer up"
						>
							<ChevronUp size={13} aria-hidden="true" />
						</button>
						<button
							type="button"
							onclick={() => layers.move(layer.id, -1)}
							aria-label="Move layer down"
						>
							<ChevronDown size={13} aria-hidden="true" />
						</button>
						<button
							type="button"
							class="del"
							onclick={() => layers.remove(layer.id)}
							disabled={layers.count <= 1}
							aria-label="Delete layer"
						>
							<Trash2 size={13} aria-hidden="true" />
						</button>
					</div>
				</div>
				<div class="bottom">
					<Select
						ariaLabel="Blend mode"
						options={blendOptions}
						value={layer.blend}
						onchange={(v) => layers.setBlend(layer.id, v as BlendMode)}
					/>
					<input
						class="opacity"
						type="range"
						min="0"
						max="1"
						step="0.05"
						value={layer.opacity}
						oninput={(e) => layers.setOpacity(layer.id, Number(e.currentTarget.value))}
						aria-label="Layer opacity"
					/>
				</div>
			</li>
		{/each}
	</ul>
</aside>

<style>
	.layers {
		position: absolute;
		top: var(--ff-space-3);
		right: var(--ff-space-3);
		z-index: 5;
		width: 232px;
		padding: var(--ff-space-3);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-lg);
		background: color-mix(in srgb, var(--ff-surface) 92%, transparent);
		backdrop-filter: blur(8px);
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-2);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: var(--ff-text-xs);
		font-weight: var(--ff-weight-semibold);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ff-text-secondary);
	}
	.add {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		height: 26px;
		padding: 0 var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-sm);
		background: var(--ff-surface-raised);
		color: var(--ff-text-secondary);
		font-size: var(--ff-text-xs);
		cursor: pointer;
	}
	.add:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
	}
	.layer {
		display: flex;
		flex-direction: column;
		gap: var(--ff-space-1);
		padding: var(--ff-space-2);
		border: 1px solid var(--ff-border);
		border-radius: var(--ff-radius-md);
		background: var(--ff-surface-raised);
	}
	.layer.active {
		border-color: var(--ff-accent);
		box-shadow: 0 0 0 1px var(--ff-accent);
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
	}
	.vis,
	.ops button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: var(--ff-radius-sm);
		background: transparent;
		color: var(--ff-text-muted);
		cursor: pointer;
	}
	.vis:hover,
	.ops button:hover {
		color: var(--ff-text);
		background: var(--ff-surface);
	}
	.ops .del:hover {
		color: var(--ff-danger);
	}
	.ops button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.name {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--ff-space-1);
		padding: 2px var(--ff-space-1);
		border: none;
		background: transparent;
		color: var(--ff-text);
		font: inherit;
		font-size: var(--ff-text-xs);
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.badge {
		flex: none;
		font-size: 9px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ff-accent);
	}
	.ops {
		display: flex;
		gap: 1px;
	}
	.bottom {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--ff-space-2);
		align-items: center;
	}
	.opacity {
		min-width: 0;
		accent-color: var(--ff-accent);
	}
</style>
