import React, { useRef, useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import { generateKochSnowflake, type Point } from '../utils/koch';

interface FractalCanvasProps {
  depth: number;
}

/**
 * FractalCanvas renders a Koch snowflake fractal on a canvas.
 * It fills its parent container.
 */
const FractalCanvas: React.FC<FractalCanvasProps> = ({ depth }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 400, height: 400 });

  // Resize observer to make canvas responsive
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setSize({ width: rect.width, height: rect.height });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = size;
    ctx.clearRect(0, 0, width, height);
    const margin = 32;
    const center: Point = { x: width / 2, y: height / 2 };
    const radius = Math.min(width, height) / 2 - margin;
    const points = generateKochSnowflake(center, radius, depth);
    ctx.save();
    ctx.fillStyle = '#e3f2fd';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }, [depth, size]);

  return (
    <Paper ref={containerRef} elevation={2} sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', p: 2, boxSizing: 'border-box' }}>
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        style={{ background: 'transparent', borderRadius: 8, width: '100%', height: '100%' }}
      />
      <Typography variant="subtitle1" sx={{ mt: 2, fontStyle: 'italic', position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center' }}>
        N = {depth}
      </Typography>
    </Paper>
  );
};

export default FractalCanvas; 