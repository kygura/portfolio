// Lookahead scheduling: a coarse timer wakes up every so often and books every step that falls
// before `now + lookahead` on the AudioContext clock, which is sample-accurate. Pure.

export interface Clock {
  /** AudioContext time of step 0. */
  origin: number;
  /** Seconds per step. */
  stepDur: number;
}

/** Step times come from the origin, not from summing durations, so they never drift. */
export const stepTime = (clock: Clock, step: number): number => clock.origin + step * clock.stepDur;

export interface DueStep {
  step: number;
  time: number;
}

/**
 * Steps from `next` that start before `horizon`, and the step to continue from. If the timer fell
 * behind (a throttled background tab), it skips to the present instead of firing a burst of stale
 * notes all at once.
 */
export function dueSteps(clock: Clock, next: number, now: number, horizon: number): { due: DueStep[]; next: number } {
  let step = next;
  if (stepTime(clock, step) < now - clock.stepDur) step = Math.ceil((now - clock.origin) / clock.stepDur);
  const due: DueStep[] = [];
  for (let t = stepTime(clock, step); t < horizon; t = stepTime(clock, step)) {
    due.push({ step, time: t });
    step += 1;
  }
  return { due, next: step };
}
