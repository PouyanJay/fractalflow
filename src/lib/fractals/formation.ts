/**
 * Shared Formation helpers for the particle-accumulation art styles (Glowing
 * Attractors, Painterly Flames). A Formation journey ramps the scene's
 * `formation` 0→1; these styles "trace the orbit" by plotting only a growing
 * prefix of each particle's contiguous trajectory, so directional strokes
 * lengthen and brighten until the full attractor settles in at formation = 1.
 * Pure and framework-free.
 */

/**
 * How many of a particle's `fullSteps` orbit points to plot at the given
 * Formation progress. Fully formed (absent or ≥1) plots them all; otherwise a
 * fraction, never below 1 so every particle still draws its leading point.
 */
export function revealedSteps(formation: number | undefined, fullSteps: number): number {
	const f = formation ?? 1;
	if (f >= 1) return fullSteps;
	if (f <= 0) return 1;
	return Math.max(1, Math.round(f * fullSteps));
}
