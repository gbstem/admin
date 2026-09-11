import { interviewService } from '$lib/services/interviewService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

const mockBatch = { set: jest.fn(), update: jest.fn(), commit: jest.fn() }

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  getDocs: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  writeBatch: jest.fn(() => mockBatch),
}))

describe('interviewService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockBatch.commit.mockReset().mockResolvedValue(undefined)
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

  describe('createOrAssignInterviewSlot', () => {
    const slotToAdd = {
      date: '2026-08-01T15:00:00.000Z',
      meetingLink: 'https://zoom.us/1',
      interviewerName: 'Alice',
      interviewerEmail: 'alice@example.com',
      intervieweeId: 'uid-123',
      intervieweeEmail: 'student@example.com',
      intervieweeFirstName: 'Timmy',
    } as Data.InterviewSlot

    it("writes an assigned slot and its applicant's meta.interview in one batch, then emails", async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })

      const result = await interviewService.createOrAssignInterviewSlot(
        slotToAdd,
        'doc-123',
        'user-1',
      )

      expect(result.id).toBeDefined()
      expect(firestore.writeBatch).toHaveBeenCalledTimes(1)
      expect(mockBatch.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: result.id, intervieweeId: 'uid-123' }),
      )
      expect(mockBatch.update).toHaveBeenCalledWith(expect.anything(), {
        'meta.interview': true,
      })
      expect(mockBatch.commit).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/assignInterview',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('writes an unassigned slot alone and emails nobody', async () => {
      await interviewService.createOrAssignInterviewSlot(
        { ...slotToAdd, intervieweeId: '' },
        undefined,
        'user-1',
      )

      expect(mockBatch.set).toHaveBeenCalledTimes(1)
      expect(mockBatch.update).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('emails nobody when the batch is refused', async () => {
      mockBatch.commit.mockRejectedValueOnce(new Error('permission-denied'))

      await expect(
        interviewService.createOrAssignInterviewSlot(
          slotToAdd,
          'doc-123',
          'user-1',
        ),
      ).rejects.toThrow('permission-denied')
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('throws error if API assignment call fails', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

      await expect(
        interviewService.createOrAssignInterviewSlot(
          slotToAdd,
          'doc-123',
          'user-1',
        ),
      ).rejects.toThrow('Failed to send interview assignment email')
    })
  })

  describe('updateInterviewSlot', () => {
    it('writes only the date, as a Date, and the meeting link', async () => {
      ;(firestore.updateDoc as jest.Mock).mockResolvedValueOnce(undefined)

      const interview = {
        id: 'slot-1',
        date: '2026-08-01T15:00:00.000Z',
        meetingLink: 'https://zoom.us/2',
        interviewerName: 'Alice',
        interviewerEmail: 'alice@example.com',
        // Stale copies of what an applicant's booking owns - never written.
        intervieweeId: '',
        interviewSlotStatus: 'available',
      } as unknown as Data.InterviewSlot

      await interviewService.updateInterviewSlot(interview)

      expect(firestore.updateDoc).toHaveBeenCalledTimes(1)
      const [, payload] = (firestore.updateDoc as jest.Mock).mock.calls[0]
      expect(Object.keys(payload).sort()).toEqual(['date', 'meetingLink'])
      expect(payload.date).toBeInstanceOf(Date)
      expect(payload.meetingLink).toBe('https://zoom.us/2')
    })

    it('propagates errors from updateDoc', async () => {
      ;(firestore.updateDoc as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )

      const interview = {
        id: 'slot-1',
        date: '2026-08-01T15:00:00.000Z',
        meetingLink: 'https://zoom.us/2',
      } as unknown as Data.InterviewSlot

      await expect(
        interviewService.updateInterviewSlot(interview),
      ).rejects.toThrow('permission-denied')
    })
  })

  describe('deleteInterviewSlot', () => {
    it('calls deleteDoc with slot id', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockResolvedValueOnce(undefined)
      await interviewService.deleteInterviewSlot('slot-1')
      expect(firestore.deleteDoc).toHaveBeenCalled()
    })

    it('propagates errors from deleteDoc', async () => {
      ;(firestore.deleteDoc as jest.Mock).mockRejectedValueOnce(
        new Error('not-found'),
      )
      await expect(
        interviewService.deleteInterviewSlot('slot-1'),
      ).rejects.toThrow('not-found')
    })
  })
})
