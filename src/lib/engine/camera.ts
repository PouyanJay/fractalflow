/**
 * Pure 2D camera operations for pan/zoom over the complex plane. The y axis is
 * up (positive imaginary); pointer/pixel coordinates are top-left origin.
 */
import type { Camera2D } from './types';

function pixelToComplex(px: number, py: number, width: number, height: number, camera: Camera2D) {
	const perPixel = camera.scale / height;
	return {
		x: camera.centerX + (px - width / 2) * perPixel,
		y: camera.centerY - (py - height / 2) * perPixel
	};
}

/** Pan by a pixel delta (e.g. a drag), keeping the content under the pointer. */
export function panCamera(
	camera: Camera2D,
	dxPixels: number,
	dyPixels: number,
	cssHeight: number
): Camera2D {
	const perPixel = camera.scale / cssHeight;
	return {
		centerX: camera.centerX - dxPixels * perPixel,
		centerY: camera.centerY + dyPixels * perPixel,
		scale: camera.scale
	};
}

/** Zoom by `factor` (<1 zooms in) while keeping the point under the cursor fixed. */
export function zoomCameraAt(
	camera: Camera2D,
	cursorPx: number,
	cursorPy: number,
	width: number,
	height: number,
	factor: number
): Camera2D {
	const before = pixelToComplex(cursorPx, cursorPy, width, height, camera);
	const zoomed: Camera2D = { ...camera, scale: camera.scale * factor };
	const after = pixelToComplex(cursorPx, cursorPy, width, height, zoomed);
	return {
		centerX: zoomed.centerX + (before.x - after.x),
		centerY: zoomed.centerY + (before.y - after.y),
		scale: zoomed.scale
	};
}
