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

import { classFeedbackCollection } from '$lib/data/collections'
import { studentFeedbackService } from '$lib/server/studentFeedbackService'

const storedFeedback = (overrides: Record<string, unknown> = {}) => ({
  instructor: 'Grace Hopper',
  studentName: 'Ada Lovelace',
  feedback: 'Loved the class.',
  rating: 5,
  course: 'Python 1',
  date: '2026-09-01',
  ...overrides,
})

describe('studentFeedbackService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
  })

  describe('fetchStudentFeedback', () => {
    it('reads the class feedback collection', async () => {
      await studentFeedbackService.fetchStudentFeedback({
        limit: 25,
        offset: 0,
      })

      expect(mockCollection).toHaveBeenCalledWith(classFeedbackCollection)
    })

    it('narrows to a course when a specific one is given', async () => {
      await studentFeedbackService.fetchStudentFeedback({
        course: 'Python 1',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith('course', '==', 'Python 1')
    })

    it.each([null, undefined, 'all'])(
      'does not filter by course for %p',
      async (course) => {
        await studentFeedbackService.fetchStudentFeedback({
          course,
          limit: 25,
          offset: 0,
        })

        expect(mockQuery.where).not.toHaveBeenCalled()
      },
    )

    it('orders by date and applies the page window', async () => {
      await studentFeedbackService.fetchStudentFeedback({
        limit: 10,
        offset: 20,
      })

      expect(mockQuery.orderBy).toHaveBeenCalledWith('date', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('maps a stored document to a row, renaming instructor to instructorName', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'fb-1', data: () => storedFeedback() }],
      })

      const [row] = await studentFeedbackService.fetchStudentFeedback({
        limit: 25,
        offset: 0,
      })

      expect(row).toEqual({
        id: 'fb-1',
        instructorName: 'Grace Hopper',
        studentName: 'Ada Lovelace',
        feedback: 'Loved the class.',
        rating: 5,
        course: 'Python 1',
        date: '2026-09-01',
      })
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        studentFeedbackService.fetchStudentFeedback({
          limit: 25,
          offset: 0,
        }),
      ).rejects.toThrow('Firestore boom')
    })
  })

  describe('searchStudentFeedback', () => {
    it('searches the class feedback index', async () => {
      mockSearchIndex.mockResolvedValue([])

      await studentFeedbackService.searchStudentFeedback('Ada')

      expect(mockSearchIndex).toHaveBeenCalledWith(
        classFeedbackCollection,
        'Ada',
      )
    })

    it('maps hits to feedback rows', async () => {
      mockSearchIndex.mockResolvedValue([
        { ...storedFeedback(), objectID: 'fb-9' },
      ])

      const [row] = await studentFeedbackService.searchStudentFeedback('Ada')

      expect(row.id).toBe('fb-9')
      expect(row.instructorName).toBe('Grace Hopper')
    })

    it('propagates a failed search so the page can report it', async () => {
      mockSearchIndex.mockRejectedValue(new Error('search boom'))

      await expect(
        studentFeedbackService.searchStudentFeedback('Ada'),
      ).rejects.toThrow('search boom')
    })
  })
})
