import { classesCollection } from '$lib/data/collections'
import type ClassData from '$lib/data/types/ClassData'
import { adminDb } from '$lib/server/firebase'
import { error } from '@sveltejs/kit'
import { z } from 'zod'

/**
 * Which accounts' current email addresses a caller may look up through
 * /api/resolveEmails, and why.
 *
 * A request names an intent (the view or task it is for), the uids it wants,
 * and a context: the document that relates those uids to the view. The
 * intent's policy reads that document with the Admin SDK and returns the uids
 * the caller may resolve under it. The whole request is refused unless the
 * caller's role is one the intent allows and every requested uid is one the
 * policy returned. Admin and reviewer can read these documents anyway, so here
 * the context is defence in depth rather than the gate itself: one stolen
 * reviewer session still can't turn a list of uids into a list of addresses.
 *
 * A policy should grant no more than its view showed back when it read the
 * address straight off a document. See notes/EMAIL_TO_UID_AUDIT.md, Phase 5
 * item 4.
 *
 * To add a use case: add its request shape to `resolveEmailsSchema` and its
 * policy to `policies` (which won't typecheck until both exist), then give the
 * client service that owns the view's data a task-named wrapper around
 * `accountEmailService.resolveEmails`. Portal keeps its own copy of this file
 * with portal's intents; the route and the Auth lookup are shared verbatim.
 */

/**
 * Per request. Auth caps a uid at 128 characters, and a longer one would fail
 * the whole batched lookup rather than just itself.
 */
const MAX_UIDS = 500
const uids = z.array(z.string().min(1).max(128)).min(1).max(MAX_UIDS)

export const resolveEmailsSchema = z.discriminatedUnion('intent', [
  // StudentDetails' "Instructor Email" column, one row per enrolled class.
  // TODO: add an optional `semesterId` to the context when a past-semester
  // view needs this; `classesCollection` is the current semester's.
  z.object({
    intent: z.literal('classInstructors'),
    uids,
    context: z.object({ classId: z.string().min(1) }),
  }),
])

export type ResolveEmailsRequestBody = z.infer<typeof resolveEmailsSchema>

type Intent = ResolveEmailsRequestBody['intent']
type ContextFor<I extends Intent> = Extract<
  ResolveEmailsRequestBody,
  { intent: I }
>['context']

interface IntentPolicy<I extends Intent> {
  /** The roles that may make this request at all. */
  roles: readonly Data.Role[]
  /** The uids `caller` may resolve under `context`; empty if it grants none. */
  resolvableUids(
    caller: Data.User.Peek,
    context: ContextFor<I>,
  ): Promise<string[]>
}

const policies: { [I in Intent]: IntentPolicy<I> } = {
  classInstructors: {
    roles: ['admin', 'reviewer'],
    // The class's owner and its co-instructors.
    async resolvableUids(_caller, { classId }) {
      const snap = await adminDb.doc(`${classesCollection}/${classId}`).get()
      const classData = snap.data() as Partial<ClassData> | undefined
      if (!classData) return []
      return [
        classData.instructorUid,
        ...(classData.otherInstructorUids ?? []),
      ].filter((uid): uid is string => Boolean(uid))
    },
  },
}

/**
 * The one message for every refusal - wrong role, a context document that is
 * missing or grants nothing, or a uid it doesn't cover - so a refusal can't
 * be used to probe which documents exist or whom they name.
 */
export const EMAIL_LOOKUP_REFUSED =
  'You are not allowed to look up those email addresses.'

/**
 * Throws a 403 unless `caller` may resolve every uid in `request`.
 */
export async function authorizeEmailResolution(
  caller: Data.User.Peek,
  request: ResolveEmailsRequestBody,
): Promise<void> {
  const policy = policies[request.intent] as IntentPolicy<Intent>
  const allowed = new Set(
    policy.roles.includes(caller.role)
      ? await policy.resolvableUids(caller, request.context)
      : [],
  )
  if (request.uids.some((uid) => !allowed.has(uid))) {
    console.warn(
      `[API /api/resolveEmails] refused ${request.intent} for uid ${caller.uid}`,
    )
    throw error(403, EMAIL_LOOKUP_REFUSED)
  }
}
