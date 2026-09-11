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

import { classesCollection } from '$lib/data/collections'
import { classService } from '$lib/server/classService'

const storedClass = (overrides: Record<string, unknown> = {}) => ({
  instructorFirstName: 'Grace',
  instructorLastName: 'Hopper',
  instructorEmail: 'grace@gbstem.org',
  course: 'Python 1',
  students: ['student-1'],
  meetingLink: 'https://zoom.us/j/123',
  classStatuses: ['upcoming'],
  classDay1: 'Monday',
  classDay2: 'Wednesday',
  classTime1: '18:00',
  classTime2: '18:00',
  ...overrides,
})

describe('classService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
  })

  describe('fetchClasses', () => {
    it('reads the classes collection', async () => {
      await classService.fetchClasses({ limit: 25, offset: 0 })

      expect(mockCollection).toHaveBeenCalledWith(classesCollection)
    })

    it('narrows to a course when a specific filter is given', async () => {
      await classService.fetchClasses({
        filter: 'Python 1',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith('course', '==', 'Python 1')
    })

    it.each([null, undefined, 'all'])(
      'does not filter by course for %p',
      async (filter) => {
        await classService.fetchClasses({ filter, limit: 25, offset: 0 })

        expect(mockQuery.where).not.toHaveBeenCalled()
      },
    )

    it('orders by course and applies the page window', async () => {
      await classService.fetchClasses({ limit: 10, offset: 20 })

      expect(mockQuery.orderBy).toHaveBeenCalledWith('course')
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('maps a class document to a row', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'class-1', data: () => storedClass() }],
      })

      const [row] = await classService.fetchClasses({
        limit: 25,
        offset: 0,
      })

      expect(row).toEqual({
        id: 'class-1',
        name: 'Grace Hopper',
        email: 'grace@gbstem.org',
        courses: ['Python 1'],
        students: ['student-1'],
        meetingLink: 'https://zoom.us/j/123',
        classStatuses: ['upcoming'],
        classTimes: ['Monday at 6:00 PM', 'Wednesday at 6:00 PM'],
      })
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        classService.fetchClasses({ limit: 25, offset: 0 }),
      ).rejects.toThrow('Firestore boom')
    })
  })

  describe('searchClasses', () => {
    it('searches the classes index', async () => {
      mockSearchIndex.mockResolvedValue([])

      await classService.searchClasses('Python')

      expect(mockSearchIndex).toHaveBeenCalledWith(classesCollection, 'Python')
    })

    it('maps hits to class rows', async () => {
      mockSearchIndex.mockResolvedValue([
        { ...storedClass(), objectID: 'class-9' },
      ])

      const [row] = await classService.searchClasses('Python')

      expect(row.id).toBe('class-9')
      expect(row.name).toBe('Grace Hopper')
    })

    it('propagates a failed search so the page can report it', async () => {
      mockSearchIndex.mockRejectedValue(new Error('search boom'))

      await expect(classService.searchClasses('Python')).rejects.toThrow(
        'search boom',
      )
    })
  })
})
