function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function dayKey(at: number, dayStartHour: number): string {
  const d = new Date(at);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getHours() < dayStartHour ? 1 : 0));
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Epoch ms of the next local boundary at `dayStartHour` strictly after `at`. */
export function endOfStudyDay(at: number, dayStartHour: number): number {
  const d = new Date(at);
  let boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayStartHour).getTime();
  if (boundary <= at) boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, dayStartHour).getTime();
  return boundary;
}

/** Epoch ms of the most recent local boundary at `dayStartHour` at or before `at`. */
export function startOfStudyDay(at: number, dayStartHour: number): number {
  const d = new Date(at);
  let boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate(), dayStartHour).getTime();
  if (boundary > at) boundary = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, dayStartHour).getTime();
  return boundary;
}
