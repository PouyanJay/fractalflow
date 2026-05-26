/**
 * Small WebGL2 program helpers shared by the scene backend (webgl2.ts) and the
 * bloom pyramid (webgl2-bloom.ts): compile a shader and link a vertex+fragment
 * program from source, logging failures under a caller-supplied `tag`.
 */

export function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	tag: string
): WebGLShader | null {
	const shader = gl.createShader(type);
	if (!shader) return null;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.warn(`${tag} shader compile failed:`, gl.getShaderInfoLog(shader));
		gl.deleteShader(shader);
		return null;
	}
	return shader;
}

export function linkProgram(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string,
	tag: string
): WebGLProgram | null {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, tag);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, tag);
	if (!vs || !fs) return null;
	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.warn(`${tag} program link failed:`, gl.getProgramInfoLog(program));
		gl.deleteProgram(program);
		return null;
	}
	return program;
}
