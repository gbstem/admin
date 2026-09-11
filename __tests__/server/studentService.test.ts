const mockGet = jest.fn()
const mockQuery = {
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  get: (...args: any[]) => mockGet(...args),
}
const mockClassesGet = jest.fn()
const mockClassesQuery = {
  where: jest.fn(),
  get: (...args: any[]) => mockClassesGet(...args),
}
const mockCollection = jest.fn()
const mockSearchIndex = jest.fn()
const mockToDateSafe = jest.fn()
mockToDateSafe.mockImplementation((ts: any) =>
  ts && typeof ts.toDate === 'function' ? ts.toDate() : ts,
)

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
  },
  toDateSafe: (...args: any[]) => mockToDateSafe(...args),
}))

jest.mock('$lib/server/search', () => ({
  searchIndex: (...args: any[]) => mockSearchIndex(...args),
}))

import {
  registrationsCollection,
  classesCollection,
} from '$lib/data/collections'
import { studentService } from '$lib/server/studentService'

const storedRegistration = (overrides: Record<string, unknown> = {}) => ({
  personal: { studentFirstName: 'Ada', studentLastName: 'Lovelace' },
  academic: { school: 'MIT', grade: '10' },
  program: { inPerson: false },
  inPerson: {},
  agreements: {},
  meta: { uid: 'uid-1', submitted: true },
  timestamps: {
    updated: { toDate: () => new Date('2026-09-01T00:00:00Z') },
    created: { toDate: () => new Date('2026-08-01T00:00:00Z') },
  },
  ...overrides,
})

describe('studentService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockImplementation((collectionName: string) =>
      collectionName === classesCollection ? mockClassesQuery : mockQuery,
    )
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
    mockClassesQuery.where.mockReturnValue(mockClassesQuery)
    mockClassesGet.mockResolvedValue({ docs: [] })
  })

  describe('fetchStudents', () => {
    it('reads the registrations collection', async () => {
      await studentService.fetchStudents({ limit: 25, offset: 0 })

      expect(mockCollection).toHaveBeenCalledWith(registrationsCollection)
    })

    it.each([[undefined], ['submitted'], ['bogus']])(
      'defaults to submitted registrations for filter %p',
      async (filter) => {
        await studentService.fetchStudents({ filter, limit: 25, offset: 0 })

        expect(mockQuery.where).toHaveBeenCalledWith(
          'meta.submitted',
          '==',
          true,
        )
      },
    )

    it('filters to enrolled registrations for the enrolled filter', async () => {
      await studentService.fetchStudents({
        filter: 'enrolled',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith('enrolled', '==', true)
    })

    it("resolves a course filter to that course's class ids first", async () => {
      mockClassesGet.mockResolvedValue({
        docs: [{ id: 'class-1' }, { id: 'class-2' }],
      })

      await studentService.fetchStudents({
        course: 'Python 1',
        limit: 25,
        offset: 0,
      })

      expect(mockClassesQuery.where).toHaveBeenCalledWith(
        'course',
        '==',
        'Python 1',
      )
      expect(mockQuery.where).toHaveBeenCalledWith(
        'classes',
        'array-contains-any',
        ['class-1', 'class-2'],
      )
    })

    it("caps the class id list at 30, Firestore's array-contains-any limit", async () => {
      const classIds = Array.from({ length: 40 }, (_, i) => `class-${i}`)
      mockClassesGet.mockResolvedValue({
        docs: classIds.map((id) => ({ id })),
      })

      await studentService.fetchStudents({
        course: 'Python 1',
        limit: 25,
        offset: 0,
      })

      const call = mockQuery.where.mock.calls.find(
        ([field]) => field === 'classes',
      )
      expect(call?.[2]).toHaveLength(30)
    })

    it('returns no results without querying registrations when the course has no classes', async () => {
      mockClassesGet.mockResolvedValue({ docs: [] })

      const rows = await studentService.fetchStudents({
        course: 'Nonexistent Course',
        limit: 25,
        offset: 0,
      })

      expect(rows).toEqual([])
      expect(mockGet).not.toHaveBeenCalled()
    })

    it.each([null, undefined, 'all'])(
      'does not filter by course for %p',
      async (course) => {
        await studentService.fetchStudents({ course, limit: 25, offset: 0 })

        expect(mockClassesGet).not.toHaveBeenCalled()
        expect(mockQuery.where).not.toHaveBeenCalledWith(
          'classes',
          expect.anything(),
          expect.anything(),
        )
      },
    )

    it('orders by last update and applies the page window', async () => {
      await studentService.fetchStudents({ limit: 10, offset: 20 })

      expect(mockQuery.orderBy).toHaveBeenCalledWith(
        'timestamps.updated',
        'desc',
      )
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('converts stored timestamps to Dates', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'reg-1', data: () => storedRegistration() }],
      })

      const [row] = await studentService.fetchStudents({
        limit: 25,
        offset: 0,
      })

      expect(row.values.timestamps.updated).toEqual(
        new Date('2026-09-01T00:00:00Z'),
      )
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        studentService.fetchStudents({ limit: 25, offset: 0 }),
      ).rejects.toThrow('Firestore boom')
    })
  })

  describe('searchStudents', () => {
    it('searches the registrations index', async () => {
      mockSearchIndex.mockResolvedValue([])

      await studentService.searchStudents('Ada')

      expect(mockSearchIndex).toHaveBeenCalledWith(
        registrationsCollection,
        'Ada',
      )
    })

    it('maps hits to registration rows', async () => {
      mockSearchIndex.mockResolvedValue([
        { ...storedRegistration(), objectID: 'reg-9' },
      ])

      const [row] = await studentService.searchStudents('Ada')

      expect(row.id).toBe('reg-9')
      expect(row.values.personal.studentFirstName).toBe('Ada')
    })

    it('propagates a failed search so the page can report it', async () => {
      mockSearchIndex.mockRejectedValue(new Error('search boom'))

      await expect(studentService.searchStudents('Ada')).rejects.toThrow(
        'search boom',
      )
    })
  })
})
