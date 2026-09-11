import { planAdminAccountDeletion } from '$lib/helpers/accountDeletion'

const now = new Date('2026-09-15T00:00:00Z')
const future = new Date('2026-09-20T00:00:00Z')
const past = new Date('2026-09-01T00:00:00Z')

describe('planAdminAccountDeletion', () => {
  it('allows deletion with no slots at all', () => {
    expect(planAdminAccountDeletion([], now)).toEqual({
      canDelete: true,
      reason: null,
      openSlotIds: [],
    })
  })

  it('allows deletion and lists every open slot when none are booked', () => {
    const result = planAdminAccountDeletion(
      [
        { id: 'slot-1', intervieweeId: '', date: future },
        { id: 'slot-2', intervieweeId: '', date: past },
      ],
      now,
    )
    expect(result.canDelete).toBe(true)
    expect(result.openSlotIds.sort()).toEqual(['slot-1', 'slot-2'])
  })

  it('blocks deletion for a future booked slot', () => {
    const result = planAdminAccountDeletion(
      [{ id: 'slot-1', intervieweeId: 'applicant-uid', date: future }],
      now,
    )
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/scheduled interview/i)
    expect(result.openSlotIds).toEqual([])
  })

  it('allows deletion for a past booked slot, and does not list it as open', () => {
    const result = planAdminAccountDeletion(
      [{ id: 'slot-1', intervieweeId: 'applicant-uid', date: past }],
      now,
    )
    expect(result.canDelete).toBe(true)
    expect(result.openSlotIds).toEqual([])
  })

  it('blocks on a future booked slot even alongside past booked and open slots', () => {
    const result = planAdminAccountDeletion(
      [
        { id: 'past-booked', intervieweeId: 'uid-1', date: past },
        { id: 'open', intervieweeId: '', date: future },
        { id: 'future-booked', intervieweeId: 'uid-2', date: future },
      ],
      now,
    )
    expect(result.canDelete).toBe(false)
    expect(result.openSlotIds).toEqual([])
  })

  it('lists only the open slots when eligible, leaving past-booked ones out', () => {
    const result = planAdminAccountDeletion(
      [
        { id: 'past-booked', intervieweeId: 'uid-1', date: past },
        { id: 'open-1', intervieweeId: '', date: future },
        { id: 'open-2', intervieweeId: '', date: past },
      ],
      now,
    )
    expect(result.canDelete).toBe(true)
    expect(result.openSlotIds.sort()).toEqual(['open-1', 'open-2'])
  })
})
