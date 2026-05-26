/**
 * WebGL2 bloom pyramid — the fallback-backend counterpart to webgpu-bloom. The
 * owning backend ($lib/.../webgl2.ts) renders its scene into `sceneFramebuffer()`
 * (an offscreen colour texture), then calls `run()` to do the bright-pass →
 * downsample → upsample → composite, writing the final graded image to the
 * canvas. Also drives bloom in off-screen PNG export (capture.ts renders frags
 * through WebGL2). Maths/GLSL come from $lib/fractals/bloom; the grade from post.
 */
import type { PostSettings } from '../types';
import {
	BLOOM_GLSL_VS,
	BLOOM_GLSL_PREFILTER_FS,
	BLOOM_GLSL_DOWNSAMPLE_FS,
	BLOOM_GLSL_UPSAMPLE_FS,
	compositeGlslFs,
	BLOOM_UNIFORM_SIZE,
	packBloomUniform,
	mipLevelCount
} from '$lib/fractals/bloom';
import { GRADE_GLSL_FN } from '$lib/fractals/post';
import { linkProgram } from './gl-program';

interface Target {
	tex: WebGLTexture;
	fbo: WebGLFramebuffer;
	w: number;
	h: number;
}

export interface WebGL2Bloom {
	resize(width: number, height: number): void;
	/** Framebuffer the backend renders its (ungraded) scene into. */
	sceneFramebuffer(): WebGLFramebuffer;
	/** Run the pyramid + composite to the canvas (the default framebuffer). */
	run(post: PostSettings): void;
	destroy(): void;
}

/** Link a bloom program (shared VS + given FS) and wire its UBO + sampler units. */
function link(gl: WebGL2RenderingContext, fs: string): WebGLProgram | null {
	const p = linkProgram(gl, BLOOM_GLSL_VS, fs, '[webgl2-bloom]');
	if (!p) return null;
	// Bind the std140 BloomU block to binding 0 and the two samplers to units 0/1.
	const block = gl.getUniformBlockIndex(p, 'BloomU');
	if (block !== 0xffffffff) gl.uniformBlockBinding(p, block, 0);
	gl.useProgram(p);
	const src = gl.getUniformLocation(p, 'uSrc');
	if (src) gl.uniform1i(src, 0);
	const scene = gl.getUniformLocation(p, 'uScene');
	if (scene) gl.uniform1i(scene, 1);
	return p;
}

export function createWebGL2Bloom(gl: WebGL2RenderingContext): WebGL2Bloom | null {
	// Prefer an HDR target (values >1 for the bright pass); fall back to 8-bit.
	const floatRenderable = !!gl.getExtension('EXT_color_buffer_float');
	const internalFormat = floatRenderable ? gl.RGBA16F : gl.RGBA8;
	const texType = floatRenderable ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

	const prefilter = link(gl, BLOOM_GLSL_PREFILTER_FS);
	const downsample = link(gl, BLOOM_GLSL_DOWNSAMPLE_FS);
	const upsample = link(gl, BLOOM_GLSL_UPSAMPLE_FS);
	const composite = link(gl, compositeGlslFs(GRADE_GLSL_FN));
	if (!prefilter || !downsample || !upsample || !composite) return null;

	const ubo = gl.createBuffer();
	gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
	gl.bufferData(gl.UNIFORM_BUFFER, BLOOM_UNIFORM_SIZE, gl.DYNAMIC_DRAW);

	const vao = gl.createVertexArray();
	const uniformData = new ArrayBuffer(BLOOM_UNIFORM_SIZE);
	const uniformView = new DataView(uniformData);

	let scene: Target | null = null;
	let mips: Target[] = [];
	let gridW = 0;
	let gridH = 0;

	function makeTarget(w: number, h: number): Target | null {
		const tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, gl.RGBA, texType, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		const fbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
		const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		if (!ok) {
			gl.deleteTexture(tex);
			gl.deleteFramebuffer(fbo);
			return null;
		}
		return { tex, fbo, w, h };
	}

	function freeTargets() {
		if (scene) {
			gl.deleteTexture(scene.tex);
			gl.deleteFramebuffer(scene.fbo);
		}
		scene = null;
		for (const m of mips) {
			gl.deleteTexture(m.tex);
			gl.deleteFramebuffer(m.fbo);
		}
		mips = [];
	}

	function allocate(width: number, height: number): boolean {
		freeTargets();
		scene = makeTarget(width, height);
		if (!scene) return false;
		const n = mipLevelCount(width, height);
		for (let i = 0; i < n; i++) {
			const t = makeTarget(
				Math.max(1, Math.floor(width / 2 ** (i + 1))),
				Math.max(1, Math.floor(height / 2 ** (i + 1)))
			);
			if (!t) return false;
			mips.push(t);
		}
		gridW = width;
		gridH = height;
		return true;
	}

	function setUniform(srcTexelW: number, srcTexelH: number, post: PostSettings) {
		packBloomUniform(uniformView, srcTexelW, srcTexelH, post);
		gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
		gl.bufferSubData(gl.UNIFORM_BUFFER, 0, uniformData);
		gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
	}

	/** Draw the bound program into `dst` sampling `srcTex` (and optional scene). */
	function pass(
		program: WebGLProgram,
		dst: Target | null,
		srcTex: WebGLTexture,
		w: number,
		h: number,
		sceneTex?: WebGLTexture
	) {
		gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
		gl.viewport(0, 0, w, h);
		gl.useProgram(program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, srcTex);
		if (sceneTex) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, sceneTex);
		}
		gl.bindVertexArray(vao);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
		gl.bindVertexArray(null);
	}

	return {
		resize(width: number, height: number) {
			if (width !== gridW || height !== gridH || !scene) allocate(width, height);
		},
		sceneFramebuffer() {
			if (!scene) throw new Error('createWebGL2Bloom: call resize() before sceneFramebuffer()');
			return scene.fbo;
		},
		run(post: PostSettings) {
			if (!scene || mips.length === 0) return;
			gl.disable(gl.BLEND);

			// Bright pass: scene → mip0.
			setUniform(1 / scene.w, 1 / scene.h, post);
			pass(prefilter, mips[0], scene.tex, mips[0].w, mips[0].h);

			// Downsample chain.
			for (let i = 0; i < mips.length - 1; i++) {
				setUniform(1 / mips[i].w, 1 / mips[i].h, post);
				pass(downsample, mips[i + 1], mips[i].tex, mips[i + 1].w, mips[i + 1].h);
			}

			// Upsample chain, accumulating with additive blend.
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE);
			for (let i = mips.length - 2; i >= 0; i--) {
				setUniform(1 / mips[i + 1].w, 1 / mips[i + 1].h, post);
				pass(upsample, mips[i], mips[i + 1].tex, mips[i].w, mips[i].h);
			}
			gl.disable(gl.BLEND);

			// Composite to the canvas: scene + intensity·glow, then grade.
			setUniform(1 / scene.w, 1 / scene.h, post);
			pass(composite, null, mips[0].tex, gridW, gridH, scene.tex);
		},
		destroy() {
			freeTargets();
			gl.deleteBuffer(ubo);
			gl.deleteVertexArray(vao);
			gl.deleteProgram(prefilter);
			gl.deleteProgram(downsample);
			gl.deleteProgram(upsample);
			gl.deleteProgram(composite);
		}
	};
}
