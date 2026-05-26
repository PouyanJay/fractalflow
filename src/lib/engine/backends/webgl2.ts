/**
 * WebGL2 fallback backend. Renders a FractalRenderer's GLSL fragment shader on
 * a fullscreen triangle, feeding it a std140 uniform block (mirroring the
 * WebGPU layout) and an optional RG32F data texture — e.g. the perturbation
 * reference orbit, sampled with texelFetch.
 */
import type { FractalRenderer, RenderInput, RenderBackend } from '../types';
import { createWebGL2Bloom } from './webgl2-bloom';
import { withBloomDisabled } from '$lib/fractals/bloom';
import { linkProgram } from './gl-program';

const VERTEX_SOURCE = /* glsl */ `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function createWebGL2Backend(
	canvas: HTMLCanvasElement,
	renderer: FractalRenderer,
	options: { preserveDrawingBuffer?: boolean } = {}
): RenderBackend | null {
	// Compute-pipeline renderers (particle accumulation) are WebGPU-only; signal
	// no support so the engine surfaces a "requires WebGPU" state.
	if (renderer.pipeline === 'compute') return null;

	const gl = canvas.getContext('webgl2', {
		antialias: false,
		alpha: false,
		// Off-screen export keeps the buffer readable for toBlob().
		preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
	});
	if (!gl) return null;

	const program = linkProgram(gl, VERTEX_SOURCE, renderer.glsl, '[webgl2]');
	if (!program) return null;

	const vao = gl.createVertexArray();
	const ubo = gl.createBuffer();
	gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
	gl.bufferData(gl.UNIFORM_BUFFER, renderer.uniformSize, gl.DYNAMIC_DRAW);
	const blockIndex = gl.getUniformBlockIndex(program, 'Uniforms');
	if (blockIndex !== 0xffffffff) gl.uniformBlockBinding(program, blockIndex, 0);
	gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);

	// Optional data texture (e.g. perturbation reference orbit), RG32F, one row.
	let orbitTex: WebGLTexture | null = null;
	const orbitLoc = gl.getUniformLocation(program, 'uOrbit');
	if (renderer.dataBufferSize) {
		const width = renderer.dataBufferSize / 8; // RG f32 = 8 bytes/texel
		orbitTex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, orbitTex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, width, 1, 0, gl.RG, gl.FLOAT, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	const uniformData = new ArrayBuffer(renderer.uniformSize);
	const view = new DataView(uniformData);

	// Optional bloom pyramid; if its programs fail to build, the backend renders
	// the direct path and bloom simply doesn't apply.
	const bloom = createWebGL2Bloom(gl);

	const drawScene = (packInput: RenderInput) => {
		renderer.packUniforms(view, packInput);
		gl.viewport(0, 0, packInput.width, packInput.height);
		gl.useProgram(program);
		gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
		gl.bufferSubData(gl.UNIFORM_BUFFER, 0, uniformData);
		gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);

		if (orbitTex && renderer.packData) {
			const data = renderer.packData(packInput);
			const texels = Math.max(1, Math.floor(data.length / 2));
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, orbitTex);
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texels, 1, gl.RG, gl.FLOAT, data);
			if (orbitLoc) gl.uniform1i(orbitLoc, 0);
		}

		gl.bindVertexArray(vao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	};

	return {
		type: 'webgl2',
		resize(width: number, height: number) {
			gl.viewport(0, 0, width, height);
		},
		render(input: RenderInput) {
			const useBloom = !!bloom && input.scene.post.bloom > 0;
			if (useBloom && bloom) {
				bloom.resize(input.width, input.height);
				gl.bindFramebuffer(gl.FRAMEBUFFER, bloom.sceneFramebuffer());
				drawScene(input); // post.bloom > 0 → ffPost emits raw colour
				bloom.run(input.scene.post);
			} else {
				// Bloom requested but unavailable → clear bloomActive so the grade runs.
				const packInput = input.scene.post.bloom > 0 ? withBloomDisabled(input) : input;
				gl.bindFramebuffer(gl.FRAMEBUFFER, null);
				drawScene(packInput);
			}
		},
		destroy() {
			bloom?.destroy();
			if (orbitTex) gl.deleteTexture(orbitTex);
			gl.deleteBuffer(ubo);
			gl.deleteVertexArray(vao);
			gl.deleteProgram(program);
		}
	};
}
