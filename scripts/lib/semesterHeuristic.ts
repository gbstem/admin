// Best-effort semester for a date, for data written before it carried one:
// Jan 1 - Jul 15 is Spring, Jul 16 - Dec 31 is Fall, by the calendar date in
// Boston. Good enough for past trends, not for anything a person relies on -
// a Fall class meeting in January lands in the next Spring.

const SEMESTER_ID = /^(Spring|Fall)(\d\d)$/

/** The semester `date` falls in, e.g. 'Fall26', by the calendar in Boston. */
export function semesterForDate(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: '2-digit',
      month: 'numeric',
      day: 'numeric',
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  )
  const month = Number(parts.month)
  const day = Number(parts.day)
  const isSpring = month < 7 || (month === 7 && day <= 15)
  return `${isSpring ? 'Spring' : 'Fall'}${parts.year}`
}

/**
 * Orders semester ids chronologically: negative when `a` comes before `b`.
 * Throws on an id that isn't `Spring##` or `Fall##`.
 */
export function compareSemesters(a: string, b: string): number {
  return semesterOrdinal(a) - semesterOrdinal(b)
}

function semesterOrdinal(semesterId: string): number {
  const match = SEMESTER_ID.exec(semesterId)
  if (!match) throw new Error(`Not a semester id: ${semesterId}`)
  return Number(match[2]) * 2 + (match[1] === 'Fall' ? 1 : 0)
}
