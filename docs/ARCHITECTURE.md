# FractalFlow Studio — Architecture

FractalFlow is a GPU-native, local-first studio for making colorful fractal art.
This document explains how the pieces fit together so you can navigate and extend
the codebase with confidence.

## Guiding principles

1. **One source of truth.** A pure, serializable `Scene` describes everything on
   screen. Every workspace mode reads and writes the _same_ `Scene`.
2. **Renderers are plugins.** Each art style implements a small interface
   (param schema → shader → uniform packing). Adding a fractal family doesn't
   touch the engine.
3. **GPU-first, with a real fallback.** WebGPU is the primary backend; WebGL2 is
   a first-class fallback behind one interface. Compute-only styles degrade to a
   designed "needs WebGPU" state rather than breaking.
4. **The CPU is the oracle.** Every renderer's math has a CPU reference
   implementation that is unit-tested against known values; the GPU shader is
   then validated against that reference. Visual output is locked with Playwright
   snapshots.
5. **Reproducibility is a contract.** The same document (or share URL) plus the
   same engine version produces a byte-faithful render. This is test-covered.

## High-level data flow

```
            ┌──────────────────────────────────────────────┐
            │                    Scene                       │
            │  formula · camera · params · coloring · post   │
            │           (pure, serializable state)           │
            └──────────────────────────────────────────────┘
                 ▲            ▲            ▲            ▲
        Explore  │   Compose  │   Animate  │   Render   │   ← modes are lenses
       (viewport)│ (node graph)│ (timeline)│  (export)  │     over one Scene
                 ▼            ▼            ▼            ▼
            ┌──────────────────────────────────────────────┐
            │            Engine (framework-free)             │
            │   selects a RenderBackend, drives the frame    │
            │              loop, handles resize              │
            └──────────────────────────────────────────────┘
                 │                                  │
        ┌────────▼─────────┐              ┌─────────▼────────┐
        │  WebGPU backend  │   fallback   │  WebGL2 backend  │
        │ (fragment +       │ ───────────▶ │ (fragment only)  │
        │  compute pipelines)│             │                  │
        └──────────────────┘              └──────────────────┘
                 │                                  │
                 └──────────────┬───────────────────┘
                                ▼
                         Renderer plugin
              (WGSL/GLSL shaders + uniform packing,
               mirrored by a CPU reference for tests)
```

## Directory map

The app is **SvelteKit + TypeScript (strict)**, so `src/routes`, `src/lib`,
`src/app.html`, and `static/` follow framework conventions. Within `src/lib`,
code is organized by domain:

```
src/
├── app.html                 HTML shell (favicon, theme-color, meta)
├── app.css                  Global resets + token import
├── routes/                  One route per workspace mode (Explore, Compose…)
└── lib/
    ├── engine/              Framework-free rendering core
    │   ├── types.ts         The Renderer / RenderBackend contracts
    │   ├── engine.ts        Backend selection + frame loop
    │   ├── camera.ts        2D pan/zoom (double-double precision)
    │   ├── dd.ts            Double-double (≈31-digit) arithmetic
    │   ├── capabilities.ts  WebGPU/WebGL2 feature detection
    │   ├── capture.ts       Offscreen frame capture for export
    │   └── backends/        webgpu, webgpu-compute, webgl2 (+ bloom)
    ├── fractals/            Renderer plugins (one folder per art style)
    │   ├── registry.ts      Maps a style id → renderer
    │   ├── palette.ts       Cosine palette presets
    │   ├── post.ts          Warp + colour grade (shared shader snippets)
    │   ├── bloom.ts         HDR mip-pyramid bloom
    │   ├── deep-zoom-2d/    Mandelbrot/Julia/Burning Ship/Tricorn
    │   ├── glowing-attractors/  Strange attractors (WebGPU compute)
    │   ├── painterly-flames/    Fractal flames (WebGPU compute)
    │   └── geometric-3d/    Raymarched mandelbulb
    ├── scene/               Document layer: codec (share URL), presets, bookmarks
    ├── stores/              Svelte 5 rune stores (scene, ui, engine, journey…)
    ├── components/          UI: shell/ (chrome), compose/ (graph nodes),
    │                          engine/ (canvas stage), ui/ (primitives)
    ├── animate/             Keyframe timeline + cinematic "journeys"
    ├── codex/               Human-readable description of the current scene
    ├── compose/             Node-graph model for the Compose workspace
    └── styles/              tokens.css — the single design-token source
```

## The rendering engine

`src/lib/engine/types.ts` defines the contracts:

