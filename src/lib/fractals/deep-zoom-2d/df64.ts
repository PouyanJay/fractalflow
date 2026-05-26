/**
 * Double-float ("df64") helpers for the deep-zoom reference orbit.
 *
 * Perturbation keeps the per-pixel delta in f32, but the *reference orbit* Z_n
 * was uploaded to the GPU as f32 too — and f32's ~7 significant digits cap
 * usable zoom at ~1e6×. Carrying each Z component as an f32 hi/lo pair (hi =
 * nearest f32, lo = residual) and folding the lo term into the `2·Z·δ` product
 * restores ~14 digits, pushing the orbit wall toward ~1e13×.
 *
 * f32-emulated here with `Math.fround` so this is an exact CPU mirror of the
 * WGSL/GLSL arithmetic — and unit-testable against the f64 oracle.
 */
const f32 = Math.fround;

export interface Df {
	hi: number;
	lo: number;
}

/** Split an f64 into f32 hi + f32 lo with hi + lo ≈ v to ~f64 precision. */
export function splitF32(v: number): Df {
	const hi = f32(v);
	const lo = f32(v - hi);
	return { hi, lo };
}

/**
 * (hi + lo) · b evaluated in f32, mirroring the shader's `hi*b + lo*b`. The
 * separate lo·b term carries the precision the hi·b product alone would drop.
 */
export function mulSplitF32(hi: number, lo: number, b: number): number {
	return f32(f32(hi * b) + f32(lo * b));
}
