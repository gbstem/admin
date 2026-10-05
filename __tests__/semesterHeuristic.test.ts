import {
  compareSemesters,
  semesterForDate,
} from '../scripts/lib/semesterHeuristic'

describe('semesterForDate', () => {
  it.each([
    ['2026-01-01T05:00:00Z', 'Spring26'], // midnight Jan 1 in Boston
    ['2026-03-10T20:00:00Z', 'Spring26'],
    ['2026-07-16T03:59:00Z', 'Spring26'], // 11:59pm Jul 15 in Boston
    ['2026-07-16T04:00:00Z', 'Fall26'], // midnight Jul 16 in Boston
    ['2026-10-05T20:00:00Z', 'Fall26'],
    ['2027-01-01T04:59:00Z', 'Fall26'], // 11:59pm Dec 31 in Boston
    ['2025-11-20T21:00:00Z', 'Fall25'],
  ])('puts %s in %s', (iso, semester) => {
    expect(semesterForDate(new Date(iso))).toBe(semester)
  })
})

describe('compareSemesters', () => {
  it('orders Spring before Fall of the same year, and Fall before next Spring', () => {
    expect(compareSemesters('Spring26', 'Fall26')).toBeLessThan(0)
    expect(compareSemesters('Fall25', 'Spring26')).toBeLessThan(0)
    expect(compareSemesters('Fall26', 'Fall26')).toBe(0)
    expect(compareSemesters('Spring27', 'Fall26')).toBeGreaterThan(0)
  })

  it('refuses an id that is not a semester', () => {
    expect(() => compareSemesters('Summer26', 'Fall26')).toThrow(
      'Not a semester id: Summer26',
    )
  })
})
