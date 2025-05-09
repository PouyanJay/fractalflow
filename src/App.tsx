import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import FractalCanvas from './components/FractalCanvas'
import FractalControls from './components/FractalControls'
import './App.css'

// Constants for recursion depth limits
const MIN_DEPTH = 0
const MAX_DEPTH = 15
const INITIAL_DEPTH = 0

/**
 * App is the main component for the FractalFlow Koch fractal viewer.
 * It provides a sidebar for controls and a main area for the fractal canvas.
 */
function App() {
  const [depth, setDepth] = useState(INITIAL_DEPTH)

  // Handlers for control buttons
  const handleForward = () => setDepth((d) => Math.min(d + 1, MAX_DEPTH))
  const handleBackward = () => setDepth((d) => Math.max(d - 1, MIN_DEPTH))
  const handleReset = () => setDepth(INITIAL_DEPTH)

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#fafafa' }}>
      {/* Sidebar */}
      <Box
        component={Paper}
        elevation={3}
        sx={{
          width: 240,
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderRadius: 0,
          minWidth: 200,
        }}
      >
        <Typography
          variant="h4"
          sx={{ fontFamily: 'Caveat, cursive', mb: 4, mt: 2, fontWeight: 700 }}
        >
          FractalFlow
        </Typography>
        <FractalControls
          onForward={handleForward}
          onBackward={handleBackward}
          onReset={handleReset}
          disableForward={depth >= MAX_DEPTH}
          disableBackward={depth <= MIN_DEPTH}
          disableReset={depth === INITIAL_DEPTH}
        />
      </Box>
      {/* Main content */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'transparent',
        }}
      >
        <FractalCanvas depth={depth} width={420} height={420} />
      </Box>
    </Box>
  )
}

export default App
