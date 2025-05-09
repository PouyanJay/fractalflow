import React, { useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { generateKochSnowflake, type Point } from '../utils/koch';

interface FractalCanvasProps {
  depth: number;
  width?: number;
  height?: number;
}

/**
 * FractalCanvas renders a Koch snowflake fractal on a canvas.
 * It also displays the current recursion depth below the fractal.
 */
const FractalCanvas: React.FC<FractalCanvasProps> = ({ depth, width = 400, height = 400 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    // Set up drawing parameters
    const margin = 32;
    const center: Point = { x: width / 2, y: height / 2 };
    const radius = Math.min(width, height) / 2 - margin;
    // Generate fractal points
    const points = generateKochSnowflake(center, radius, depth);
    // Draw background
    ctx.save();
    ctx.fillStyle = '#e3f2fd'; // Light blue background
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    // Draw fractal
    ctx.save();
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }, [depth, width, height]);

  return (
    <Paper elevation={2} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2 }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ background: 'transparent', borderRadius: 8 }}
      />
      <Typography variant="subtitle1" sx={{ mt: 2, fontStyle: 'italic' }}>
        N = {depth}
      </Typography>
    </Paper>
  );
};

export default FractalCanvas; 