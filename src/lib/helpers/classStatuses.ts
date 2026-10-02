import { ClassStatus } from '../data/types/ClassStatus'
import { isClassUpcoming } from '../utils'

/**
 * Brings a class's per-session statuses up to date with the clock: a session
 * whose time has passed without being held becomes "not held" (or complete,
 * if its feedback is in), one starting within half an hour becomes "upcoming",
 * and a held one whose feedback has since been filed becomes complete.
 * Statuses shorter than the schedule are padded with "in future".
 *
 * Kept identical to portal's `computeUpdatedClassStatuses`, which instructors'
 * class pages run through /api/classSchedule: the two write the same field.
 */
export function computeUpdatedClassStatuses(
  classStatuses: string[],
  feedbackCompleted: boolean[],
  meetingTimes: (Date | string)[],
  now: Date = new Date(),
): { updatedStatuses: string[]; hasChanged: boolean } {
  const originalStatuses = [...classStatuses]
  const paddedStatuses = classStatuses.concat(
    Array(Math.max(0, meetingTimes.length - classStatuses.length)).fill(
      ClassStatus.ClassInFuture,
    ),
  )

  const updateStatuses = (classStatus: string, index: number) => {
    const meetingDate = new Date(meetingTimes[index])
    const held =
      classStatus === ClassStatus.EverythingComplete ||
      classStatus === ClassStatus.FeedbackIncomplete
    if (now > meetingDate && !held) {
      return feedbackCompleted[index]
        ? ClassStatus.EverythingComplete
        : ClassStatus.ClassNotHeld
    } else if (isClassUpcoming(meetingDate) && !held) {
      // A session held a few minutes early is still held: turning it back
      // into "upcoming" let it become "not held" once its start time passed.
      return ClassStatus.ClassUpcomingSoon
    } else if (
      classStatus === ClassStatus.FeedbackIncomplete &&
      feedbackCompleted[index]
    ) {
      return ClassStatus.EverythingComplete
    } else {
      return classStatus
    }
  }

  const updatedStatuses = paddedStatuses.map(updateStatuses)
  const hasChanged =
    updatedStatuses.length !== originalStatuses.length ||
    updatedStatuses.some((st, i) => st !== originalStatuses[i])

  return { updatedStatuses, hasChanged }
}
