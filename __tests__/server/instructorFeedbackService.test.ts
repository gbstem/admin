const mockGet = jest.fn()
const mockQuery = {
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  get: (...args: any[]) => mockGet(...args),
}
const mockCollection = jest.fn()
const mockSearchIndex = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
  },
}))

jest.mock('$lib/server/search', () => ({
  searchIndex: (...args: any[]) => mockSearchIndex(...args),
}))

import { instructorFeedbackCollection } from '$lib/data/collections'
import { instructorFeedbackService } from '$lib/server/instructorFeedbackService'

const storedFeedback = (overrides: Record<string, unknown> = {}) => ({
  instructorName: 'Grace Hopper',
  students: ['Ada Lovelace', 'Alan Turing'],
  attendanceList: [{ present: true }, { present: false }],
  date: '2026-09-01',
  courseName: 'Python 1',
  feedback: 'Great class.',
  classNumber: 3,
  ...overrides,
})

describe('instructorFeedbackService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
  })

  describe('fetchInstructorFeedback', () => {
    it('reads the instructor feedback collection', async () => {
      await instructorFeedbackService.fetchInstructorFeedback({
        limit: 25,
        offset: 0,
      })

      expect(mockCollection).toHaveBeenCalledWith(instructorFeedbackCollection)
    })

    it('narrows to a course when a specific one is given', async () => {
      await instructorFeedbackService.fetchInstructorFeedback({
        course: 'Python 1',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith(
        'courseName',
        '==',
        'Python 1',
      )
    })

    it.each([null, undefined, 'all'])(
      'does not filter by course for %p',
      async (course) => {
        await instructorFeedbackService.fetchInstructorFeedback({
          course,
          limit: 25,
          offset: 0,
        })

        expect(mockQuery.where).not.toHaveBeenCalled()
      },
    )

    it('orders by date and applies the page window', async () => {
      await instructorFeedbackService.fetchInstructorFeedback({
        limit: 10,
        offset: 20,
      })

      expect(mockQuery.orderBy).toHaveBeenCalledWith('date', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('normalizes an array-shaped attendance list', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'fb-1', data: () => storedFeedback() }],
      })

      const [row] = await instructorFeedbackService.fetchInstructorFeedback({
        limit: 25,
        offset: 0,
      })

      expect(row.attendanceList).toEqual([true, false])
    })

    it('normalizes a legacy map-shaped attendance list', async () => {
      mockGet.mockResolvedValue({
        docs: [
          {
            id: 'fb-2',
            data: () =>
              storedFeedback({
                attendanceList: {
                  '0': { present: true },
                  '1': { present: true },
                },
              }),
          },
        ],
      })

      const [row] = await instructorFeedbackService.fetchInstructorFeedback({
        limit: 25,
        offset: 0,
      })

      expect(row.attendanceList).toEqual([true, true])
    })

    it('gives an empty attendance list when none is stored', async () => {
      mockGet.mockResolvedValue({
        docs: [
          {
            id: 'fb-3',
            data: () => storedFeedback({ attendanceList: undefined }),
          },
        ],
      })

      const [row] = await instructorFeedbackService.fetchInstructorFeedback({
        limit: 25,
        offset: 0,
      })

      expect(row.attendanceList).toEqual([])
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        instructorFeedbackService.fetchInstructorFeedback({
          limit: 25,
          offset: 0,
        }),
      ).rejects.toThrow('Firestore boom')
    })
  })

  describe('searchInstructorFeedback', () => {
    it('searches the instructor feedback index', async () => {
      mockSearchIndex.mockResolvedValue([])

      await instructorFeedbackService.searchInstructorFeedback('Grace')

      expect(mockSearchIndex).toHaveBeenCalledWith(
        instructorFeedbackCollection,
        'Grace',
      )
    })

    it('maps hits to feedback rows, normalizing attendance', async () => {
      mockSearchIndex.mockResolvedValue([
        { ...storedFeedback(), objectID: 'fb-9' },
      ])

      const [row] =
        await instructorFeedbackService.searchInstructorFeedback('Grace')

      expect(row.id).toBe('fb-9')
      expect(row.attendanceList).toEqual([true, false])
    })

    it('propagates a failed search so the page can report it', async () => {
      mockSearchIndex.mockRejectedValue(new Error('search boom'))

      await expect(
        instructorFeedbackService.searchInstructorFeedback('Grace'),
      ).rejects.toThrow('search boom')
    })
  })
})
