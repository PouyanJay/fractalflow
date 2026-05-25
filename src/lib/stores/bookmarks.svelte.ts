/**
 * Reactive bookmarks store backed by localStorage. Wraps the pure operations
 * in scene/bookmarks.ts. Provided via context by the root layout.
 */
import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import {
	addBookmark,
	removeBookmark,
	serializeBookmarks,
	parseBookmarks,
	type Bookmark
} from '$lib/scene/bookmarks';

const KEY = Symbol('ff-bookmarks-store');
const STORAGE_KEY = 'fractalflow:bookmarks';

export function createBookmarksStore() {
	let list = $state<Bookmark[]>(
		browser ? parseBookmarks(localStorage.getItem(STORAGE_KEY) ?? '') : []
	);

	function persist() {
		if (browser) localStorage.setItem(STORAGE_KEY, serializeBookmarks(list));
	}

	return {
		get list() {
			return list;
		},
		add: (label: string, token: string) => {
			list = addBookmark(list, label, token);
			persist();
		},
		remove: (id: string) => {
			list = removeBookmark(list, id);
			persist();
		}
	};
}

export type BookmarksStore = ReturnType<typeof createBookmarksStore>;

export function provideBookmarksStore(): BookmarksStore {
	const store = createBookmarksStore();
	setContext(KEY, store);
	return store;
}

export function getBookmarksStore(): BookmarksStore {
	const store = getContext<BookmarksStore>(KEY);
	if (!store)
		throw new Error('Bookmarks store not found in context — call provideBookmarksStore().');
	return store;
}
