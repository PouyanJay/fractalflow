/**
 * WebGPU primary backend. Renders the same calm test pattern as the WebGL2
 * fallback (visual parity) via a fullscreen triangle, validating device/context
 * setup, a uniform buffer, and the render-pass submit path. Async because
 * adapter/device acquisition is async; returns null if WebGPU is unavailable.
 */
import type { FrameState, RenderBackend } from '../types';

const WGSL = /* wgsl */ `
struct Uniforms {
	resolution: vec2f,
	time: f32,
	_pad: f32,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
	let uv = fragCoord.xy / u.resolution;
	let d = distance(uv, vec2f(0.5, 0.5));
	let glow = smoothstep(0.95, 0.05, d);
	let pulse = 0.5 + 0.5 * sin(u.time * 0.0006);
	let base = vec3f(0.043, 0.055, 0.075);
	let accent = vec3f(0.176, 0.831, 0.749);
	let col = mix(base, accent * 0.16, glow * (0.55 + 0.25 * pulse));
	return vec4f(col, 1.0);
}
`;

export async function createWebGPUBackend(
	canvas: HTMLCanvasElement
): Promise<RenderBackend | null> {
	if (typeof navigator === 'undefined' || !navigator.gpu) return null;

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) return null;
	const device = await adapter.requestDevice();
	const context = canvas.getContext('webgpu');
	if (!context) return null;

	const format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format, alphaMode: 'opaque' });

	const shader = device.createShaderModule({ code: WGSL });
	const pipeline = device.createRenderPipeline({
		layout: 'auto',
		vertex: { module: shader, entryPoint: 'vs' },
		fragment: { module: shader, entryPoint: 'fs', targets: [{ format }] },
		primitive: { topology: 'triangle-list' }
	});

	// std140-aligned: vec2f + f32 + pad = 16 bytes.
	const uniformData = new Float32Array(4);
	const uniformBuffer = device.createBuffer({
		size: uniformData.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
	});
	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
	});

	return {
		type: 'webgpu',
		resize() {
			// The configured context tracks the canvas drawing-buffer size, so
			// getCurrentTexture() already follows canvas.width/height — no-op.
		},
		render(frame: FrameState) {
			uniformData[0] = frame.width;
			uniformData[1] = frame.height;
			uniformData[2] = frame.timeMs;
			uniformData[3] = 0;
			device.queue.writeBuffer(uniformBuffer, 0, uniformData);

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
