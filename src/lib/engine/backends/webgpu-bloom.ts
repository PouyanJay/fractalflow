/**
 * Shared WebGPU bloom pyramid, reused by the fragment ($lib/.../webgpu.ts) and
 * compute ($lib/.../webgpu-compute.ts) backends. The owning backend renders its
 * scene into `sceneView()` (an HDR rgba16float target this helper owns), then
 * calls `encode()` to record the bright-pass → downsample → upsample → composite
 * passes that write the glowing image (and the final grade) to the swapchain.
 *
 * The bloom maths and WGSL live in $lib/fractals/bloom; the grade comes from
 * $lib/fractals/post so there is a single grade definition across the app.
 */
import type { PostSettings } from '../types';
import {
	BLOOM_WGSL,
	BLOOM_ENTRY,
	BLOOM_UNIFORM_SIZE,
	packBloomUniform,
	mipLevelCount
} from '$lib/fractals/bloom';
import { GRADE_WGSL_FN } from '$lib/fractals/post';

/** HDR scene/pyramid format: holds >1 values so bright cores bloom correctly. */
export const BLOOM_HDR_FORMAT: GPUTextureFormat = 'rgba16float';

interface Pass {
	pipeline: GPURenderPipeline;
	bindGroup: GPUBindGroup;
	uniform: GPUBuffer;
	dst: GPUTextureView;
	texelW: number;
	texelH: number;
	/** Downsamples clear their target; upsamples accumulate (additive blend). */
	clear: boolean;
}

/** The final pass: reads mip0 + scene, writes the graded result to the swapchain. */
interface CompositePass {
	pipeline: GPURenderPipeline;
	bindGroup: GPUBindGroup;
	uniform: GPUBuffer;
}

export interface WebGPUBloom {
	/** Reallocate the scene target + pyramid for a new drawing-buffer size. */
	resize(width: number, height: number): void;
	/** The HDR render target the backend draws its scene into. */
	sceneView(): GPUTextureView;
	/** Record the pyramid + composite into `target` (the swapchain view). */
	encode(encoder: GPUCommandEncoder, target: GPUTextureView, post: PostSettings): void;
	destroy(): void;
}

