/**
 * Pure bookmark-list operations. A bookmark pairs a label with an encoded
 * scene token (see codec.ts), so saved views are compact and shareable.
 * Persistence (localStorage) lives in the reactive store; this module stays
 * pure and testable.
 */

export interface Bookmark {
	id: string;
	label: string;
	/** Encoded scene token (codec.encodeScene). */
	token: string;
}

let counter = 0;

function makeId(): string {
	return `bm_${Date.now().toString(36)}_${(counter++).toString(36)}`;
}

/** Add a bookmark to the front of the list (newest first). Does not mutate input. */
export function addBookmark(list: Bookmark[], label: string, token: string): Bookmark[] {
	return [{ id: makeId(), label, token }, ...list];
}

export function removeBookmark(list: Bookmark[], id: string): Bookmark[] {
	return list.filter((b) => b.id !== id);
}

export function serializeBookmarks(list: Bookmark[]): string {
	return JSON.stringify(list);
}

export function parseBookmarks(raw: string): Bookmark[] {
	try {
		const data: unknown = JSON.parse(raw);
		if (!Array.isArray(data)) return [];
		return data.filter(
			(b): b is Bookmark =>
				!!b &&
				typeof b === 'object' &&
				typeof (b as Bookmark).id === 'string' &&
				typeof (b as Bookmark).label === 'string' &&
				typeof (b as Bookmark).token === 'string'
		);
	} catch {
		return [];
	}
}
