/**
 * WebGPU primary backend. Renders a FractalRenderer's WGSL module on a
 * fullscreen triangle, uploading the shared uniform buffer (and an optional
 * data buffer — e.g. the perturbation reference orbit — as a read-only storage
 * buffer at @binding(1)) each frame. Returns null if WebGPU is unavailable.
 */
import type { FractalRenderer, RenderInput, RenderBackend } from '../types';
import { createWebGPUComputeBackend } from './webgpu-compute';
import { createWebGPUBloom, BLOOM_HDR_FORMAT } from './webgpu-bloom';
import { withBloomDisabled } from '$lib/fractals/bloom';

export async function createWebGPUBackend(
	canvas: HTMLCanvasElement,
	renderer: FractalRenderer
): Promise<RenderBackend | null> {
	if (typeof navigator === 'undefined' || !navigator.gpu) return null;

	// Particle-accumulation renderers use the compute pipeline; everything else
	// is a fullscreen-triangle fragment shader. Narrows `renderer` to a
	// FragmentRenderer for the path below.
	if (renderer.pipeline === 'compute') return createWebGPUComputeBackend(canvas, renderer);

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) return null;
	const device = await adapter.requestDevice();
	const context = canvas.getContext('webgpu');
	if (!context) return null;

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: 'opaque' });

	// Validate shader + pipeline creation (WebGPU reports these asynchronously,
	// not by throwing). If anything is invalid, tear down and return null so the
	// engine falls back to WebGL2 instead of rendering nothing.
	device.pushErrorScope('validation');
	const module = device.createShaderModule({ code: renderer.wgsl });
	const makeScenePipeline = (target: GPUTextureFormat) =>
		device.createRenderPipeline({
			layout: 'auto',
			vertex: { module, entryPoint: 'vs' },
			fragment: { module, entryPoint: 'fs', targets: [{ format: target }] },
			primitive: { topology: 'triangle-list' }
		});
	const pipeline = makeScenePipeline(format);
	// HDR variant used when bloom is on: the scene renders to an offscreen
	// rgba16float target so bright values survive the bright-pass threshold.
	const pipelineHDR = makeScenePipeline(BLOOM_HDR_FORMAT);
	const pipelineError = await device.popErrorScope();
	if (pipelineError) {
		console.warn('[webgpu] pipeline invalid, falling back to WebGL2:', pipelineError.message);
		device.destroy();
		return null;
	}

	// Bloom is optional: if its pipelines fail to build, the backend still
	// renders (direct path) — bloom just won't apply.
	const bloom = await createWebGPUBloom(device, format);

	const uniformBuffer = device.createBuffer({
		size: renderer.uniformSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: uniformBuffer } }];

	let dataBuffer: GPUBuffer | null = null;
	if (renderer.dataBufferSize) {
		dataBuffer = device.createBuffer({
			size: renderer.dataBufferSize,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
		entries.push({ binding: 1, resource: { buffer: dataBuffer } });
	}

	const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
	// A second bind group bound to the HDR pipeline's (auto) layout — same buffers.
	const bindGroupHDR = bloom
		? device.createBindGroup({ layout: pipelineHDR.getBindGroupLayout(0), entries })
		: null;

	const uniformData = new ArrayBuffer(renderer.uniformSize);
	const view = new DataView(uniformData);

	function drawScene(encoder: GPUCommandEncoder, target: GPUTextureView, hdr: boolean) {
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{ view: target, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }
			]
		});
		pass.setPipeline(hdr ? pipelineHDR : pipeline);
		pass.setBindGroup(0, hdr ? bindGroupHDR! : bindGroup);
		pass.draw(3);
		pass.end();
	}

	return {
		type: 'webgpu',
		resize() {
			// The configured context tracks the canvas drawing-buffer size.
		},
		render(input: RenderInput) {
			const useBloom = !!bloom && input.scene.post.bloom > 0;
			// Bloom requested but unavailable → keep the in-shader grade (clear the flag).
			const packInput = !useBloom && input.scene.post.bloom > 0 ? withBloomDisabled(input) : input;
			renderer.packUniforms(view, packInput);
			device.queue.writeBuffer(uniformBuffer, 0, uniformData);

			if (dataBuffer && renderer.packData) {
				const data = renderer.packData(input);
				if (data.byteLength > 0) device.queue.writeBuffer(dataBuffer, 0, data);
			}

			const encoder = device.createCommandEncoder();
			const target = context.getCurrentTexture().createView();
			if (useBloom && bloom) {
				bloom.resize(input.width, input.height);
				drawScene(encoder, bloom.sceneView(), true);
				bloom.encode(encoder, target, input.scene.post);
			} else {
				drawScene(encoder, target, false);
			}
			device.queue.submit([encoder.finish()]);
		},
		destroy() {
			bloom?.destroy();
			uniformBuffer.destroy();
			dataBuffer?.destroy();
			context.unconfigure();
			device.destroy();
		}
	};
}
