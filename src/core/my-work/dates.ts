// Due dates are date-only `YYYY-MM-DD` strings. They are compared as strings
// against the device's local day and never parsed as UTC instants, which
// would move them a day on either side of the date line.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The local calendar day of `date`, as `YYYY-MM-DD`. */
export function localIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** `isoDate` moved by `days` calendar days (negative goes back). */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return localIsoDate(new Date(year, month - 1, day + days));
}

/**
 * `Thu 17 Sep`, with the year added when it isn't `today`'s year
 * (`Thu 17 Sep 2027`).
 */
export function shortDate(isoDate: string, today: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  const label = `${weekday} ${day} ${MONTHS[month - 1]}`;
  return today.startsWith(`${year}-`) ? label : `${label} ${year}`;
}

/** `17 Sep`, with the year added when it isn't `today`'s year. */
export function dayMonth(isoDate: string, today: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const label = `${day} ${MONTHS[month - 1]}`;
  return today.startsWith(`${year}-`) ? label : `${label} ${year}`;
}
