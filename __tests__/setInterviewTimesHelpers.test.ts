process.env.TZ = 'America/New_York'
import type {} from '../src/data.d.ts'
import {
  parseInterviewSlotDoc,
  parseSlotRequestDoc,
  sortSlotRequestsByDate,
  filterEligibleInterviewees,
  generateInterviewSlotId,
  buildAssignInterviewApiPayload,
  resetInterviewSlotToAdd,
  canUserModifySlot,
} from '$lib/helpers/setInterviewTimes'

describe('SetInterviewTimes Helpers', () => {
  describe('parseInterviewSlotDoc', () => {
    test('returns null when input is null or missing date', () => {
      expect(parseInterviewSlotDoc('slot-1', null)).toBeNull()
      expect(parseInterviewSlotDoc('slot-1', {})).toBeNull()
    })

    test('parses raw doc into Data.InterviewSlot with ISO string date', () => {
      const testDate = new Date(2026, 4, 28, 14, 30)
      const rawData = {
        date: { seconds: Math.floor(testDate.getTime() / 1000) },
        interviewerName: 'Jane Doe',
        interviewerEmail: 'jane@example.com',
      }

      const slot = parseInterviewSlotDoc('slot-100', rawData)
      expect(slot?.id).toBe('slot-100')
      expect(slot?.interviewerName).toBe('Jane Doe')
      expect(slot?.date).toContain('2026-05-28')
    })
  })

  describe('parseSlotRequestDoc & sortSlotRequestsByDate', () => {
    test('parses raw request doc and extracts uid from ID when data.uid missing', () => {
      const raw = {
        date: { seconds: 1779900600 },
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
      }

      const req = parseSlotRequestDoc('uid123-2026-05-28', raw)
      expect(req?.id).toBe('uid123-2026-05-28')
      expect(req?.uid).toBe('uid123')
      expect(req?.firstName).toBe('Alice')
    })

    test('uses explicit data.uid when present in raw doc', () => {
      const raw = {
        uid: 'explicit-uid-456',
        date: { seconds: 1779900600 },
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@example.com',
      }

      const req = parseSlotRequestDoc('fallback-id-2026-05-28', raw)
      expect(req?.uid).toBe('explicit-uid-456')
      expect(req?.firstName).toBe('Bob')
    })

    test('sorts requests chronologically by date', () => {
      const req1 = { date: new Date('2026-05-20') } as Data.SlotRequest
      const req2 = { date: new Date('2026-05-10') } as Data.SlotRequest

      const sorted = sortSlotRequestsByDate([req1, req2])
      expect(sorted[0].date.getTime()).toBeLessThan(sorted[1].date.getTime())
    })
  })

  describe('filterEligibleInterviewees', () => {
    test('filters out applicants who are already interviewed or not submitted', () => {
      const docs = [
        {
          id: 'doc-1',
          meta: { interview: false, submitted: true },
          personal: { firstName: 'Alice', lastName: 'Zimmerman' },
        },
        {
          id: 'doc-2',
          meta: { interview: true, submitted: true }, // Already interviewed
          personal: { firstName: 'Bob', lastName: 'Smith' },
        },
        {
          id: 'doc-3',
          meta: { interview: false, submitted: false }, // Not submitted
          personal: { firstName: 'Charlie', lastName: 'Brown' },
        },
      ]

      const { names, options } = filterEligibleInterviewees(docs)
      expect(names).toEqual([{ name: 'Alice Zimmerman' }])
      expect(options).toHaveLength(1)
    })
  })

  describe('generateInterviewSlotId', () => {
    test('constructs unique ID combining timestamp and user UID', () => {
      const id = generateInterviewSlotId('2026-05-28T10:00:00Z', 'user456')
      expect(id).toContain('user456')
      expect(typeof id).toBe('string')
    })
  })

  describe('buildAssignInterviewApiPayload & resetInterviewSlotToAdd', () => {
    test('sends uids and none of the stored addresses', () => {
      const slot = resetInterviewSlotToAdd(
        'Jane Doe',
        'jane@example.com',
        'interviewer-uid-1',
      )
      slot.intervieweeFirstName = 'Alice'
      slot.intervieweeEmail = 'alice@example.com'
      slot.intervieweeId = 'interviewee-uid-1'
      slot.date = '2026-05-28T10:00'

      const payload = buildAssignInterviewApiPayload(slot)
      expect(payload.firstName).toBe('Alice')
      expect(payload.interviewer).toBe('Jane Doe')
      expect(payload.interviewerUid).toBe('interviewer-uid-1')
      expect(payload.intervieweeUid).toBe('interviewee-uid-1')
      // The server resolves both addresses from the uids, so a stale stored
      // address cannot misdirect mail.
      expect(payload).not.toHaveProperty('email')
      expect(payload).not.toHaveProperty('intervieweeEmail')
    })

    test('sends empty uids for a slot carrying none, for the server to refuse', () => {
      const slot = resetInterviewSlotToAdd('Jane Doe', 'jane@example.com', '')
      slot.intervieweeFirstName = 'Alice'
      slot.intervieweeEmail = 'alice@example.com'
      slot.intervieweeId = ''
      slot.date = '2026-05-28T10:00'

      const payload = buildAssignInterviewApiPayload(slot)
      expect(payload.interviewerUid).toBe('')
      expect(payload.intervieweeUid).toBe('')
      expect(payload).not.toHaveProperty('email')
      expect(payload).not.toHaveProperty('intervieweeEmail')
    })
  })

  describe('canUserModifySlot', () => {
    test('allows modification if user is slot owner or admin', () => {
      const slot = { interviewerEmail: 'owner@example.com', interviewerUid: '' }
      expect(
        canUserModifySlot(slot, 'owner@example.com', 'uid-owner', 'reviewer'),
      ).toBe(true)
      expect(
        canUserModifySlot(slot, 'other@example.com', 'uid-other', 'admin'),
      ).toBe(true)
      expect(
        canUserModifySlot(slot, 'other@example.com', 'uid-other', 'reviewer'),
      ).toBe(false)
    })

    test('matches by uid, not stale email, once the slot has a uid on file', () => {
      // The scenario from the production bug this guards against: the owner
      // changed their account's email after the slot was created, so
      // `interviewerEmail` is stale, but `interviewerUid` - a stable Firebase
      // Auth id - still identifies them.
      const slot = {
        interviewerEmail: 'old-owner@example.com',
        interviewerUid: 'uid-owner',
      }
      expect(
        canUserModifySlot(
          slot,
          'new-owner@example.com',
          'uid-owner',
          'reviewer',
        ),
      ).toBe(true)
      // A uid on the slot is authoritative - a different person's uid isn't
      // let in just because their email happens to match the stale one.
      expect(
        canUserModifySlot(
          slot,
          'old-owner@example.com',
          'uid-imposter',
          'reviewer',
        ),
      ).toBe(false)
    })
  })
})
