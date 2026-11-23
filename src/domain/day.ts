const HOUR_MS = 3_600_000;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dayKey(at: number, dayStartHour: number): string {
  const d = new Date(at - dayStartHour * HOUR_MS);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Epoch ms of the next local boundary at `dayStartHour` strictly after `at`. */
export function endOfStudyDay(at: number, dayStartHour: number): number {
  const d = new Date(at);
  let boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayStartHour).getTime();
  if (boundary <= at) boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, dayStartHour).getTime();
  return boundary;
}
