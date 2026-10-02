import { toDate, toDateOrNull } from '../src/lib/shared/timestamps'

const instant = new Date('2026-05-28T12:00:00.215Z')
const seconds = Math.floor(instant.getTime() / 1000)

describe('toDate', () => {
  it('returns a Date as it is', () => {
    expect(toDate(instant)).toBe(instant)
  })

  it("uses a Timestamp's own toDate()", () => {
    expect(toDate({ toDate: () => instant, seconds: 0 })).toBe(instant)
  })

  it.each([
    ['client-shaped', { seconds, nanoseconds: 215_000_000 }],
    ['Admin-shaped', { _seconds: seconds, _nanoseconds: 215_000_000 }],
  ])('converts a serialized %s timestamp, keeping its milliseconds', (_, t) => {
    expect(toDate(t).getTime()).toBe(instant.getTime())
  })

  it('converts a serialized timestamp with no nanoseconds', () => {
    expect(toDate({ seconds }).getTime()).toBe(seconds * 1000)
  })

  it.each([
    ['an ISO string', instant.toISOString()],
    ['epoch milliseconds', instant.getTime()],
  ])('converts %s', (_, value) => {
    expect(toDate(value).getTime()).toBe(instant.getTime())
  })

  it.each([
    ['undefined', undefined],
    ['an unrelated object', { date: 'tomorrow' }],
    ['text that is not a date', 'soon'],
  ])('gives an Invalid Date for %s', (_, value) => {
    expect(Number.isNaN(toDate(value).getTime())).toBe(true)
  })
})

describe('toDateOrNull', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['text that is not a date', 'soon'],
    ['an unrelated object', { date: 'tomorrow' }],
  ])('gives null for %s', (_, value) => {
    expect(toDateOrNull(value)).toBeNull()
  })

  it.each([
    ['a Date', instant],
    ['a Timestamp', { toDate: () => instant }],
    ['a serialized timestamp', { seconds, nanoseconds: 215_000_000 }],
    ['an ISO string', instant.toISOString()],
  ])('converts %s', (_, value) => {
    expect(toDateOrNull(value)?.getTime()).toBe(instant.getTime())
  })
})
