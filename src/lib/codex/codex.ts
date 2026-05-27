/**
 * The Codex: turns the current scene into human-readable narration for Explore's
 * right panel — what you're looking at, and (for the Mandelbrot) which famous
 * landmark you're near. Pure and framework-free so it's trivially testable.
 */
import type { ArtStyleId } from '$lib/stores/ui-logic';
import type { FormulaId, SceneState } from '$lib/engine/types';

export interface SceneDescription {
	title: string;
	body: string;
	/** The defining iteration / construction (shown in Compose's guide). */
	math?: string;
	/** Where this fractal shows up beyond art. */
	applications?: string;
	/** Practical advice for authoring a good-looking result here. */
	tips?: string;
}

const FORMULA_TEXT: Record<FormulaId, SceneDescription> = {
	mandelbrot: {
		title: 'Mandelbrot',
		body: 'The Mandelbrot set — iterate z → z² + c and keep the c that never escape. Its boundary is endlessly intricate, the same motifs recurring at every scale.',
		math: 'Start z₀ = 0 and iterate zₙ₊₁ = zₙ² + c, where c is the pixel’s complex coordinate. If the orbit stays bounded (|z| ≤ 2 forever) the point is in the set; otherwise it is shaded by how fast it escapes.',
		applications:
			'The emblem of complex dynamics and chaos theory — used to teach iteration and self-similarity, and as a workhorse for generative art and procedural texturing.',
		tips: 'Keep iterations low for a soft, poster-like boundary; raise them to resolve the filigree as you zoom deeper. Try a Kaleidoscope warp for symmetry, or a little Bloom to make bright bands glow.'
	},
	julia: {
		title: 'Julia set',
		body: 'A Julia set — fix c and vary the starting z. It is connected exactly when that c lies inside the Mandelbrot set; the seed shapes the whole filigree.',
		math: 'Fix a constant c and iterate zₙ₊₁ = zₙ² + c from each pixel’s z₀. The filled Julia set is the z₀ whose orbits stay bounded; the set is connected iff c lies in the Mandelbrot set.',
		applications:
			'A classic demonstration of sensitive dependence on a parameter: sweeping the seed c morphs the shape continuously, which makes it a natural design control.',
		tips: 'Edit the Julia seed (Re / Im) in the Source node. Seeds just inside the Mandelbrot boundary give the richest, most lace-like sets; seeds outside it shatter into dust.'
	},
	'burning-ship': {
		title: 'Burning Ship',
		body: 'The Burning Ship — fold z by its absolute value each step. The result reads like fractal hulls ablaze on a dark sea.',
		math: 'Iterate zₙ₊₁ = (|Re zₙ| + i·|Im zₙ|)² + c. Taking absolute values each step makes the map non-analytic, breaking the Mandelbrot’s smooth symmetry into angular, ship-like hulls.',
		applications:
			'A well-known “modified Mandelbrot” used to study how small changes to an iteration formula reshape its dynamics.',
		tips: 'Pan along the real axis below the main body to find the namesake ships, then raise iterations to sharpen their rigging.'
	},
	tricorn: {
		title: 'Tricorn',
		body: 'The Tricorn (Mandelbar) — conjugate z each iteration. Its three-fold symmetry gives the boundary a faceted, anti-holomorphic character.',
		math: 'Iterate zₙ₊₁ = z̄ₙ² + c, conjugating z each step. The map is anti-holomorphic, which produces the characteristic three-fold symmetry.',
		applications:
			'Studied as the “Mandelbar” — a standard example of an anti-holomorphic dynamical system and its period-doubling behaviour.',
		tips: 'Zoom the cusps where the three lobes meet for the most faceted detail; higher iterations crisp up the edges.'
	},
	celtic: {
		title: 'Celtic',
		body: 'The Celtic Mandelbrot — fold only the real part of z² with an absolute value. The cardioid splits into knotwork-like loops reminiscent of Celtic braids.',
		math: 'Iterate zₙ₊₁ = (|Re(zₙ²)| + i·Im(zₙ²)) + c — i.e. Re ← |x²−y²| + cₓ, Im ← 2xy + c_y. Folding the real part alone breaks the smooth symmetry into rounded, interlocking lobes.',
		applications:
			'One of the classic “abs-variant” Mandelbrots used to explore how a single folded term reshapes escape-time dynamics.',
		tips: 'Explore along the real axis where the lobes interlock; a symmetric palette plays up the knotwork.'
	},
	buffalo: {
		title: 'Buffalo',
		body: 'The Buffalo fractal — fold the real part like the Celtic and the cross term like the Burning Ship. The silhouette suggests a buffalo’s horned head.',
		math: 'Re ← |x²−y²| + cₓ, Im ← 2|xy| + c_y. Combining both folds yields sharp, horn-like protrusions with angular interior structure.',
		applications:
			'A composite abs-variant studied alongside the Burning Ship for its angular, non-analytic boundary.',
		tips: 'Drop below the main body and pan the “horns”; higher iterations sharpen the spines.'
	},
	perpendicular: {
		title: 'Perpendicular',
		body: 'The Perpendicular Mandelbrot — fold the real part of z inside the cross term only. The set leans into an asymmetric, blade-like form.',
		math: 'Re ← x²−y² + cₓ, Im ← 2|x|·y + c_y. The absolute value on x alone removes the left–right symmetry, tilting the familiar bulbs.',
		applications:
			'A standard member of the abs-variant family, illustrating how asymmetric folding distorts the bulb structure.',
		tips: 'Look for the leaning seahorse-like valleys along the boundary; raise iterations to resolve them.'
	},
	'perpendicular-ship': {
		title: 'Perpendicular Ship',
		body: 'The Perpendicular Burning Ship — fold the imaginary part of z inside the cross term. A leaner, more skeletal cousin of the Burning Ship.',
		math: 'Re ← x²−y² + cₓ, Im ← 2x·|y| + c_y. Folding y alone gives sharp masts and a sparser, rigging-like lattice.',
		applications:
			'Used with the Burning Ship to compare how folding different components reshapes the same base map.',
		tips: 'Hunt the antenna region for delicate mini-ships, then sharpen with more iterations.'
	},
	'celtic-mandelbar': {
		title: 'Celtic Mandelbar',
		body: 'The Celtic Mandelbar — the Celtic real fold combined with the Tricorn’s conjugation. Faceted, three-fold knotwork.',
		math: 'Re ← |x²−y²| + cₓ, Im ← −2xy + c_y. Conjugating the cross term adds the Tricorn’s anti-holomorphic facets to the Celtic loops.',
		applications:
			'A hybrid abs-variant showcasing how stacking folds compounds their symmetry-breaking effects.',
		tips: 'Zoom the faceted cusps where the lobes meet; a high-contrast palette emphasises the facets.'
	},
	multibrot: {
		title: 'Multibrot',
		body: 'The Multibrot set — the Mandelbrot generalised to any exponent. Raising the power adds lobes: a degree-d set has d−1 fold rotational symmetry.',
		math: 'Iterate zₙ₊₁ = zₙᵈ + c with z₀ = 0 and a real exponent d (d = 2 is the Mandelbrot). The power uses the polar form zᵈ = rᵈ·(cos dθ + i·sin dθ), so even fractional exponents render.',
		applications:
			'A standard generalisation used to study how the degree of an iterated polynomial controls the number and arrangement of its bulbs.',
		tips: 'Set the exponent in the Source node — integers 3–8 give clean 2-, 3-, …, 7-fold flowers; fractional powers warp them into asymmetric blooms.'
	},
	newton: {
		title: 'Newton',
		body: 'The Newton fractal for z³ = 1 — colour each point by which of the three roots Newton’s method carries it to. The basin boundaries are a fractal lacework.',
		math: 'From z₀ = the pixel, iterate Newton’s method zₙ₊₁ = zₙ − (zₙ³ − 1)/(3zₙ²). Almost every start converges to one of the three cube roots of unity; the hue marks the root and the shading the convergence speed.',
		applications:
			'The classic picture of a root-finding method’s basins of attraction — a staple example of chaos on the boundary between deterministic outcomes.',
		tips: 'There is no “inside” here — the whole plane is coloured. Zoom the seams where the three basins meet for infinitely nested detail.'
	},
	phoenix: {
		title: 'Phoenix',
		body: 'The Phoenix set — like a Julia, but each step also feels the *previous* z. That memory term twists the filaments into swirling, feathered plumes.',
		math: 'Iterate zₙ₊₁ = zₙ² + c + p·zₙ₋₁ from z₀ = the pixel and z₋₁ = 0, with real constant c and real coupling p (here c = seed Re, p = seed Im). p = 0 collapses to a real-seed Julia.',
		applications:
			'Introduced by Shigehiro Ushiki as a higher-order map; studied for how a second-order recurrence enriches the dynamics over the classic quadratic.',
		tips: 'Set c (Re) and p (Im) in the Source node — the famous plumes appear around c ≈ 0.5667, p ≈ −0.5. A flip to the imaginary axis is conventional for this one.'
	},
	lyapunov: {
		title: 'Lyapunov',
		body: 'The Markus–Lyapunov fractal — not escape-time at all. Each point is a pair of growth rates (a, b) for the logistic map, coloured by whether that rhythm settles into order or tips into chaos.',
		math: 'Iterate x ← r·x·(1−x), drawing r from the fixed sequence A,B,A,B… (A→a, B→b), and average ln|r·(1−2x)| → the Lyapunov exponent λ. λ < 0 (ordered) is shaded by the palette; λ > 0 (chaotic) falls to black. The seed is the critical point x₀ = 0.5, so periodic windows turn superstable and richly dark.',
		applications:
			'Lyapunov exponents are the standard measure of chaos — sensitivity to initial conditions — across dynamical systems, from population biology to circuits and climate.',
		tips: 'The plane is logistic-rate space, not the complex plane: pan around (a, b) ∈ [2, 4]² to find the “swallow” curves. Raise iterations to sharpen the order/chaos boundary; a green or gold palette suits the ordered filaments.'
	},
	apollonian: {
		title: 'Apollonian Gasket',
		body: 'The Apollonian gasket — a fractal packing of circles, each snug in the curved gaps between three others, nested forever. Rendered here by folding and inverting the plane rather than iterating a polynomial.',
		math: 'Repeatedly fold the point into the unit cell [−1, 1]² — a lattice of mutually tangent circles — then invert it in the unit circle, tracking the accumulated scale. The orbit-trap |p|/scale is small along the circle net, lighting up the recursive packing.',
		applications:
			'Apollonian packings link geometry to number theory (integer curvatures via Descartes’ Circle Theorem) and model foams, granular packing and conformal tilings.',
		tips: 'Zoom into any triple of kissing circles — the same packing recurs at every scale. A touch of Bloom makes the net glow; cool palettes read it as fine filigree.'
	}
};

