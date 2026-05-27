/**
 * Pure operations for the user's saved custom palettes — named cosine-palette
 * coefficient sets. Persistence (localStorage) lives in the reactive store; this
 * module stays pure and testable. Mirrors scene/bookmarks.ts.
 */
import type { PaletteCoeffs } from '$lib/fractals/palette';

export interface CustomPalette {
	id: string;
	label: string;
	coeffs: PaletteCoeffs;
}

let counter = 0;

function makeId(): string {
	return `cp_${Date.now().toString(36)}_${(counter++).toString(36)}`;
}

/** Add a custom palette to the front of the list (newest first). Immutable. */
export function addCustomPalette(
	list: CustomPalette[],
	label: string,
	coeffs: PaletteCoeffs
): CustomPalette[] {
	return [{ id: makeId(), label, coeffs }, ...list];
}

export function removeCustomPalette(list: CustomPalette[], id: string): CustomPalette[] {
	return list.filter((p) => p.id !== id);
}

export function serializeCustomPalettes(list: CustomPalette[]): string {
	return JSON.stringify(list);
}

const isRgb = (v: unknown): v is [number, number, number] =>
	Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

const isCoeffs = (v: unknown): v is PaletteCoeffs =>
	!!v &&
	typeof v === 'object' &&
	isRgb((v as PaletteCoeffs).a) &&
	isRgb((v as PaletteCoeffs).b) &&
	isRgb((v as PaletteCoeffs).c) &&
	isRgb((v as PaletteCoeffs).d);

export function parseCustomPalettes(raw: string): CustomPalette[] {
	try {
		const data: unknown = JSON.parse(raw);
		if (!Array.isArray(data)) return [];
		return data
			.filter(
				(p) =>
					!!p &&
					typeof p === 'object' &&
					typeof p.id === 'string' &&
					typeof p.label === 'string' &&
					isCoeffs(p.coeffs)
			)
			.map((p) => ({ id: p.id, label: p.label, coeffs: p.coeffs }));
	} catch {
		return [];
	}
}
