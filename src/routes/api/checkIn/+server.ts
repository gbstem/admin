import {
  handleApiError,
  verifyAdminOrReviewer,
} from '#lib/server/apiHelpers.js'
import {
  checkInStudent,
  setMealServed,
  type CheckIn,
} from '#lib/server/checkIns.js'
import { isDocId } from '#lib/server/editTarget.js'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const registrationId = z
  .string()
  .refine(isDocId, { message: 'A student is required' })

// Only which student: the time is the server's and the meal schedule the
// app's own.
const checkInSchema = z.object({ registrationId })

const mealSchema = z.object({
  registrationId,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date is required'),
  // A field name on the check-in record, so no path separators.
  meal: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9 _-]{0,39}$/, 'A meal is required'),
  served: z.boolean(),
})

export type CheckInRequestBody = z.infer<typeof checkInSchema>
export type MealRequestBody = z.infer<typeof mealSchema>
export type CheckInResponse = CheckIn

/** Checks a student in to the in-person program. */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdminOrReviewer(locals)
    const body = checkInSchema.parse(await request.json())
    return Response.json(
      (await checkInStudent(body.registrationId)) satisfies CheckInResponse,
    )
  } catch (err) {
    throw handleApiError('/api/checkIn', err)
  }
}

/** Records whether a checked-in student has been served one meal. */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdminOrReviewer(locals)
    const body = mealSchema.parse(await request.json())
    await setMealServed(body.registrationId, body.date, body.meal, body.served)
    return Response.json({ success: true })
  } catch (err) {
    throw handleApiError('/api/checkIn', err)
  }
}