const STYLE_TEXT: Record<Exclude<ArtStyleId, 'deep-zoom-2d'>, SceneDescription> = {
	'geometric-3d': {
		title: 'Mandelbulb',
		body: 'A raymarched Mandelbulb — an escape-time fractal lifted into 3D and lit like a sculpture. Orbit and dolly to read its surface.',
		math: 'A 3D analogue of the Mandelbrot using a spherical-coordinate power map zₙ₊₁ = zₙⁿ + c (typically n = 8). It is rendered by raymarching a distance estimator rather than per-pixel iteration.',
		applications:
			'A showcase for distance-field / signed-distance rendering — the same technique behind much procedural shader art and demoscene work.',
		tips: 'Orbit and dolly in Explore to catch the light. Raise Detail to deepen the surface; add Bloom for a soft sculptural glow.'
	},
	attractors: {
		title: 'Glowing Attractor',
		body: 'A strange attractor — a single chaotic orbit traced for millions of steps, its visited points accumulated into a luminous cloud.',
		math: 'Iterate a chaotic map (Clifford, de Jong) or integrate an ODE flow (Lorenz, Thomas) for millions of steps, accumulate how often each pixel is visited, then tone-map that density logarithmically.',
		applications:
			'Strange attractors are the geometry of deterministic chaos — models for weather, turbulence, electronic oscillators and population dynamics.',
		tips: 'Raise Exposure to coax out faint filaments without blowing the core; Bloom makes the dense centre glow like long-exposure light.'
	},
	flames: {
		title: 'Painterly Flame',
		body: 'A fractal flame — the chaos game over a set of affine + variation transforms, with colour accumulated along the orbit.',
		math: 'Run the chaos game over a weighted set of affine maps, each composed with nonlinear “variation” functions, accumulating a colour channel along the orbit (Scott Draves’ fractal-flame algorithm).',
		applications:
			'The algorithm behind Electric Sheep and a staple of generative art; also a vivid demonstration of iterated function systems (IFS).',
		tips: 'Pick a flame in the Source node, then pair a warm palette with a touch of Bloom for a painterly, lit-from-within look.'
	},
	ifs: {
		title: 'Iterated Function System',
		body: 'An IFS attractor — a handful of contractive affine maps played as a chaos game. Famous fractals like the Barnsley fern, Sierpiński triangle and Heighway dragon are each just a few such maps.',
		math: 'Seed a point, then repeatedly pick one of the affine maps at random — weighted by its probability — and apply it. The orbit converges onto the system’s unique attractor regardless of where it started (Hutchinson’s theorem); density and a per-map colour accumulate.',
		applications:
			'IFS is the mathematics behind procedural plants and terrains, fractal image compression, and a canonical demonstration that simple contraction maps encode intricate self-similar shapes.',
		tips: 'Choose a system in the Source node. Raise Exposure to coax out the faint outer fronds; a green-to-gold palette suits the fern, a cool palette the dragon.'
	}
};

