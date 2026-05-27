/**
 * Double-double arithmetic: a real number carried as an unevaluated sum of two
 * f64s (`hi` + `lo`, with |lo| ≤ ½ulp(hi)), giving ~31 significant decimal
 * digits — roughly twice f64. Deep-zoom needs this for the *view centre* and the
 * *reference-orbit* computation: past ~1e10× an f64 centre runs out of digits,
 * so the orbit is computed for slightly the wrong point and the view goes flat.
 *
 * Only the operations the reference orbit and the camera need are implemented
 * (add/sub/mul/sqr and number-scaled variants) — no division. The classic
 * error-free transforms (Dekker/Knuth two-sum & two-product) are the basis; see
 * Hida, Li & Bailey, "Library for Double-Double and Quad-Double Arithmetic".
 */

export interface DD {
	hi: number;
	lo: number;
}

// --- Error-free transforms -----------------------------------------------------

/** a + b = s + e exactly (Knuth two-sum), no assumption on magnitudes. */
function twoSum(a: number, b: number): { s: number; e: number } {
	const s = a + b;
	const bb = s - a;
	const e = a - (s - bb) + (b - bb);
	return { s, e };
}

/** a + b = s + e exactly, assuming |a| ≥ |b|. */
function quickTwoSum(a: number, b: number): { s: number; e: number } {
	const s = a + b;
	const e = b - (s - a);
	return { s, e };
}

const SPLITTER = 134217729; // 2^27 + 1, for Veltkamp splitting (no FMA in JS)

/** a × b = p + e exactly, via Veltkamp/Dekker splitting. */
function twoProd(a: number, b: number): { p: number; e: number } {
	const p = a * b;
	let t = SPLITTER * a;
	const ahi = t - (t - a);
	const alo = a - ahi;
	t = SPLITTER * b;
	const bhi = t - (t - b);
	const blo = b - bhi;
	const e = alo * blo - (p - ahi * bhi - alo * bhi - ahi * blo);
	return { p, e };
}

// --- Double-double operations --------------------------------------------------

export function fromNumber(x: number): DD {
	return { hi: x, lo: 0 };
}

/** Collapse back to the nearest f64 (loses the tail). */
export function toNumber(a: DD): number {
	return a.hi + a.lo;
}

export function neg(a: DD): DD {
	return { hi: -a.hi, lo: -a.lo };
}

export function add(a: DD, b: DD): DD {
	let { s, e } = twoSum(a.hi, b.hi);
	const t = twoSum(a.lo, b.lo);
	e += t.s;
	({ s, e } = quickTwoSum(s, e));
	e += t.e;
	({ s, e } = quickTwoSum(s, e));
	return { hi: s, lo: e };
}

export function sub(a: DD, b: DD): DD {
	return add(a, neg(b));
}

export function mul(a: DD, b: DD): DD {
	const { p, e } = twoProd(a.hi, b.hi);
	const err = e + (a.hi * b.lo + a.lo * b.hi);
	const r = quickTwoSum(p, err);
	return { hi: r.s, lo: r.e };
}

export function sqr(a: DD): DD {
	const { p, e } = twoProd(a.hi, a.hi);
	const err = e + 2 * a.hi * a.lo; // a.lo² is below the representable tail
	const r = quickTwoSum(p, err);
	return { hi: r.s, lo: r.e };
}

/** a + b where b is a plain f64. */
export function addNumber(a: DD, b: number): DD {
	const t = twoSum(a.hi, b);
	const r = quickTwoSum(t.s, t.e + a.lo);
	return { hi: r.s, lo: r.e };
}

/** |a| — needed for the Burning Ship reference orbit (z = (|x| + i|y|)² + c). */
export function absDD(a: DD): DD {
	return a.hi < 0 || (a.hi === 0 && a.lo < 0) ? neg(a) : a;
}

/** a × b where b is a plain f64. */
export function mulNumber(a: DD, b: number): DD {
	const { p, e } = twoProd(a.hi, b);
	const err = e + a.lo * b;
	const r = quickTwoSum(p, err);
	return { hi: r.s, lo: r.e };
}
