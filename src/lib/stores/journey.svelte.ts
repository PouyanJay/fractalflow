/**
 * Reactive journey store: which journey (Formation/Zoom) and how long, plus a
 * transient `playing` flag the Explore overlay sets during playback (so the page
 * can pause its deep-link URL writes while frames stream through the scene).
 * Shared via context so the Explore panel and the Export sheet drive the same
 * journey. Thin wrapper over the pure model in animate/journey.ts.
 */
import { getContext, setContext } from 'svelte';
import type { JourneyType } from '$lib/animate/journey';

const KEY = Symbol('ff-journey-store');

const MIN_DURATION = 2000;
const MAX_DURATION = 60000;

export function createJourneyStore() {
	let type = $state<JourneyType>('formation');
	let durationMs = $state(8000);
	let playing = $state(false);

	return {
		get type() {
			return type;
		},
		get durationMs() {
			return durationMs;
		},
		get playing() {
			return playing;
		},
		setType: (t: JourneyType) => (type = t),
		setDuration: (ms: number) => {
			durationMs = Math.max(MIN_DURATION, Math.min(MAX_DURATION, Math.round(ms)));
		},
		setPlaying: (p: boolean) => (playing = p)
	};
}

export type JourneyStore = ReturnType<typeof createJourneyStore>;

export function provideJourneyStore(): JourneyStore {
	const store = createJourneyStore();
	setContext(KEY, store);
	return store;
}

export function getJourneyStore(): JourneyStore {
	const store = getContext<JourneyStore>(KEY);
	if (!store) throw new Error('Journey store not found in context — call provideJourneyStore().');
	return store;
}
