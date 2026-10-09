import { toDate } from '#lib/shared/timestamps.js'
import {
  checkInsCollection,
  registrationsCollection,
} from '#lib/data/collections.js'
import { retreatMealSchedule } from '#lib/data/retreatMealSchedule.js'
import { adminDb } from '#lib/server/firebase.js'
import { error } from '@sveltejs/kit'
import { cloneDeep } from 'lodash-es'

/** Meals by ISO date, each true once the student has been served it. */
type MealRecord = Record<string, Record<string, boolean>>

/** A student's check-in as the route reports it. */
export interface CheckIn {
  /** ISO instant. */
  checkedInAt: string
  food: MealRecord
}

/**
 * Checks a student in to the in-person program, seeding their meal record
 * from `retreatMealSchedule`. The time is the server's. Refused (404) for an
 * id with no registration this semester, so no stray record is created.
 *
 * Idempotent: a student already checked in keeps their original time and
 * their meals, rather than having the meals reset to unserved.
 */
export async function checkInStudent(
  registrationId: string,
  now: Date = new Date(),
): Promise<CheckIn> {
  const registrationRef = adminDb.doc(
    `${registrationsCollection}/${registrationId}`,
  )
  const checkInRef = adminDb.doc(`${checkInsCollection}/${registrationId}`)
  return adminDb.runTransaction(async (transaction) => {
    const registrationSnap = await transaction.get(registrationRef)
    const checkInSnap = await transaction.get(checkInRef)
    if (!registrationSnap.exists) {
      throw error(404, 'That student has no registration.')
    }
    const stored = checkInSnap.data()
    if (stored?.checkedIn) {
      return {
        checkedInAt: toDate(stored.checkedInAt).toISOString(),
        food: stored.food ?? {},
      }
    }
    const food = cloneDeep(retreatMealSchedule)
    transaction.set(
      checkInRef,
      { checkedIn: true, checkedInAt: now, food },
      { merge: true },
    )
    return { checkedInAt: now.toISOString(), food }
  })
}

/**
 * Records whether a checked-in student has been served one meal. Only a meal
 * already on their record can be set - the schedule they were checked in
 * with - so a request can't add dates or meals of its own. Refused (404) for
 * a student who isn't checked in.
 */
export async function setMealServed(
  registrationId: string,
  date: string,
  meal: string,
  served: boolean,
): Promise<void> {
  const checkInRef = adminDb.doc(`${checkInsCollection}/${registrationId}`)
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(checkInRef)
    const stored = snap.data()
    if (!stored?.checkedIn) {
      throw error(404, 'That student is not checked in.')
    }
    const food: MealRecord = stored.food ?? {}
    if (typeof food[date]?.[meal] !== 'boolean') {
      throw error(400, `No ${meal} is scheduled for ${date}.`)
    }
    transaction.update(checkInRef, {
      food: { ...food, [date]: { ...food[date], [meal]: served } },
    })
  })
}
