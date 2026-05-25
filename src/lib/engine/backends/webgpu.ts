/**
 * WebGPU primary backend. Renders a FractalRenderer's WGSL module on a
 * fullscreen triangle, uploading the shared uniform buffer each frame. Async
 * because adapter/device acquisition is async; returns null if WebGPU is
 * unavailable so the engine can fall back to WebGL2.
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

	const module = device.createShaderModule({ code: renderer.wgsl });
	const pipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: { module, entryPoint: 'vs' },
		fragment: { module, entryPoint: 'fs', targets: [{ format }] },
		primitive: { topology: 'triangle-list' }
	});

	const uniformBuffer = device.createBuffer({
		size: renderer.uniformSize,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
	});

	const data = new ArrayBuffer(renderer.uniformSize);
	const view = new DataView(data);

	return {
		type: 'webgpu',
		resize() {
			// The configured context tracks the canvas drawing-buffer size.
		},
		render(input: RenderInput) {
			renderer.packUniforms(view, input);
			device.queue.writeBuffer(uniformBuffer, 0, data);

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
			context.unconfigure();
			device.destroy();
		}
	};
}