const GENERIC: SceneDescription = {
	title: 'Fractal',
	body: 'Pick an art style in the Start palette to explore a fractal here.'
};

/** Per-shape narration for the Geometric 3D renderer (chosen in the Source node). */
const SHAPE_TEXT: Record<NonNullable<SceneState['geometricShape']>, SceneDescription> = {
	mandelbulb: STYLE_TEXT['geometric-3d'],
	mandelbox: {
		title: 'Mandelbox',
		body: 'The Mandelbox — a box-folding cousin of the Mandelbulb. Alternating reflections and sphere inversions build cathedral-like recursive architecture.',
		math: 'Iterate z ← scale·s(b(z)) + c, where b box-folds each component about ±1 and s sphere-inverts inside a radius. Rendered by raymarching the folded distance estimate.',
		applications:
			'A favourite of distance-field demoscene art for its endless “alien architecture”; a clear study of how folding maps generate structure.',
		tips: 'Orbit slowly — the box reveals corridors and halls. Lower Detail for a cleaner read; Bloom lifts the lit edges.'
	},
	menger: {
		title: 'Menger Sponge',
		body: 'The Menger sponge — a cube with square tunnels bored through every face, repeated at every scale. A 3-D Cantor/Sierpiński set.',
		math: 'Start from a cube and, at each level, remove the central cross of 7 of 27 sub-cubes; the limit has zero volume and infinite surface. Raymarched by an exact folded box estimate.',
		applications:
			'A textbook fractal of Hausdorff dimension log20/log3 ≈ 2.73 — used to teach self-similarity and as a metamaterial/antenna geometry.',
		tips: 'Orbit to look down the tunnels; a high-contrast palette makes the depth pop.'
	},
	juliabulb: {
		title: 'Juliabulb',
		body: 'The Juliabulb — the Mandelbulb’s Julia twin: the same power map, but every point follows a single fixed constant, growing coral-like bulbs and florets.',
		math: 'Iterate zₙ₊₁ = zₙⁿ + c (spherical-coordinate power map, n = 8) from z₀ = the pixel with a fixed 3D constant c, raymarching the distance estimate.',
		applications:
			'Shows how fixing the additive constant turns the Mandelbulb parameter space into a family of organic Julia solids.',
		tips: 'Orbit to catch light in the florets; Bloom gives the bulbs a soft, lit-from-within glow.'
	},
	'quaternion-julia': {
		title: 'Quaternion Julia',
		body: 'A quaternion Julia set — the classic z² + c iteration carried out in 4D quaternion algebra, then sliced into 3D. Smooth, swirling, liquid-metal forms.',
		math: 'Iterate z ← z² + c with z, c ∈ ℍ (quaternions); the rendered solid is a 3D slice (4th coordinate fixed). The Hubbard distance estimate uses the running derivative.',
		applications:
			'The historic first “true 3D” fractal (Norton, 1982); a standard demonstration of hypercomplex dynamics.',
		tips: 'Orbit to read the folds; pair with a metallic palette and a little Bloom for a chrome look.'
	}
};