- **`RenderBackend`** — `resize`, `render(input)`, `destroy`. Implemented by the
  WebGPU and WebGL2 backends. `engine.ts` picks WebGPU when available and falls
  back to WebGL2 otherwise, then drives a `requestAnimationFrame` loop that pulls
  the current `Scene` each frame (so UI edits apply live).
- **`FractalRenderer`** — a discriminated union:
  - `FragmentRenderer` — a full-screen fragment shader (WGSL + GLSL), optionally
    backed by a per-frame data buffer (e.g. a perturbation reference orbit).
    Runs on both backends.
  - `ComputeRenderer` — a WebGPU compute pass that atomically accumulates a
    density/colour grid, then tone-maps it. Used by the particle-based styles
    (attractors, flames). WebGPU-only by design.

Each renderer supplies `packUniforms` (and `packData`) to fill the GPU buffers,
plus the shader source. The shaders **mirror the CPU reference** in `*.ts` next to
them — the reference is the source of truth and the test oracle.

## The four art styles

| Style              | Technique                              | Pipeline |
| ------------------ | -------------------------------------- | -------- |
| Colorful Deep-Zoom | Escape-time + perturbation (see below) | fragment |
| Geometric 3D       | Raymarched mandelbulb distance field   | fragment |
| Glowing Attractors | Clifford/de Jong/Lorenz/Thomas flows   | compute  |
| Painterly Flames   | flam3 chaos game                       | compute  |

The compute styles generate their per-iteration WGSL from the same CPU table
that drives the reference, so the GPU provably mirrors the math.

## Deep zoom (the interesting part)

Naïve escape-time iteration loses all precision once the view is smaller than
`float32` can resolve around an `O(1)` centre (~1e-5). FractalFlow zooms far
past that with a layered approach in `src/lib/fractals/deep-zoom-2d/`:

1. **Perturbation + rebasing.** Compute one high-precision _reference orbit_ at
   the view centre; each pixel iterates a small delta `δ = z − Z` against it.
   Rebasing (Zhuoran's method) keeps `δ` small so a single reference renders the
   whole view without glitches. All four formulas share the increment
   `w = 2·Z·δ + δ²` and differ only in how `δ` is assembled.
2. **Double-double centre.** The view centre is carried in ~31-digit
   double-double precision (`dd.ts`), so the reference orbit is computed for the
   _right_ point past the `float64` wall (~1e10×). Reaches ~1e28× cinematic depth.
3. **Auto-scaling iterations.** Escape times climb with depth, so the iteration
   cap grows automatically (~400/decade) — deep views resolve without manually
   cranking a slider.
4. **Series approximation.** The early iterations, where `δ` is tiny, are
   captured by a Taylor series in `δc` (`δ ≈ A₁·δc + A₂·δc² + A₃·δc³`). The
   shader jumps straight to iteration _N_ instead of iterating from 0 — a ~2×
   speed-up at deep zoom. The skip is chosen conservatively (validated in f32
   against an f64 oracle) so the image stays accurate.

The CPU implementations of all of the above are unit-tested; the WGSL/GLSL
shaders mirror them.

## Post-processing

`post.ts` and `bloom.ts` hold shared shader snippets spliced into every
renderer: a screen-space **warp** (kaleidoscope / mirror), a **colour grade**
(gamma / vignette / grain), and an HDR **bloom** mip-pyramid applied via
render-to-texture before the grade. All parameters live in `scene.post`, so they
save, share, and animate like everything else. The default is a no-op.

## Workspace modes

All four modes are lenses over the one shared `Scene` store:

- **Explore** — interactive viewport; pan/zoom mutate the camera live.
- **Compose** — a Svelte Flow node graph (`Source → Warp → Coloring → Post-FX →
Output`) editing the scene with a live preview.
- **Animate** — a keyframe timeline; `animate/timeline.ts` interpolates scene
  fields (geometric/log-lerp for zoom, double-double-aware for deep centres).
- **Render** — exports the active renderer (including WebGPU compute) to a PNG or
  a zoom-movie frame sequence / video.

## Reproducibility & the document model

`scene/codec.ts` encodes a `Scene` into a compact, URL-safe token (the `?s=`
share parameter), trimming default fields and carrying the double-double centre
tails only when the zoom is deep enough to need them. Decoding is defensive and
backward-compatible. The round-trip and determinism are covered by tests — the
same token always restores the same scene, and the same scene always renders the
same image.

## Testing strategy

- **Vitest** (node) for all pure logic: scene model, codec round-trips, palette
  and keyframe math, and the fractal CPU references against known values.
- **Vitest** (browser) for component logic.
- **Playwright** for end-to-end flows and **visual snapshots** of the rendered
  output (the snapshot _is_ the test for shader output). Always tested at
  `deviceScaleFactor: 2` as well, to catch retina layout regressions.

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for how to run each gate.
