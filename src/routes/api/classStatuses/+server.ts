import { handleApiError, verifyAdminOrReviewer } from '$lib/server/apiHelpers'
import { classService } from '$lib/server/classService'
import { isDocId } from '$lib/server/editTarget'
import { json } from '@sveltejs/kit'
import { z } from 'zod'
import type { RequestHandler } from './$types'

// Only which class crosses the wire: every per-session status is worked out
// server-side from the class as stored.
const classStatusesSchema = z.object({
  classId: z.string().refine(isDocId, { message: 'A class is required' }),
})

export type ClassStatusesRequestBody = z.infer<typeof classStatusesSchema>

export interface ClassStatusesResponse {
  classStatuses: string[]
}

/**
 * Brings a class's per-session statuses up to date with the clock, for the
 * class dialog an admin or reviewer has just opened, and returns them.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdminOrReviewer(locals)
    const { classId } = classStatusesSchema.parse(await request.json())
    return json({
      classStatuses: await classService.refreshClassStatuses(classId),
    } satisfies ClassStatusesResponse)
  } catch (err) {
    throw handleApiError('/api/classStatuses', err)
  }
}
