import { interviewService } from '$lib/services/interviewService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
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

  describe('fetchSlotRequests', () => {
    it('queries and returns sorted slot requests', async () => {
      const mockDocs = [
        {
          id: 'req-1',
          data: () => ({
            date: { seconds: 1779900600 },
            name: 'Bob',
          }),
        },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        forEach: (cb: any) => mockDocs.forEach(cb),
      })

      const requests = await interviewService.fetchSlotRequests()
      expect(requests.length).toBe(1)
      expect(requests[0].id).toBe('req-1')
    })
  })

  describe('fetchEligibleInterviewees', () => {
    it('queries applications and filters to eligible interviewees', async () => {
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
            meta: { interview: true, submitted: true },
            personal: { firstName: 'Already', lastName: 'Scheduled' },
          }),
        },
      ]
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce({
        docs: mockDocs,
      })

      const result = await interviewService.fetchEligibleInterviewees()
      expect(result.names).toEqual([{ name: 'Timmy Tester' }])
      expect(result.options).toHaveLength(1)
      expect((result.options[0] as any).docId).toBe('app-1')
    })
  })

  describe('fetchSlotRequestEmails', () => {
    const requests = [
      { id: 'uid-a-2026-09-30', uid: 'uid-a' },
      { id: 'uid-b-2026-10-01', uid: 'uid-b' },
    ] as Data.SlotRequest[]

    it('asks once for every request and keys the addresses by request', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            emails: { 'uid-a': 'a@example.com', 'uid-b': null },
          }),
      })

      await expect(
        interviewService.fetchSlotRequestEmails(requests),
      ).resolves.toEqual({ 'uid-a-2026-09-30': 'a@example.com' })
      expect(global.fetch).toHaveBeenCalledTimes(1)
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
      expect(url).toBe('/api/resolveEmails')
      expect(JSON.parse(init.body)).toEqual({
        intent: 'slotRequestApplicants',
        uids: ['uid-a', 'uid-b'],
        context: { requestIds: ['uid-a-2026-09-30', 'uid-b-2026-10-01'] },
      })
    })

    it('makes no request when none of them records a uid', async () => {
      await expect(
        interviewService.fetchSlotRequestEmails([
          { id: 'legacy' } as Data.SlotRequest,
        ]),
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
