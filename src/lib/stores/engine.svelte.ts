/**
 * Small reactive store holding the rendering backend actually chosen by the
 * engine at runtime, so the shell (e.g. the status bar) can report it.
 * Provided via context by the root layout.
 */
import { getContext, setContext } from 'svelte';
import type { BackendType } from '$lib/engine/types';

const KEY = Symbol('ff-engine-store');

export function createEngineStore() {
	let backend = $state<BackendType | null>(null);
	return {
		get backend() {
			return backend;
		},
		setBackend: (type: BackendType) => (backend = type)
	};
}

export type EngineStore = ReturnType<typeof createEngineStore>;

export function provideEngineStore(): EngineStore {
	const store = createEngineStore();
	setContext(KEY, store);
	return store;
}

export function getEngineStore(): EngineStore {
	const store = getContext<EngineStore>(KEY);
	if (!store) throw new Error('Engine store not found in context — call provideEngineStore().');
	return store;
}
