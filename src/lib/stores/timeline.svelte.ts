/**
 * Reactive Animate timeline store: the keyframe list and clip duration. Wraps
 * the pure operations in animate/timeline.ts and is provided via context by the
 * root layout so keyframes persist while navigating between modes.
 */
import { getContext, setContext } from 'svelte';
import { addKeyframe, removeKeyframe, type Keyframe } from '$lib/animate/timeline';
import type { SceneState } from '$lib/engine/types';

const KEY = Symbol('ff-timeline-store');

const MIN_DURATION = 1000;
const MAX_DURATION = 60000;

export function createTimelineStore() {
	let keyframes = $state<Keyframe[]>([]);
	let durationMs = $state(8000);

	return {
		get keyframes() {
			return keyframes;
		},
		get durationMs() {
			return durationMs;
		},
		setDuration: (ms: number) => {
			durationMs = Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(ms)));
		},
		add: (t: number, scene: SceneState) => {
			keyframes = addKeyframe(keyframes, t, scene);
		},
		remove: (id: string) => {
			keyframes = removeKeyframe(keyframes, id);
		},
		clear: () => {
			keyframes = [];
		}
	};
}

export type TimelineStore = ReturnType<typeof createTimelineStore>;

export function provideTimelineStore(): TimelineStore {
	const store = createTimelineStore();
	setContext(KEY, store);
	return store;
}

export function getTimelineStore(): TimelineStore {
	const store = getContext<TimelineStore>(KEY);
	if (!store) throw new Error('Timeline store not found in context — call provideTimelineStore().');
	return store;
}
