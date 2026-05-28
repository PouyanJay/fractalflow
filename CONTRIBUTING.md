# Contributing to Fractal Studio

Thanks for your interest in improving Fractal Studio. This guide covers the local
setup, the day-to-day workflow, and the quality bar every change is held to.

## Prerequisites

- **Node.js ≥ 20** (the repo pins **22** via [`.nvmrc`](.nvmrc); run `nvm use`).
- A browser with **WebGPU** for the full experience — the compute-based art
  styles (Glowing Attractors, Painterly Flames) require it. Everything else
  falls back to **WebGL2** automatically.

## Setup

```sh
make setup     # install dependencies + the Playwright browser used by tests
```

(or `npm install` if you'd rather not use the Makefile).

## Development loop

```sh
make run       # install if needed, then start the dev server with hot reload
```

Run `make` with no arguments to see every available task.

## Quality bar

This project follows **test-driven development** and a strict definition of
done. Before opening a pull request, make sure the full gate passes:

```sh
make verify    # type-check + lint + unit & e2e tests
```

Which is equivalent to:

```sh
make check     # svelte-check / tsc — zero type errors
make lint      # Prettier + ESLint
make test      # Vitest (unit) + Playwright (e2e + visual snapshots)
```

Use `make format` to auto-apply Prettier.

### What we expect in a change

- **Tests first.** Pure logic (scene model, codecs, color/keyframe math, fractal
  references) is covered by Vitest. Each fractal renderer ships a CPU reference
  implementation that the GPU shader is validated against, plus Playwright
  visual snapshots for the rendered output.
- **Fully wired.** No orphan UI, dead handlers, stubbed functions, or leftover
  `TODO`s in the change. Every control mutates real `Scene` state and re-renders.
- **All states designed.** Loading, empty, and error states for every async/GPU
  path; the WebGPU → WebGL2 fallback must keep working.
- **Design system only.** All colour/spacing/radius/type come from the tokens in
  [`src/lib/styles/tokens.css`](src/lib/styles/tokens.css) — no magic numbers or
  one-off hex values. The chrome stays calm; the fractal art supplies the colour.
- **Accessible.** Keyboard-operable, ARIA where needed, AA contrast, and
  `prefers-reduced-motion` respected.

If you change a renderer or shader, update its CPU reference and visual
snapshots together (`make snapshots` regenerates the snapshots).

## Architecture

Start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the `Scene`-centric
design, the renderer plugin model, and the deep-zoom pipeline. New fractal
families are added behind the `Renderer` interface.

## Commits & pull requests

- Keep commits small and focused, with an imperative subject
  (`feat(deep-zoom): …`, `fix(compose): …`).
- Branch off `main`; never commit directly to it.
- Don't commit with failing tests or type errors.
- Describe the user-facing effect and how you verified it in the PR.

## Reproducibility

A `.fflow` document (or share URL) plus the same engine version must produce an
**identical render** — this contract is test-covered. If you touch the scene
model, codec, or any renderer's math, keep the round-trip and determinism tests
green.
