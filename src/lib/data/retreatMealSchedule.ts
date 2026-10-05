/**
 * The meal schedule seeded onto a student's `checkIns` record when they check
 * in at gbSTEM's in-person retreat, keyed by ISO date (YYYY-MM-DD) to the
 * meals served that day. Only admin reads it, so it lives here as a small
 * standalone config rather than in `semesterDates.json`, which portal and the
 * website copy.
 *
 * Left empty by default - no retreat is currently scheduled, so check-in seeds
 * an empty meal schedule and the check-in page simply shows no meals to
 * track. When a retreat is scheduled, fill this in with that event's actual
 * dates and meals, for example:
 *
 * export const retreatMealSchedule: Record<string, Record<string, boolean>> = {
 *   '2026-10-16': { dinner: false },
 *   '2026-10-17': { breakfast: false, lunch: false, dinner: false },
 *   '2026-10-18': { breakfast: false },
 * }
 */
export const retreatMealSchedule: Record<string, Record<string, boolean>> = {}