/** A one-line title + paragraph describing the active scene. */
export function describeScene(style: ArtStyleId | null, scene: SceneState): SceneDescription {
	if (style === 'deep-zoom-2d') return FORMULA_TEXT[scene.formula];
	if (style === 'geometric-3d') return SHAPE_TEXT[scene.geometricShape ?? 'mandelbulb'];
	if (style && style in STYLE_TEXT) return STYLE_TEXT[style as keyof typeof STYLE_TEXT];
	return GENERIC;
}

export interface Landmark {
	id: string;
	label: string;
	center: { x: number; y: number };
	/** You're "in" the landmark when the view centre is within this radius of it. */
	radius: number;
}

/** Famous Mandelbrot regions, with a capture radius around each centre. */
export const LANDMARKS: readonly Landmark[] = [
	{
		id: 'seahorse-valley',
		label: 'Seahorse Valley',
		center: { x: -0.745, y: 0.113 },
		radius: 0.06
	},
	{ id: 'elephant-valley', label: 'Elephant Valley', center: { x: 0.275, y: 0.006 }, radius: 0.06 },
	{
		id: 'triple-spiral',
		label: 'Triple Spiral Valley',
		center: { x: -0.0885, y: 0.6565 },
		radius: 0.03
	},
	{ id: 'scepter-valley', label: 'Scepter Valley', center: { x: -1.3618, y: 0 }, radius: 0.025 },
	{ id: 'mini-mandelbrot', label: 'Mini Mandelbrot', center: { x: -1.7497, y: 0 }, radius: 0.02 }
] as const;

/**
 * The named Mandelbrot region the view centre currently sits inside, or null.
 * Only meaningful for the Deep-Zoom Mandelbrot — other formulas/styles have no
 * landmark table.
 */
export function nearestLandmark(style: ArtStyleId | null, scene: SceneState): Landmark | null {
	if (style !== 'deep-zoom-2d' || scene.formula !== 'mandelbrot') return null;
	const { centerX, centerY } = scene.camera;
	let best: Landmark | null = null;
	let bestDist = Infinity;
	for (const l of LANDMARKS) {
		const d = Math.hypot(l.center.x - centerX, l.center.y - centerY);
		if (d <= l.radius && d < bestDist) {
			best = l;
			bestDist = d;
		}
	}
	return best;
}
