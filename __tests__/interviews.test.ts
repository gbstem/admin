import {
  INTERVIEW_DURATION_MINUTES,
  interviewWindow,
  isWithinInterviewWindow,
} from '../src/lib/shared/interviews'

const window = interviewWindow({
  interviewsStart: '08/05/26',
  interviewsEnd: '09/19/26',
})

describe('interviewWindow', () => {
  it('opens at midnight New York time on the first day', () => {
    expect(window.opens.toISOString()).toBe('2026-08-05T04:00:00.000Z')
  })

  it('closes at midnight New York time after the last day', () => {
    expect(window.closes.toISOString()).toBe('2026-09-20T04:00:00.000Z')
  })
})

describe('isWithinInterviewWindow', () => {
  it.each([
    ['the first instant', '2026-08-05T04:00:00.000Z', true],
    ['11:59 PM ET on the last day', '2026-09-20T03:59:00.000Z', true],
    ['the instant it closes', '2026-09-20T04:00:00.000Z', false],
    ['the evening before it opens', '2026-08-05T03:00:00.000Z', false],
  ])('%s: %s -> %s', (_, iso, expected) => {
    expect(isWithinInterviewWindow(new Date(iso), window)).toBe(expected)
  })
})

describe('INTERVIEW_DURATION_MINUTES', () => {
  it('is 15', () => {
    expect(INTERVIEW_DURATION_MINUTES).toBe(15)
  })
})
