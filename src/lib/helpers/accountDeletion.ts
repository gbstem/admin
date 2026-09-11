/** One interview slot as far as the account-deletion check needs to know. */
export interface InterviewSlotForDeletion {
  id: string
  intervieweeId: string
  date: Date
}

export interface AccountDeletionPlan {
  canDelete: boolean
  reason: string | null
  /**
   * Slots to delete when `canDelete` is true: every slot with no interviewee,
   * regardless of date - a past unbooked slot is just clutter, not a record
   * of anything. A past *booked* slot is left out on purpose: its
   * `interviewerUid` is documented (schemas.ts) as "retained as a permanent
   * record of the interviewer if an account is deleted" - it's history, not
   * cleanup.
   */
  openSlotIds: string[]
}

/**
 * Decides whether an admin/reviewer account can be deleted, from every
 * interview slot where they're the interviewer.
 *
 * Blocked only by a *future* booked slot - a completed one is history (see
 * `openSlotIds`'s doc comment), and this account is the one person who could
 * still reassign or cancel it before deleting. Pure and Firestore-agnostic:
 * callers convert `Timestamp`s to `Date`s before calling this.
 */
export function planAdminAccountDeletion(
  slots: InterviewSlotForDeletion[],
  now: Date,
): AccountDeletionPlan {
  const futureBooked = slots.filter(
    (slot) => slot.intervieweeId && slot.date > now,
  )
  if (futureBooked.length > 0) {
    return {
      canDelete: false,
      reason:
        'You have a scheduled interview coming up this semester. Please reassign or cancel it before deleting your account.',
      openSlotIds: [],
    }
  }
  return {
    canDelete: true,
    reason: null,
    openSlotIds: slots
      .filter((slot) => !slot.intervieweeId)
      .map((slot) => slot.id),
  }
}
