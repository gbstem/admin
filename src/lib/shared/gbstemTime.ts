// gbstemTime.ts - Reading semesterDates.json's bare dates as gbSTEM's own
// time, and naming the viewer's. Kept byte-identical in admin and portal, and
// free of `#lib` imports so server code, browser code, scripts and Cypress
// specs can all use it.
//
// A `MM/DD/YY` date has no time zone of its own. `new Date('09/20/26')` reads
// it in the runtime's zone, which is UTC on the server and the reader's in a
// browser, so the same deadline used to fall up to three hours apart depending
// on who was looking. Read it through `parseGbstemDateTime`/`gbstemMidnight`.

/** Where gbSTEM runs its classes and interviews. */
export const GBSTEM_TIME_ZONE = 'America/New_York'

/** The UTC offset of `GBSTEM_TIME_ZONE` at `at`, in minutes (-240 in EDT). */
function gbstemOffsetMinutes(at: number): number {
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone: GBSTEM_TIME_ZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value
  const match = offsetName?.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 0
  return (
    (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
  )
}

/**
 * The instant a `MM/DD/YY` date and `HH:mm` (24-hour) time name in
 * `GBSTEM_TIME_ZONE`, `daysAfter` days later. EST or EDT is decided by the
 * date, so neither can be assumed.
 */
export function parseGbstemDateTime(
  dateString: string,
  timeString = '00:00',
  daysAfter = 0,
): Date {
  const [month, day, twoDigitYear] = dateString.split('/').map(Number)
  const [hour, minute] = timeString.split(':').map(Number)

  // Guess the instant as if the wall-clock time were UTC, then correct by the
  // zone's actual offset at that instant.
  const utcGuess = Date.UTC(
    2000 + twoDigitYear,
    month - 1,
    day + daysAfter,
    hour,
    minute,
  )
  return new Date(utcGuess - gbstemOffsetMinutes(utcGuess) * 60_000)
}

/**
 * Midnight in gbSTEM's time zone at the start of the day `daysAfter` days
 * after the `MM/DD/YY` date: `gbstemMidnight(due, 1)` is the first instant
 * after a deadline advertised as "due <date> at 11:59 PM ET".
 */
export function gbstemMidnight(dateString: string, daysAfter = 0): Date {
  return parseGbstemDateTime(dateString, '00:00', daysAfter)
}

/**
 * The short name of the viewer's time zone at `at` - "EDT", "PST", or
 * "GMT+1" where English has no abbreviation - for labelling times shown in
 * it. `timeZone` defaults to the runtime's own, which is the viewer's in a
 * browser.
 */
export function localTimeZoneLabel(
  at: Date = new Date(),
  timeZone?: string,
): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? ''
  )
}