export async function createWebGPUBloom(
	device: GPUDevice,
	outputFormat: GPUTextureFormat
): Promise<WebGPUBloom | null> {
	device.pushErrorScope('validation');
	const module = device.createShaderModule({ code: `${GRADE_WGSL_FN}\n${BLOOM_WGSL}` });

	const make = (entryPoint: string, format: GPUTextureFormat, additive = false) =>
		device.createRenderPipeline({
			layout: 'auto',
			vertex: { module, entryPoint: BLOOM_ENTRY.vs },
			fragment: {
				module,
				entryPoint,
				targets: [
					{
						format,
						blend: additive
							? {
									color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
									alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
								}
							: undefined
					}
				]
			},
			primitive: { topology: 'triangle-list' }
		});

	const prefilterPipe = make(BLOOM_ENTRY.prefilter, BLOOM_HDR_FORMAT);
	const downsamplePipe = make(BLOOM_ENTRY.downsample, BLOOM_HDR_FORMAT);
	const upsamplePipe = make(BLOOM_ENTRY.upsample, BLOOM_HDR_FORMAT, true);
	const compositePipe = make(BLOOM_ENTRY.composite, outputFormat);
	const pipelineError = await device.popErrorScope();
	if (pipelineError) {
		console.warn('[webgpu-bloom] pipeline invalid, bloom disabled:', pipelineError.message);
		return null;
	}

	const sampler = device.createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	let sceneTex: GPUTexture | null = null;
	let sceneViewRef: GPUTextureView | null = null;
	let mips: GPUTexture[] = [];
	let passes: Pass[] = [];
	let composite: CompositePass | null = null;
	let gridW = 0;
	let gridH = 0;

	function freeTextures() {
		sceneTex?.destroy();
		sceneTex = null;
		sceneViewRef = null;
		for (const m of mips) m.destroy();
		mips = [];
		// Each pass owns a uniform buffer allocated in allocate(); free them too.
		for (const p of passes) p.uniform.destroy();
		passes = [];
		composite?.uniform.destroy();
		composite = null;
	}

	function makeTarget(width: number, height: number): GPUTexture {
		return device.createTexture({
			size: { width, height },
			format: BLOOM_HDR_FORMAT,
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
		});
	}

	function sampleBindGroup(pipeline: GPURenderPipeline, uniform: GPUBuffer, src: GPUTextureView) {
		return device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: uniform } },
				{ binding: 1, resource: sampler },
				{ binding: 2, resource: src }
			]
		});
	}

	function allocate(width: number, height: number) {
		freeTextures();
		sceneTex = makeTarget(width, height);
		const sceneView = sceneTex.createView();
		sceneViewRef = sceneView;

		const n = mipLevelCount(width, height);
		const dims: { w: number; h: number }[] = [];
		for (let i = 0; i < n; i++) {
			dims.push({
				w: Math.max(1, Math.floor(width / 2 ** (i + 1))),
				h: Math.max(1, Math.floor(height / 2 ** (i + 1)))
			});
			mips.push(makeTarget(dims[i].w, dims[i].h));
		}
		const view = (i: number) => mips[i].createView();
		const newUniform = () =>
			device.createBuffer({
				size: BLOOM_UNIFORM_SIZE,
				usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
			});

		const built: Pass[] = [];
		// Bright pass: scene (full res) → mip0.
		{
			const uniform = newUniform();
			built.push({
				pipeline: prefilterPipe,
				uniform,
				bindGroup: sampleBindGroup(prefilterPipe, uniform, sceneView),
				dst: view(0),
				texelW: 1 / width,
				texelH: 1 / height,
				clear: true
			});
		}
		// Downsample chain: mip[i] → mip[i+1].
		for (let i = 0; i < n - 1; i++) {
			const uniform = newUniform();
			built.push({
				pipeline: downsamplePipe,
				uniform,
				bindGroup: sampleBindGroup(downsamplePipe, uniform, view(i)),
				dst: view(i + 1),
				texelW: 1 / dims[i].w,
				texelH: 1 / dims[i].h,
				clear: true
			});
		}
		// Upsample chain: mip[i+1] → mip[i], accumulating (additive blend).
		for (let i = n - 2; i >= 0; i--) {
			const uniform = newUniform();
			built.push({
				pipeline: upsamplePipe,
				uniform,
				bindGroup: sampleBindGroup(upsamplePipe, uniform, view(i + 1)),
				dst: view(i),
				texelW: 1 / dims[i + 1].w,
				texelH: 1 / dims[i + 1].h,
				clear: false
			});
		}
		passes = built;

		// Composite: glow (mip0) + scene → swapchain, then grade.
		const compositeUniform = newUniform();
		composite = {
			pipeline: compositePipe,
			uniform: compositeUniform,
			bindGroup: device.createBindGroup({
				layout: compositePipe.getBindGroupLayout(0),
				entries: [
					{ binding: 0, resource: { buffer: compositeUniform } },
					{ binding: 1, resource: sampler },
					{ binding: 2, resource: view(0) },
					{ binding: 3, resource: sceneView }
				]
			})
		};
		gridW = width;
		gridH = height;
	}

	const scratch = new ArrayBuffer(BLOOM_UNIFORM_SIZE);
	const scratchView = new DataView(scratch);

	function writeUniform(buffer: GPUBuffer, texelW: number, texelH: number, post: PostSettings) {
		packBloomUniform(scratchView, texelW, texelH, post);
		device.queue.writeBuffer(buffer, 0, scratch);
	}

	function drawPass(encoder: GPUCommandEncoder, pass: Pass, target: GPUTextureView) {
		const rp = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: target,
					loadOp: pass.clear ? 'clear' : 'load',
					clearValue: { r: 0, g: 0, b: 0, a: 0 },
					storeOp: 'store'
				}
			]
		});
		rp.setPipeline(pass.pipeline);
		rp.setBindGroup(0, pass.bindGroup);
		rp.draw(3);
		rp.end();
	}

	return {
		resize(width: number, height: number) {
			if (width !== gridW || height !== gridH || !sceneTex) allocate(width, height);
		},
		sceneView() {
			if (!sceneViewRef) throw new Error('createWebGPUBloom: call resize() before sceneView()');
			return sceneViewRef;
		},
		encode(encoder: GPUCommandEncoder, target: GPUTextureView, post: PostSettings) {
			if (!composite) return;
			for (const pass of passes) {
				writeUniform(pass.uniform, pass.texelW, pass.texelH, post);
				drawPass(encoder, pass, pass.dst);
			}
			writeUniform(composite.uniform, 0, 0, post);
			const rp = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: target,
						loadOp: 'clear',
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						storeOp: 'store'
					}
				]
			});
			rp.setPipeline(composite.pipeline);
			rp.setBindGroup(0, composite.bindGroup);
			rp.draw(3);
			rp.end();
		},
		destroy() {
			freeTextures();
		}
	};
}
