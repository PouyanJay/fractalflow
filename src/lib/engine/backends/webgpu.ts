/**
 * WebGPU primary backend. Renders a FractalRenderer's WGSL module on a
 * fullscreen triangle, uploading the shared uniform buffer (and an optional
 * data buffer — e.g. the perturbation reference orbit — as a read-only storage
 * buffer at @binding(1)) each frame. Returns null if WebGPU is unavailable.
 */
import type { FractalRenderer, RenderInput, RenderBackend } from '../types';

export async function createWebGPUBackend(
	canvas: HTMLCanvasElement,
	renderer: FractalRenderer
): Promise<RenderBackend | null> {
	if (typeof navigator === 'undefined' || !navigator.gpu) return null;

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
	const pipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: { module, entryPoint: 'vs' },
		fragment: { module, entryPoint: 'fs', targets: [{ format }] },
		primitive: { topology: 'triangle-list' }
	});
	const pipelineError = await device.popErrorScope();
	if (pipelineError) {
		console.warn('[webgpu] pipeline invalid, falling back to WebGL2:', pipelineError.message);
		device.destroy();
		return null;
	}

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

	const uniformData = new ArrayBuffer(renderer.uniformSize);
	const view = new DataView(uniformData);

	return {
		type: 'webgpu',
		resize() {
			// The configured context tracks the canvas drawing-buffer size.
		},
		render(input: RenderInput) {
			renderer.packUniforms(view, input);
			device.queue.writeBuffer(uniformBuffer, 0, uniformData);

			if (dataBuffer && renderer.packData) {
				const data = renderer.packData(input);
				if (data.byteLength > 0) device.queue.writeBuffer(dataBuffer, 0, data);
			}

			const encoder = device.createCommandEncoder();
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
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, bindGroup);
			pass.draw(3);
			pass.end();
			device.queue.submit([encoder.finish()]);
		},
		destroy() {
			uniformBuffer.destroy();
			dataBuffer?.destroy();
			context.unconfigure();
			device.destroy();
		}
	};
}
