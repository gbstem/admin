import { ClassStatus } from '$lib/data/types/ClassStatus'
import { computeUpdatedClassStatuses } from '$lib/helpers/classStatuses'

describe('computeUpdatedClassStatuses', () => {
  const now = new Date('2026-05-10T12:00:00Z')

  it('pads statuses with ClassInFuture when the schedule is longer', () => {
    const { updatedStatuses, hasChanged } = computeUpdatedClassStatuses(
      [],
      [false, false],
      ['2026-05-15T12:00:00Z', '2026-05-20T12:00:00Z'],
      now,
    )

    expect(hasChanged).toBe(true)
    expect(updatedStatuses).toEqual([
      ClassStatus.ClassInFuture,
      ClassStatus.ClassInFuture,
    ])
  })

  it.each([
    ['complete when its feedback is in', true, ClassStatus.EverythingComplete],
    ['not held when it has none', false, ClassStatus.ClassNotHeld],
  ])('marks a past, unheld session %s', (_, feedback, expected) => {
    const { updatedStatuses, hasChanged } = computeUpdatedClassStatuses(
      [ClassStatus.ClassInFuture],
      [feedback],
      ['2026-05-01T12:00:00Z'],
      now,
    )

    expect(updatedStatuses).toEqual([expected])
    expect(hasChanged).toBe(true)
  })

  it('completes a held session once its feedback is filed', () => {
    const { updatedStatuses } = computeUpdatedClassStatuses(
      [ClassStatus.FeedbackIncomplete],
      [true],
      ['2026-05-01T12:00:00Z'],
      now,
    )

    expect(updatedStatuses).toEqual([ClassStatus.EverythingComplete])
  })

  it('marks a session starting within half an hour as upcoming', () => {
    const { updatedStatuses } = computeUpdatedClassStatuses(
      [ClassStatus.ClassInFuture],
      [false],
      [new Date(Date.now() + 10 * 60 * 1000)],
    )

    expect(updatedStatuses).toEqual([ClassStatus.ClassUpcomingSoon])
  })

  it('reports no change when every status is already current', () => {
    const statuses = [ClassStatus.FeedbackIncomplete, ClassStatus.ClassInFuture]
    const { updatedStatuses, hasChanged } = computeUpdatedClassStatuses(
      statuses,
      [false, false],
      ['2026-05-01T12:00:00Z', '2026-05-20T12:00:00Z'],
      now,
    )

    expect(updatedStatuses).toEqual(statuses)
    expect(hasChanged).toBe(false)
  })

  it('keeps a session held early as held, before and after its start', () => {
    const start = Date.now() + 10 * 60 * 1000
    const meetingTimes = [new Date(start)]

    const before = computeUpdatedClassStatuses(
      [ClassStatus.FeedbackIncomplete],
      [false],
      meetingTimes,
    )
    expect(before.updatedStatuses).toEqual([ClassStatus.FeedbackIncomplete])

    const after = computeUpdatedClassStatuses(
      before.updatedStatuses,
      [false],
      meetingTimes,
      new Date(start + 60 * 60 * 1000),
    )
    expect(after.updatedStatuses).toEqual([ClassStatus.FeedbackIncomplete])
  })
})
