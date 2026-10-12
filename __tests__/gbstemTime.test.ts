import {
  gbstemMidnight,
  localTimeZoneLabel,
  parseGbstemDateTime,
} from '../src/lib/shared/gbstemTime'

describe('parseGbstemDateTime', () => {
  it('reads a summer date and time as EDT', () => {
    expect(parseGbstemDateTime('09/20/26', '19:00').toISOString()).toBe(
      '2026-09-20T23:00:00.000Z',
    )
  })

  it('reads a winter date and time as EST', () => {
    expect(parseGbstemDateTime('12/20/26', '19:00').toISOString()).toBe(
      '2026-12-21T00:00:00.000Z',
    )
  })

  it('defaults to midnight and rolls days over month ends', () => {
    expect(parseGbstemDateTime('09/30/26', undefined, 1).toISOString()).toBe(
      '2026-10-01T04:00:00.000Z',
    )
  })
})

describe('gbstemMidnight', () => {
  it('is midnight in New York, whatever zone the runtime is in', () => {
    // Jest runs in the machine's zone; the answer must not depend on it.
    expect(gbstemMidnight('09/19/26').toISOString()).toBe(
      '2026-09-19T04:00:00.000Z',
    )
  })

  it('is the end of the day with daysAfter = 1', () => {
    expect(gbstemMidnight('09/19/26', 1).toISOString()).toBe(
      '2026-09-20T04:00:00.000Z',
    )
  })

  it('takes the offset of the day itself across a DST change', () => {
    // DST ends at 2 AM on 11/01/26: midnight that day is still EDT, the next
    // one EST.
    expect(gbstemMidnight('11/01/26').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    )
    expect(gbstemMidnight('11/02/26').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    )
  })
})

describe('localTimeZoneLabel', () => {
  const summer = new Date('2026-07-01T12:00:00Z')
  const winter = new Date('2026-12-01T12:00:00Z')

  it.each([
    ['America/New_York', summer, 'EDT'],
    ['America/New_York', winter, 'EST'],
    ['America/Los_Angeles', summer, 'PDT'],
  ])('names %s at %s as %s', (zone, at, label) => {
    expect(localTimeZoneLabel(at, zone)).toBe(label)
  })

  it('falls back to an offset where English has no abbreviation', () => {
    expect(localTimeZoneLabel(summer, 'Europe/Berlin')).toBe('GMT+2')
  })

  it("uses the runtime's own zone by default", () => {
    expect(localTimeZoneLabel(summer)).toBe(
      localTimeZoneLabel(
        summer,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    )
  })
})
