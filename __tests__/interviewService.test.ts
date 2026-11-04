import { currentSemester } from '#lib/data/collections.js'
import { interviewService } from '#lib/services/interviewService.js'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn((...args) => args),
  getDocs: jest.fn(),
}))

describe('interviewService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
  })

  describe('fetchInterviewSlots', () => {
    it('queries and parses interview slots from Firestore', async () => {
      const mockDocs = [
        {
          id: 'slot-1',
          data: () => ({
            date: { seconds: 1779900600 },
            interviewerName: 'Alice',
            meetingLink: 'https://zoom.us/1',
          }),
        },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) => mockDocs.forEach(cb),
      })

      const slots = await interviewService.fetchInterviewSlots()
      expect(slots.length).toBe(1)
      expect(slots[0].id).toBe('slot-1')
    })
  })

  describe('fetchCandidateAvailability', () => {
    it("parses each candidate's times, soonest first", async () => {
      const mockDocs = [
        {
          id: 'uid-a',
          data: () => ({
            times: [{ seconds: 1790000000 }, { seconds: 1780000000 }],
            updated: { seconds: 1779000000 },
          }),
        },
        { id: 'broken', data: () => ({}) },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockDocs,
      })

      await expect(
        interviewService.fetchCandidateAvailability(),
      ).resolves.toEqual([
        {
          uid: 'uid-a',
          times: [new Date(1780000000 * 1000), new Date(1790000000 * 1000)],
          updated: new Date(1779000000 * 1000),
        },
      ])
    })
  })

  describe('fetchEligibleInterviewees', () => {
    it('reads unscheduled applications and keeps those needing an interview', async () => {
      const mockDocs = [
        {
          id: 'app-1',
          data: () => ({
            meta: { interview: false, submitted: true },
            personal: { firstName: 'Timmy', lastName: 'Tester' },
          }),
        },
        {
          id: 'app-2',
          data: () => ({
            meta: {
              interview: false,
              submitted: true,
              decisionType: 'rejected',
            },
            personal: { firstName: 'Already', lastName: 'Decided' },
          }),
        },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockDocs,
      })

      const result = await interviewService.fetchEligibleInterviewees()
      expect(firestore.where).toHaveBeenCalledWith(
        'meta.interview',
        '==',
        false,
      )
      expect(result).toEqual([
        {
          applicationId: 'app-1',
          uid: 'app-1',
          firstName: 'Timmy',
          lastName: 'Tester',
        },
      ])
    })
  })

  describe('fetchIntervieweeEmails', () => {
    const interviewees = [
      { applicationId: 'uid-a', uid: 'uid-a', firstName: 'A', lastName: '' },
      { applicationId: 'uid-b', uid: 'uid-b', firstName: 'B', lastName: '' },
    ]

    it('asks once for every candidate and keys the addresses by application', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            emails: { 'uid-a': 'a@example.com', 'uid-b': null },
          }),
      })

      await expect(
        interviewService.fetchIntervieweeEmails(interviewees),
      ).resolves.toEqual({ 'uid-a': 'a@example.com' })
      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/resolveEmails')
      expect(JSON.parse(init.body)).toEqual({
        intent: 'applicants',
        uids: ['uid-a', 'uid-b'],
        context: {
          applicationIds: ['uid-a', 'uid-b'],
          semesterId: currentSemester,
        },
      })
    })

    it('makes no request when there is no one to look up', async () => {
      await expect(
        interviewService.fetchIntervieweeEmails([]),
      ).resolves.toEqual({})
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('slot writes', () => {
    const respond = (body: unknown, ok = true) =>
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok,
        statusText: 'Forbidden',
        json: async () => body,
      })
    const sent = () => {
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/interviewSlot')
      return { method: init.method, body: JSON.parse(init.body) }
    }

    it('createOrAssignInterviewSlot posts the time as an instant, with the application when assigning', async () => {
      respond({ id: 'slot-1', emailSent: true })

      await expect(
        interviewService.createOrAssignInterviewSlot(
          { date: '2026-10-05T14:00', meetingLink: 'https://zoom.us/j/1' },
          'app-1',
        ),
      ).resolves.toEqual({ id: 'slot-1', emailSent: true })

      expect(sent()).toEqual({
        method: 'POST',
        body: {
          // The form's local date-time, as the instant it names here.
          date: new Date('2026-10-05T14:00').toISOString(),
          meetingLink: 'https://zoom.us/j/1',
          applicationId: 'app-1',
        },
      })
    })

    it('createOrAssignInterviewSlot names no application for an open slot', async () => {
      respond({ id: 'slot-1', emailSent: true })

      await interviewService.createOrAssignInterviewSlot({
        date: '2026-10-05T14:00',
        meetingLink: 'https://zoom.us/j/1',
      })

      expect(sent().body).not.toHaveProperty('applicationId')
    })

    it('createOpenInterviewSlots posts every time as an instant, with one link', async () => {
      const counts = {
        created: 2,
        replaced: 0,
        skippedBooked: 0,
        skippedOverlap: 0,
        skippedOutside: 0,
      }
      respond(counts)
      const dates = [
        new Date('2030-01-15T20:00:00.000Z'),
        new Date('2030-01-15T20:15:00.000Z'),
      ]

      await expect(
        interviewService.createOpenInterviewSlots(dates, 'https://zoom.us/j/1'),
      ).resolves.toEqual(counts)
      expect(sent()).toEqual({
        method: 'POST',
        body: {
          action: 'createMany',
          dates: dates.map((date) => date.toISOString()),
          meetingLink: 'https://zoom.us/j/1',
        },
      })
    })

    it('deleteOpenInterviewSlots sends only the slot ids', async () => {
      respond({ deleted: 1, skippedBooked: 1, skippedNotOwn: 0 })

      await interviewService.deleteOpenInterviewSlots(['slot-1', 'slot-2'])
      expect(sent()).toEqual({
        method: 'DELETE',
        body: { action: 'deleteMany', slotIds: ['slot-1', 'slot-2'] },
      })
    })

    it('createOpenInterviewSlots throws the refusal', async () => {
      respond({ message: 'Paint at least one time' }, false)

      await expect(
        interviewService.createOpenInterviewSlots([], 'https://zoom.us/j/1'),
      ).rejects.toThrow('Paint at least one time')
    })

    it('updateInterviewSlot patches only the date and the meeting link', async () => {
      respond({})

      await interviewService.updateInterviewSlot({
        id: 'slot-1',
        date: '2026-10-05T14:00',
        meetingLink: 'https://zoom.us/j/2',
        intervieweeId: 'someone',
      } as Data.InterviewSlot)

      expect(sent()).toEqual({
        method: 'PATCH',
        body: {
          slotId: 'slot-1',
          date: new Date('2026-10-05T14:00').toISOString(),
          meetingLink: 'https://zoom.us/j/2',
        },
      })
    })

    it('deleteInterviewSlot names the slot alone', async () => {
      respond({})

      await interviewService.deleteInterviewSlot({ id: 'slot-1' })

      expect(sent()).toEqual({ method: 'DELETE', body: { slotId: 'slot-1' } })
    })

    it('markInterviewSlotMissed names the slot and who missed it', async () => {
      respond({})

      await interviewService.markInterviewSlotMissed(
        { id: 'slot-1' },
        'interviewer',
      )

      expect(sent()).toEqual({
        method: 'PATCH',
        body: {
          action: 'markMissed',
          slotId: 'slot-1',
          missedBy: 'interviewer',
        },
      })
    })

    it("throws the route's refusal", async () => {
      respond(
        {
          message:
            'This interview does not belong to you and you are not an admin!',
        },
        false,
      )

      await expect(
        interviewService.deleteInterviewSlot({ id: 'slot-1' }),
      ).rejects.toThrow('does not belong to you')
    })
  })
})
