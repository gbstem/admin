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

import { semesterDates, subRequestsCollection } from '$lib/data/collections'
import {
  currentSemesterCutoff,
  subRequestService,
} from '$lib/server/subRequestService'

const storedSubRequest = (overrides: Record<string, unknown> = {}) => ({
  classNumber: 2,
  course: 'Python 1',
  dateOfClass: { toDate: () => new Date('2026-09-30T18:00:00Z') },
  originalInstructorEmail: 'instructor@gbstem.org',
  originalInstructorUid: 'instructor-uid',
  subInstructorId: 'sub-uid',
  subInstructorFirstName: 'Patricia',
  subInstructorEmail: 'sub@gbstem.org',
  subRequestStatus: 'SubstituteFound',
  link: 'https://zoom.us/j/123',
  notes: 'Dentist appointment.',
  ...overrides,
})

describe('subRequestService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
  })

  describe('currentSemesterCutoff', () => {
    it("is the current semester's registrationsOpen date", () => {
      expect(currentSemesterCutoff().getTime()).toBe(
        new Date(semesterDates.registrationsOpen).getTime(),
      )
    })

    it('precedes classesStart, so requests made before classes start show', () => {
      expect(currentSemesterCutoff().getTime()).toBeLessThanOrEqual(
        new Date(semesterDates.classesStart).getTime(),
      )
    })
  })

  describe('fetchSubRequests', () => {
    it('reads the subRequests collection', async () => {
      await subRequestService.fetchSubRequests({ limit: 25, offset: 0 })

      expect(mockCollection).toHaveBeenCalledWith(subRequestsCollection)
    })

    it('reads only sessions on or after registrations opened', async () => {
      await subRequestService.fetchSubRequests({ limit: 25, offset: 0 })

      expect(mockQuery.where).toHaveBeenCalledTimes(1)
      const [field, op, value] = mockQuery.where.mock.calls[0]
      expect(field).toBe('dateOfClass')
      expect(op).toBe('>=')
      expect(value).toEqual(currentSemesterCutoff())
    })

    it('narrows to a course when one is given', async () => {
      await subRequestService.fetchSubRequests({
        course: 'Scratch 1',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith('course', '==', 'Scratch 1')
    })

    it.each([null, undefined, '', 'all'])(
      'does not filter by course for %p',
      async (course) => {
        await subRequestService.fetchSubRequests({
          course,
          limit: 25,
          offset: 0,
        })

        expect(mockQuery.where).not.toHaveBeenCalledWith(
          'course',
          expect.anything(),
          expect.anything(),
        )
      },
    )

    it('orders latest session first and applies the page window', async () => {
      await subRequestService.fetchSubRequests({ limit: 10, offset: 20 })

      expect(mockQuery.orderBy).toHaveBeenCalledWith('dateOfClass', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('maps documents to log rows', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'req-1', data: () => storedSubRequest() }],
      })

      const rows = await subRequestService.fetchSubRequests({
        limit: 25,
        offset: 0,
      })

      expect(rows).toEqual([
        {
          id: 'req-1',
          classNumber: 2,
          course: 'Python 1',
          dateOfClass: new Date('2026-09-30T18:00:00Z'),
          originalInstructorEmail: 'instructor@gbstem.org',
          originalInstructorUid: 'instructor-uid',
          subInstructorId: 'sub-uid',
          subInstructorFirstName: 'Patricia',
          subInstructorEmail: 'sub@gbstem.org',
          subRequestStatus: 'SubstituteFound',
          link: 'https://zoom.us/j/123',
          notes: 'Dentist appointment.',
        },
      ])
    })

    it('defaults a missing originalInstructorUid to an empty string', async () => {
      mockGet.mockResolvedValue({
        docs: [
          {
            id: 'legacy',
            data: () => storedSubRequest({ originalInstructorUid: undefined }),
          },
        ],
      })

      const [row] = await subRequestService.fetchSubRequests({
        limit: 25,
        offset: 0,
      })

      expect(row.originalInstructorUid).toBe('')
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        subRequestService.fetchSubRequests({ limit: 25, offset: 0 }),
      ).rejects.toThrow('Firestore boom')
    })
  })

  describe('searchSubRequests', () => {
    it('searches the subRequests index with the query', async () => {
      mockSearchIndex.mockResolvedValue([])

      await subRequestService.searchSubRequests('Python')

      expect(mockSearchIndex).toHaveBeenCalledWith(
        subRequestsCollection,
        'Python',
      )
    })

    it('is not limited to the current semester', async () => {
      mockSearchIndex.mockResolvedValue([])

      await subRequestService.searchSubRequests('Python')

      expect(mockCollection).not.toHaveBeenCalled()
    })

    it('uses the hit objectID as the row id', async () => {
      mockSearchIndex.mockResolvedValue([
        { ...storedSubRequest(), objectID: 'req-9' },
      ])

      const [row] = await subRequestService.searchSubRequests('Python')

      expect(row.id).toBe('req-9')
    })

    // Search hits don't carry Firestore Timestamps: the local fallback hands
    // back Dates, and an Algolia record holds whatever its sync serialized.
    it.each([
      ['a Date', new Date('2026-09-30T18:00:00Z')],
      ['an epoch number', Date.parse('2026-09-30T18:00:00Z')],
      ['an ISO string', '2026-09-30T18:00:00Z'],
    ])('reads a session date given as %s', async (_label, dateOfClass) => {
      mockSearchIndex.mockResolvedValue([
        { ...storedSubRequest({ dateOfClass }), objectID: 'req-9' },
      ])

      const [row] = await subRequestService.searchSubRequests('Python')

      expect(row.dateOfClass).toEqual(new Date('2026-09-30T18:00:00Z'))
    })

    // A bad date used to become an Invalid Date, which the page's CSV export
    // crashes on (`toISOString()` throws).
    it.each([
      ['missing', undefined],
      ['unparseable', 'not a date'],
    ])(
      'gives a null session date when it is %s',
      async (_label, dateOfClass) => {
        mockSearchIndex.mockResolvedValue([
          { ...storedSubRequest({ dateOfClass }), objectID: 'req-9' },
        ])

        const [row] = await subRequestService.searchSubRequests('Python')

        expect(row.dateOfClass).toBeNull()
      },
    )
  })
})
