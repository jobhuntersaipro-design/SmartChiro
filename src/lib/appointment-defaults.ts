function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Default start for a new booking: the next half hour today (walk-ins), or
 * 09:00 tomorrow once the evening is over. A prefilled ISO time wins.
 */
export function defaultStart(prefilledIso?: string | null, now: Date = new Date()): { date: string; time: string } {
  let d: Date;
  if (prefilledIso && !Number.isNaN(new Date(prefilledIso).getTime())) {
    d = new Date(prefilledIso);
  } else {
    d = new Date(now);
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() <= 30 ? 30 : 60);
    if (d.getHours() >= 20 || d.getDate() !== now.getDate()) {
      d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
    }
  }
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
