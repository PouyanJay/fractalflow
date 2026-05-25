/**
 * WebGL2 fallback backend. Renders a FractalRenderer's GLSL fragment shader on
 * a fullscreen triangle, feeding it a std140 uniform block (mirroring the
 * WebGPU layout) and an optional RG32F data texture — e.g. the perturbation
 * reference orbit, sampled with texelFetch.
 */
import type { FractalRenderer, RenderInput, RenderBackend } from '../types';

const VERTEX_SOURCE = /* glsl */ `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string
): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.warn('[webgl2] shader compile failed:', gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

function compileProgram(gl: WebGL2RenderingContext, fragmentSource: string): WebGLProgram | null {
	const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
	if (!vs || !fs) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.warn('[webgl2] program link failed:', gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		return null;
	}
	return program;
}

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

	const program = compileProgram(gl, renderer.glsl);
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

	return {
		type: 'webgl2',
		resize(width: number, height: number) {
			gl.viewport(0, 0, width, height);
		},
		render(input: RenderInput) {
			renderer.packUniforms(view, input);
			gl.viewport(0, 0, input.width, input.height);
			gl.useProgram(program);
			gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
			gl.bufferSubData(gl.UNIFORM_BUFFER, 0, uniformData);
			gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);

			if (orbitTex && renderer.packData) {
				const data = renderer.packData(input);
				const texels = Math.max(1, Math.floor(data.length / 2));
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, orbitTex);
				gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texels, 1, gl.RG, gl.FLOAT, data);
				if (orbitLoc) gl.uniform1i(orbitLoc, 0);
			}

			gl.bindVertexArray(vao);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.bindVertexArray(null);
		},
		destroy() {
			if (orbitTex) gl.deleteTexture(orbitTex);
			gl.deleteBuffer(ubo);
			gl.deleteVertexArray(vao);
			gl.deleteProgram(program);
		}
	};
}
