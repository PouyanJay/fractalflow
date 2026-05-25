/**
 * WebGPU compute backend for particle-accumulation art styles (Glowing
 * Attractors, later Painterly Flames). Each frame:
 *
 *   1. clear an atomic density grid (one u32 per drawing-buffer pixel);
 *   2. a compute pass integrates `particleCount` particles, `stepsPerParticle`
 *      iterations each, atomically adding into the density cell they land in;
 *   3. a fullscreen render pass tone-maps the density grid to colour.
 *
 * The backend is generic: it owns the buffers and passes, while the renderer
 * supplies the WGSL (`integrate` compute + `vs`/`fs` tone-map) and packs the
 * shared uniform buffer. WebGPU-only by design; there is no WebGL2 equivalent.
 */
import type { ComputeRenderer, RenderInput, RenderBackend } from '../types';

/** Must match `@workgroup_size(N)` on the `integrate` entry point. */
export const COMPUTE_WORKGROUP_SIZE = 64;

export async function createWebGPUComputeBackend(
	canvas: HTMLCanvasElement,
	renderer: ComputeRenderer
): Promise<RenderBackend | null> {
	if (typeof navigator === 'undefined' || !navigator.gpu) return null;

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) return null;
	const device = await adapter.requestDevice();
	const context = canvas.getContext('webgpu');
	if (!context) return null;

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: 'opaque' });

	// WebGPU reports pipeline errors asynchronously; validate up front and fall
	// back (→ "requires WebGPU" state) rather than rendering nothing.
	device.pushErrorScope('validation');
	const module = device.createShaderModule({ code: renderer.wgsl });
	const computePipeline = device.createComputePipeline({
		layout: 'auto',
		compute: { module, entryPoint: 'integrate' }
	});
	const renderPipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: { module, entryPoint: 'vs' },
		fragment: { module, entryPoint: 'fs', targets: [{ format }] },
		primitive: { topology: 'triangle-list' }
	});
	const pipelineError = await device.popErrorScope();
	if (pipelineError) {
		console.warn('[webgpu-compute] pipeline invalid:', pipelineError.message);
		device.destroy();
		return null;
	}

	const uniformBuffer = device.createBuffer({
		size: renderer.uniformSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});

	// Each pixel owns `channels` consecutive u32 accumulators (e.g. attractors
	// use 1 = density; flames use density + colour). The renderer's WGSL must
	// index with the same stride.
	const channels = Math.max(1, renderer.accumulationChannels ?? 1);

	let densityBuffer: GPUBuffer | null = null;
	let computeBindGroup: GPUBindGroup | null = null;
	let renderBindGroup: GPUBindGroup | null = null;
	let gridW = 0;
	let gridH = 0;

	function allocateGrid(width: number, height: number) {
		densityBuffer?.destroy();
		densityBuffer = device.createBuffer({
			size: Math.max(1, width * height * channels) * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
		const uniform: GPUBindGroupEntry = { binding: 0, resource: { buffer: uniformBuffer } };
		const density: GPUBindGroupEntry = { binding: 1, resource: { buffer: densityBuffer } };
		computeBindGroup = device.createBindGroup({
			layout: computePipeline.getBindGroupLayout(0),
			entries: [uniform, density]
		});
		renderBindGroup = device.createBindGroup({
			layout: renderPipeline.getBindGroupLayout(0),
			entries: [uniform, density]
		});
		gridW = width;
		gridH = height;
	}

	const uniformData = new ArrayBuffer(renderer.uniformSize);
	const view = new DataView(uniformData);
	const workgroups = Math.ceil(renderer.particleCount / COMPUTE_WORKGROUP_SIZE);

	return {
		type: 'webgpu',
		resize(width: number, height: number) {
			if (width !== gridW || height !== gridH) allocateGrid(width, height);
		},
		render(input: RenderInput) {
			if (!densityBuffer || gridW !== input.width || gridH !== input.height) {
				allocateGrid(input.width, input.height);
			}
			renderer.packUniforms(view, input);
			device.queue.writeBuffer(uniformBuffer, 0, uniformData);

			const encoder = device.createCommandEncoder();
			encoder.clearBuffer(densityBuffer!);

			const compute = encoder.beginComputePass();
			compute.setPipeline(computePipeline);
			compute.setBindGroup(0, computeBindGroup!);
			compute.dispatchWorkgroups(workgroups);
			compute.end();

			const pass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: context.getCurrentTexture().createView(),
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						loadOp: 'clear',
						storeOp: 'store'
					}
				]
			});
			pass.setPipeline(renderPipeline);
			pass.setBindGroup(0, renderBindGroup!);
			pass.draw(3);
			pass.end();
			device.queue.submit([encoder.finish()]);
		},
		destroy() {
			uniformBuffer.destroy();
			densityBuffer?.destroy();
			context.unconfigure();
			device.destroy();
		}
	};
}
