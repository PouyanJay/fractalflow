import { describe, it, expect } from 'vitest';
import { ifsRenderer } from './ifs/renderer';
import { attractorsRenderer } from './glowing-attractors/renderer';
import { flamesRenderer } from './painterly-flames/renderer';
import { mandelbulbRenderer } from './geometric-3d/renderer';
import { mandelbrotRenderer } from './deep-zoom-2d/renderer';

/**
 * WGSL reserves a set of words "for future use" — using one as an identifier
 * (e.g. a struct field named `meta`) fails to compile, and since WebGPU isn't
 * available in this test environment that surfaces only as a silent
 * "needs WebGPU" fallback at runtime. This guard scans every renderer's WGSL so
 * such a collision fails a unit test instead. (List from the WGSL spec.)
 */
const RESERVED = new Set(
	`NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become
	binding_array cast catch class co_await co_return co_yield coherent column_major common compile
	compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete
	demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough
	filter final finally friend from fxgroup get goto groupshared highp impl implements import inline
	instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable
	namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null
	nullptr of operator package packoffset partition pass patch pixelfragment precise precision
	premerge priv protected pub public readonly ref regardless register reinterpret_cast require
	resource restrict self set shared sizeof smooth snorm static static_assert static_cast std
	subroutine super target template this thread_local throw trait try type typedef typeid typename
	typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl while writeonly yield`
		.split(/\s+/)
		.filter(Boolean)
);

/** Strip line and block comments so words in prose don't trip the scan. */
const stripComments = (src: string): string =>
	src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const renderers = [
	['ifs', ifsRenderer.wgsl],
	['attractors', attractorsRenderer.wgsl],
	['flames', flamesRenderer.wgsl],
	['geometric-3d', mandelbulbRenderer.wgsl],
	['deep-zoom-2d', mandelbrotRenderer.wgsl]
] as const;

describe('WGSL uses no reserved keywords as identifiers', () => {
	for (const [name, wgsl] of renderers) {
		it(`${name} WGSL is free of reserved words`, () => {
			const hits = new Set<string>();
			for (const tok of stripComments(wgsl).matchAll(/[A-Za-z_]\w*/g)) {
				if (RESERVED.has(tok[0])) hits.add(tok[0]);
			}
			expect([...hits]).toEqual([]);
		});
	}
});
