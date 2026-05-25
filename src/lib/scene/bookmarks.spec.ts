import { describe, it, expect } from 'vitest';
import { addBookmark, removeBookmark, serializeBookmarks, parseBookmarks } from './bookmarks';

describe('addBookmark', () => {
	it('prepends a new bookmark with the given label and token', () => {
		const list = addBookmark([], 'Seahorse', 'mandelbrot~-0.74~0.11~0.02~600~1~-0.8~0.156');
		expect(list).toHaveLength(1);
		expect(list[0].label).toBe('Seahorse');
		expect(list[0].token).toContain('mandelbrot');
		expect(list[0].id.length).toBeGreaterThan(0);
	});

	it('keeps newest first and assigns unique ids', () => {
		const list = addBookmark(addBookmark([], 'a', 't1'), 'b', 't2');
		expect(list.map((b) => b.label)).toEqual(['b', 'a']);
		expect(list[0].id).not.toBe(list[1].id);
	});

	it('does not mutate the input list', () => {
		const original: ReturnType<typeof addBookmark> = [];
		addBookmark(original, 'x', 't');
		expect(original).toHaveLength(0);
	});
});

describe('removeBookmark', () => {
	it('removes the bookmark with the given id', () => {
		const list = addBookmark(addBookmark([], 'a', 't1'), 'b', 't2');
		const removed = removeBookmark(list, list[0].id);
		expect(removed.map((b) => b.label)).toEqual(['a']);
	});
});

describe('serializeBookmarks / parseBookmarks', () => {
	it('round-trips a list', () => {
		const list = addBookmark(addBookmark([], 'a', 't1'), 'b', 't2');
		expect(parseBookmarks(serializeBookmarks(list))).toEqual(list);
	});

	it('returns an empty list on garbage or non-array input', () => {
		expect(parseBookmarks('not json')).toEqual([]);
		expect(parseBookmarks('{"x":1}')).toEqual([]);
	});

	it('drops malformed entries', () => {
		const raw = JSON.stringify([{ id: 'a', label: 'ok', token: 't' }, { id: 5 }, null, 'nope']);
		const parsed = parseBookmarks(raw);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].label).toBe('ok');
	});
});
