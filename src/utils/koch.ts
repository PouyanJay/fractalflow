// Koch snowflake fractal generation utility
// This module exports a function to generate the points for a Koch snowflake at a given recursion depth.
// The points can be used to draw the fractal on a canvas.

export type Point = { x: number; y: number };

/**
 * Generates the points for a Koch snowflake fractal.
 * @param center The center of the snowflake.
 * @param radius The radius of the circumscribed circle.
 * @param depth The recursion depth (N).
 * @returns An array of points representing the snowflake path (closed polygon).
 */
export function generateKochSnowflake(center: Point, radius: number, depth: number): Point[] {
  // Helper to compute the points of an equilateral triangle
  function trianglePoints(center: Point, radius: number): Point[] {
    const points: Point[] = [];
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI / 2) + (i * (2 * Math.PI / 3));
      points.push({
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle),
      });
    }
    return points;
  }

  // Recursively subdivide a line segment according to the Koch rule
  function kochCurve(a: Point, b: Point, depth: number): Point[] {
    if (depth === 0) return [a, b];
    const dx = (b.x - a.x) / 3;
    const dy = (b.y - a.y) / 3;
    const p1 = { x: a.x + dx, y: a.y + dy };
    const p2 = { x: a.x + 2 * dx, y: a.y + 2 * dy };
    // Calculate the peak of the equilateral triangle
    const angle = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 3;
    const px = p1.x + Math.cos(angle) * Math.sqrt(dx * dx + dy * dy);
    const py = p1.y + Math.sin(angle) * Math.sqrt(dx * dx + dy * dy);
    const peak = { x: px, y: py };
    // Recursively build the curve
    return [
      ...kochCurve(a, p1, depth - 1).slice(0, -1),
      ...kochCurve(p1, peak, depth - 1).slice(0, -1),
      ...kochCurve(peak, p2, depth - 1).slice(0, -1),
      ...kochCurve(p2, b, depth - 1),
    ];
  }

  // Start with the triangle
  const tri = trianglePoints(center, radius);
  if (depth === 0) {
    // Return the triangle as a closed polygon
    return [...tri, tri[0]];
  }
  let points: Point[] = [];
  let lastSegment: Point[] = [];
  for (let i = 0; i < 3; i++) {
    const a = tri[i];
    const b = tri[(i + 1) % 3];
    const segment = kochCurve(a, b, depth);
    points = [...points, ...segment.slice(0, -1)];
    if (i === 2) lastSegment = segment;
  }
  // Add the last point of the last segment to close the polygon
  points.push(lastSegment[lastSegment.length - 1]);
  return points;
} 