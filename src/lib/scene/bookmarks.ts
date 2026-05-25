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
	/** Art style this bookmark belongs to (which renderer to load). */
	styleId: string;
}

let counter = 0;

function makeId(): string {
	return `bm_${Date.now().toString(36)}_${(counter++).toString(36)}`;
}

/** Add a bookmark to the front of the list (newest first). Does not mutate input. */
export function addBookmark(
	list: Bookmark[],
	label: string,
	token: string,
	styleId: string
): Bookmark[] {
	return [{ id: makeId(), label, token, styleId }, ...list];
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
		return data
			.filter(
				(b) =>
					!!b &&
					typeof b === 'object' &&
					typeof b.id === 'string' &&
					typeof b.label === 'string' &&
					typeof b.token === 'string'
			)
			.map((b) => ({
				id: b.id,
				label: b.label,
				token: b.token,
				// Older bookmarks predate styleId; default them to Deep-Zoom 2D.
				styleId: typeof b.styleId === 'string' ? b.styleId : 'deep-zoom-2d'
			}));
	} catch {
		return [];
	}
}
