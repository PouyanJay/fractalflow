import React from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

interface FractalControlsProps {
  onForward: () => void;
  onBackward: () => void;
  onReset: () => void;
  disableForward?: boolean;
  disableBackward?: boolean;
  disableReset?: boolean;
}

/**
 * FractalControls renders the control buttons for the fractal viewer.
 * Includes forward, backward, and reset buttons with Material UI icons.
 */
const FractalControls: React.FC<FractalControlsProps> = ({
  onForward,
  onBackward,
  onReset,
  disableForward = false,
  disableBackward = false,
  disableReset = false,
}) => {
  return (
    <Stack direction="column" spacing={2} alignItems="center" sx={{ mt: 4 }}>
      <Stack direction="row" spacing={1}>
        <IconButton
          aria-label="Previous recursion level"
          onClick={onBackward}
          disabled={disableBackward}
          size="large"
        >
          <ArrowBackIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          aria-label="Next recursion level"
          onClick={onForward}
          disabled={disableForward}
          size="large"
        >
          <ArrowForwardIcon fontSize="inherit" />
        </IconButton>
      </Stack>
      <Button
        variant="outlined"
        startIcon={<RestartAltIcon />}
        onClick={onReset}
        disabled={disableReset}
        sx={{ minWidth: 100 }}
      >
        Reset
      </Button>
    </Stack>
  );
};

export default FractalControls; 