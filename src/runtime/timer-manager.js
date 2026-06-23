// Saves and clears all tracked user-code intervals/timeouts.
// Returns saved state for later restore via restoreTimers.
export function freezeTimers(intervals, timeouts, nativeClearInterval, nativeClearTimeout) {
  const savedIntervals = new Map(intervals);
  for (const id of intervals.keys()) nativeClearInterval(id);
  intervals.clear();

  const savedTimeouts = new Map(timeouts);
  for (const id of timeouts.keys()) nativeClearTimeout(id);
  timeouts.clear();

  return { intervals: savedIntervals, timeouts: savedTimeouts, frozenAt: Date.now() };
}

// Re-registers saved intervals/timeouts. Timeouts fire with their remaining delay.
export function restoreTimers(saved, setInterval, setTimeout) {
  if (!saved) return;
  for (const { cb, delay, args } of saved.intervals.values()) {
    setInterval(cb, delay, ...args);
  }
  const now = Date.now();
  for (const { cb, delay, createdAt, args } of saved.timeouts.values()) {
    const remaining = Math.max(0, delay - (now - createdAt));
    setTimeout(cb, remaining, ...args);
  }
}
