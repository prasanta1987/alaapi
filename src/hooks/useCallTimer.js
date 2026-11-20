import { useState, useEffect } from 'react';

/**
 * Format elapsed call duration in seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Hook to track live call duration in seconds
 */
export function useCallTimer() {
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(timerInterval);
    };
  }, []);

  return { callDuration, formatDuration };
}
