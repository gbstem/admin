import {
  handleApiError,
  verifyAdminOrReviewer,
} from '#lib/server/apiHelpers.js'
import {
  decideInBulk,
  decideWithScorecard,
  saveInterviewNotes,
  saveLikelyDecision,
} from '#lib/server/applicationDecisions.js'
import { sendDecisionEmail } from '#lib/server/decisionEmails.js'
import { isDocId, requireKnownSemester } from '#lib/server/editTarget.js'
import { z } from 'zod'
import type { RequestHandler } from './$types'

const MAX_NOTES = 10000
/** The most applicants one bulk decision may name. */
const MAX_BULK_DECISIONS = 1000

const applicationId = z.string().refine(isDocId, 'An application is required')
const notes = z.string().max(MAX_NOTES, `Max ${MAX_NOTES} characters`)
// A cleared number field arrives as null or ''.
const score = z.preprocess(
  (value) => (value === null || value === '' ? 0 : value),
  z.coerce.number().min(0).max(5),
)
const likelyDecision = z
  .enum(['likely yes', 'likely no', 'likely waitlist'])
  .nullable()

/**
 * The interview scorecard the decision dialog edits: `Data.Interview` without
 * its `type`, which only the `decide` action sets.
 */
const scorecardSchema = z.object({
  date: z.string().max(50),
  interviewer: z.string().max(200),
  attendance: z.string().max(50),
  likelyDecision,
  notes,
  conversation: score,
  conversationNotes: notes,
  lastSemesterNotes: notes,
  mockLessonExplanations: score,
  mockLessonEngagement: score,
  mockLessonPace: score,
  mockLessonOverall: score,
  mockLessonNotes: notes,
  techNotes: notes,
  teachingPreferences: notes,
  availabilityNotes: notes,
})

const semesterId = z.string().min(1, 'A semester is required')

const decisionRequestSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('saveNotes'),
      semesterId,
      applicationId,
      interview: scorecardSchema,
    }),
    z.object({
      action: z.literal('setLikelyDecision'),
      semesterId,
      applicationId,
      likelyDecision,
    }),
    // One applicant with the scorecard the dialog holds, or several with the
    // decision alone. Either way each applicant is then emailed.
    z.object({
      action: z.literal('decide'),
      semesterId,
      applicationIds: z.array(applicationId).min(1).max(MAX_BULK_DECISIONS),
      decision: z.enum([
        'interview',
        'accepted',
        'substitute',
        'waitlisted',
        'rejected',
      ]),
      interview: scorecardSchema.optional(),
    }),
  ])
  .refine(
    (body) =>
      body.action !== 'decide' ||
      !body.interview ||
      body.applicationIds.length === 1,
    {
      message: 'A scorecard goes with exactly one application',
      path: ['interview'],
    },
  )

export type DecisionRequestBody = z.input<typeof decisionRequestSchema>

export interface DecisionResponse {
  /**
   * For `decide`: how many of the applicants could not be emailed. Their
   * decisions stand.
   */
  emailsFailed: number
}

/**
 * Every admin and reviewer write to an application's decision: the interview
 * notes, the likely decision, and the official decision with its email.
 * Reviewers are allowed, as they review applications.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    verifyAdminOrReviewer(locals)
    const body = decisionRequestSchema.parse(await request.json())
    const semester = requireKnownSemester(body.semesterId)

    if (body.action === 'saveNotes') {
      await saveInterviewNotes(
        semester,
        body.applicationId,
        body.interview as Data.Interview,
      )
      return Response.json({ emailsFailed: 0 } satisfies DecisionResponse)
    }
    if (body.action === 'setLikelyDecision') {
      await saveLikelyDecision(
        semester,
        body.applicationId,
        body.likelyDecision,
      )
      return Response.json({ emailsFailed: 0 } satisfies DecisionResponse)
    }

    const decided = body.interview
      ? [
          await decideWithScorecard(
            semester,
            body.applicationIds[0],
            body.decision,
            body.interview as Data.Interview,
          ),
        ]
      : await decideInBulk(semester, body.applicationIds, body.decision)
    const sent = await Promise.all(
      decided.map((applicant) => sendDecisionEmail(applicant, body.decision)),
    )
    return Response.json({
      emailsFailed: sent.filter((ok) => !ok).length,
    } satisfies DecisionResponse)
  } catch (err) {
    throw handleApiError('/api/decision', err)
  }
}
