import confetti from 'canvas-confetti';
import { useEffect, useRef } from 'react';

interface ConfettiCelebrationProps {
  isActive: boolean;
  duration?: number;
  intensity?: 'low' | 'medium' | 'high';
  colors?: string[];
}

export function ConfettiCelebration({
  isActive,
  duration = 2000,
  intensity = 'medium',
  colors = ['#FFD700', '#FF6347', '#00BFFF', '#32CD32', '#FF69B4', '#9370DB'],
}: ConfettiCelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Particle count based on intensity
    const getParticleCount = () => {
      switch (intensity) {
        case 'low':
          return { main: 30, secondary: 10 };
        case 'high':
          return { main: 80, secondary: 30 };
        default:
          return { main: 50, secondary: 20 }; // medium
      }
    };

    const particleCounts = getParticleCount();
    const end = Date.now() + duration;

    const myConfetti = confetti.create(canvas, {
      resize: true,
      useWorker: true,
    });

    // Fire from the left
    myConfetti({
      particleCount: particleCounts.main,
      spread: 70,
      origin: { x: 0.1, y: 0.5 },
    });

    // Fire from the right
    myConfetti({
      particleCount: particleCounts.main,
      spread: 70,
      origin: { x: 0.9, y: 0.5 },
    });

    // Fire from the bottom
    myConfetti({
      particleCount: particleCounts.main,
      spread: 100,
      origin: { x: 0.5, y: 0.9 },
    });

    const burstInterval = Math.min(300, duration / 4);

    const interval = setInterval(() => {
      if (Date.now() > end) {
        return clearInterval(interval);
      }

      // Random confetti bursts
      myConfetti({
        particleCount: particleCounts.secondary / 2,
        angle: Math.random() * 360,
        spread: 40,
        origin: {
          x: Math.random(),
          y: Math.random() - 0.2,
        },
        gravity: 0.5,
        colors,
      });
    }, burstInterval);

    return () => clearInterval(interval);
  }, [isActive, duration, intensity, colors]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-50"
      aria-hidden="true"
    />
  );
}
