/**
 * WebGL2 fallback backend. Draws a calm, dark test pattern via an
 * attributeless fullscreen triangle — enough to prove the pipeline (program,
 * uniforms, animated frame loop) end to end until real fractal renderers land.
 */
import type { FrameState, RenderBackend } from '../types';

const VERTEX_SOURCE = /* glsl */ `#version 300 es
void main() {
	// Fullscreen triangle from gl_VertexID — no vertex buffers needed.
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
out vec4 fragColor;
void main() {
	vec2 uv = gl_FragCoord.xy / uResolution;
	float d = distance(uv, vec2(0.5));
	float glow = smoothstep(0.95, 0.05, d);
	float pulse = 0.5 + 0.5 * sin(uTime * 0.0006);
	vec3 base = vec3(0.043, 0.055, 0.075);
	vec3 accent = vec3(0.176, 0.831, 0.749);
	vec3 col = mix(base, accent * 0.16, glow * (0.55 + 0.25 * pulse));
	fragColor = vec4(col, 1.0);
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

function compileProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
	const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
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

export function createWebGL2Backend(canvas: HTMLCanvasElement): RenderBackend | null {
	const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
	if (!gl) return null;

	const program = compileProgram(gl);
	if (!program) return null;

	const uResolution = gl.getUniformLocation(program, 'uResolution');
	const uTime = gl.getUniformLocation(program, 'uTime');
	const vao = gl.createVertexArray();

	return {
		type: 'webgl2',
		resize(width: number, height: number) {
			gl.viewport(0, 0, width, height);
		},
		render(frame: FrameState) {
			gl.viewport(0, 0, frame.width, frame.height);
			gl.useProgram(program);
			gl.bindVertexArray(vao);
			gl.uniform2f(uResolution, frame.width, frame.height);
			gl.uniform1f(uTime, frame.timeMs);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
			gl.bindVertexArray(null);
		},
		destroy() {
			gl.deleteVertexArray(vao);
			gl.deleteProgram(program);
		}
	};
}
