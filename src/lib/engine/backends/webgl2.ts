/**
 * WebGL2 fallback backend. Renders a FractalRenderer's GLSL fragment shader on
 * an attributeless fullscreen triangle, feeding it a std140 uniform block that
 * mirrors the WebGPU layout (so both backends share renderer.packUniforms).
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
	renderer: FractalRenderer
): RenderBackend | null {
	const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
	if (!gl) return null;

	const program = compileProgram(gl, renderer.glsl);
	if (!program) return null;

	const vao = gl.createVertexArray();
	const ubo = gl.createBuffer();
	gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
	gl.bufferData(gl.UNIFORM_BUFFER, renderer.uniformSize, gl.DYNAMIC_DRAW);

	const blockIndex = gl.getUniformBlockIndex(program, 'Uniforms');
	if (blockIndex !== 0xffffffff) {
		gl.uniformBlockBinding(program, blockIndex, 0);
	}
	gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);

	const data = new ArrayBuffer(renderer.uniformSize);
	const view = new DataView(data);

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
			gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
			gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
			gl.bindVertexArray(vao);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.bindVertexArray(null);
		},
		destroy() {
			gl.deleteBuffer(ubo);
			gl.deleteVertexArray(vao);
			gl.deleteProgram(program);
		}
	};
}
