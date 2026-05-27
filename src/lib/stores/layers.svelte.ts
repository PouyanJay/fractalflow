/**
 * Reactive layer-stack store for multi-layer compositing. The active layer is
 * "live" — its scene + art style ARE the shared scene/ui stores, so all the
 * existing editing (Compose nodes, pan/zoom, randomize) keeps working unchanged.
 * The other layers are independent snapshots held here. Switching the active
 * layer writes the live scene back into its slot and loads the target's snapshot.
 *
 * Snapshots are deep-cloned on the way in and out so a layer never aliases the
 * (in-place mutated) live scene. When only one layer exists the store is inert —
 * the app behaves exactly as it did before layering.
 */
import { getContext, setContext } from 'svelte';
import type { SceneStore } from './scene.svelte';
import type { UiStore } from './ui.svelte';
import {
	singleStack,
	addLayer,
	removeLayer,
	moveLayer,
	updateLayer,
	setActive,
	activeLayer,
	makeLayer,
	type LayerStack,
	type BlendMode
} from '$lib/scene/layers';
import { cloneScene } from '$lib/animate/timeline';

const KEY = Symbol('ff-layers-store');

export function createLayersStore(scene: SceneStore, ui: UiStore) {
	let stack = $state<LayerStack>(singleStack(ui.selectedStyle ?? 'deep-zoom-2d', scene.scene));

	const liveStyle = () => ui.selectedStyle ?? 'deep-zoom-2d';
	/** Capture the live scene + style into the active layer's snapshot. */
	const syncActive = () => {
		stack = updateLayer(stack, stack.activeId, {
			scene: cloneScene(scene.scene),
			style: liveStyle()
		});
	};
	/** Load the active layer's snapshot into the live scene + ui stores. */
	const loadActive = () => {
		const a = activeLayer(stack);
		ui.selectArtStyle(a.style);
		scene.setScene(cloneScene(a.scene));
	};

	return {
		get layers() {
			return stack.layers;
		},
		get activeId() {
			return stack.activeId;
		},
		get count() {
			return stack.layers.length;
		},
		/** Read-only snapshot with the active layer reflecting the live scene/style. */
		current(): LayerStack {
			return {
				activeId: stack.activeId,
				layers: stack.layers.map((l) =>
					l.id === stack.activeId ? { ...l, scene: scene.scene, style: liveStyle() } : l
				)
			};
		},
		add() {
			syncActive();
			const a = activeLayer(stack);
			// Start the new layer as a Screen-blended copy of the active view, so the
			// addition is immediately visible and ready to tweak.
			stack = addLayer(stack, makeLayer(a.style, cloneScene(a.scene), { blend: 'screen' }));
			loadActive();
		},
		remove(id: string) {
			syncActive();
			stack = removeLayer(stack, id);
			loadActive();
		},
		move(id: string, dir: 1 | -1) {
			syncActive();
			stack = moveLayer(stack, id, dir);
		},
		select(id: string) {
			if (id === stack.activeId) return;
			syncActive();
			stack = setActive(stack, id);
			loadActive();
		},
		setBlend: (id: string, blend: BlendMode) => (stack = updateLayer(stack, id, { blend })),
		setOpacity: (id: string, opacity: number) => (stack = updateLayer(stack, id, { opacity })),
		toggleVisible(id: string) {
			const l = stack.layers.find((x) => x.id === id);
			if (l) stack = updateLayer(stack, id, { visible: !l.visible });
		},
		/** Replace the whole stack (deep-link/preset load) and load its active layer. */
		load(next: LayerStack) {
			stack = next;
			loadActive();
		}
	};
}

export type LayersStore = ReturnType<typeof createLayersStore>;

export function provideLayersStore(scene: SceneStore, ui: UiStore): LayersStore {
	const store = createLayersStore(scene, ui);
	setContext(KEY, store);
	return store;
}

export function getLayersStore(): LayersStore {
	const store = getContext<LayersStore>(KEY);
	if (!store) throw new Error('Layers store not found in context — call provideLayersStore().');
	return store;
}
