// interviews.ts - The facts about instructor interviews both sites schedule
// against. Kept byte-identical in admin and portal, and free of `#lib`
// imports, like the rest of `src/lib/shared/`.

import { gbstemMidnight } from './gbstemTime'

/**
 * How long an interview is planned to take, in minutes. It sizes slots, and
 * applicants are told it as "usually", since a conversation can run long.
 */
export const INTERVIEW_DURATION_MINUTES = 15

/** semesterDates.json's interview dates: inclusive, `MM/DD/YY`. */
export interface InterviewDates {
  interviewsStart: string
  interviewsEnd: string
}

/** When interviews can be held: from `opens`, up to but not at `closes`. */
export interface InterviewWindow {
  opens: Date
  closes: Date
}

/**
 * The interview window as instants: midnight in gbSTEM's time zone at the
 * start of `interviewsStart`, to midnight at the end of `interviewsEnd`.
 */
export function interviewWindow({
  interviewsStart,
  interviewsEnd,
}: InterviewDates): InterviewWindow {
  return {
    opens: gbstemMidnight(interviewsStart),
    closes: gbstemMidnight(interviewsEnd, 1),
  }
}

/** Whether an interview at `date` falls inside `window`. */
export function isWithinInterviewWindow(
  date: Date,
  { opens, closes }: InterviewWindow,
): boolean {
  return date >= opens && date < closes
}
