import { useState, useEffect, useRef, useCallback } from "react";

type ProgressPhase = "idle" | "generating" | "done";

interface UseGenerationProgressOptions {
  /** Duration in ms to simulate 0→90% (default: 60000 = 60s) */
  duration?: number;
  /** How long to show "done" state in ms (default: 2000) */
  doneDuration?: number;
}

interface UseGenerationProgressReturn {
  progress: number;
  phase: ProgressPhase;
  label: string;
  start: () => void;
  finish: () => void;
  reset: () => void;
}

/**
 * Simulates progress 0→90% over `duration` ms while a long AI generation runs.
 * Call `start()` when mutation fires, `finish()` on success/error.
 * Shows 100% + "Готово" for `doneDuration` ms, then resets to idle.
 */
export function useGenerationProgress(
  opts?: UseGenerationProgressOptions
): UseGenerationProgressReturn {
  const duration = opts?.duration ?? 60000;
  const doneDuration = opts?.doneDuration ?? 2000;

  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<ProgressPhase>("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setProgress(0);
    setPhase("idle");
  }, [cleanup]);

  const finish = useCallback(() => {
    cleanup();
    setProgress(100);
    setPhase("done");
    doneTimerRef.current = setTimeout(() => {
      setProgress(0);
      setPhase("idle");
    }, doneDuration);
  }, [cleanup, doneDuration]);

  const start = useCallback(() => {
    cleanup();
    setProgress(0);
    setPhase("generating");
    startTimeRef.current = Date.now();

    // Use ease-out curve: fast at start, slows down approaching 90%
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out: 1 - (1-t)^2, capped at 90%
      const eased = 1 - (1 - t) * (1 - t);
      const value = Math.round(eased * 90);
      setProgress(value);
    }, 300);
  }, [cleanup, duration]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const label =
    phase === "idle"
      ? ""
      : phase === "done"
        ? "Готово"
        : `Генерация... ${progress}%`;

  return { progress, phase, label, start, finish, reset };
}
