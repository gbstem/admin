import { E2E_INTERVIEWS_END, FIRESTORE_EMULATOR_HOST } from '$app/env/private'
import { semesterDates } from '#lib/data/collections.js'
import {
  interviewWindow,
  type InterviewWindow,
} from '#lib/shared/interviews.js'

/**
 * The interview window as the server enforces it on the availability grid:
 * `interviewsStart` through `interviewsEnd` in New York time (see
 * `interviewWindow`). `E2E_INTERVIEWS_END` replaces the last day while the
 * Firestore emulator is in use, as portal's interviewSchedulingWindow does:
 * Cypress can move the browser's clock but not the server's, and e2e tests
 * paint slots dated from today.
 */
export function interviewSchedulingWindow(
  env: Record<string, string | undefined> = {
    FIRESTORE_EMULATOR_HOST,
    E2E_INTERVIEWS_END,
  },
): InterviewWindow {
  return interviewWindow({
    interviewsStart: semesterDates.interviewsStart,
    interviewsEnd:
      (env.FIRESTORE_EMULATOR_HOST && env.E2E_INTERVIEWS_END) ||
      semesterDates.interviewsEnd,
  })
}

/** The window as a load or response sends it: ISO strings. */
export function serializedInterviewWindow(
  window = interviewSchedulingWindow(),
) {
  return {
    opens: window.opens.toISOString(),
    closes: window.closes.toISOString(),
  }
}
