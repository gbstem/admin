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

const mockGetUsers = jest.fn()

const mockTransaction = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}
const mockAdminDoc = jest.fn((path: string) => ({ path }))

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
    doc: (path: string) => mockAdminDoc(path),
    runTransaction: (run: (transaction: unknown) => unknown) =>
      run(mockTransaction),
  },
  adminAuth: {
    getUsers: (...args: any[]) => mockGetUsers(...args),
  },
}))

jest.mock('$lib/server/search', () => ({
  searchIndex: (...args: any[]) => mockSearchIndex(...args),
}))

import { classesCollection } from '$lib/data/collections'
import { ClassStatus } from '$lib/data/types/ClassStatus'
import { classService } from '$lib/server/classService'

const storedClass = (overrides: Record<string, unknown> = {}) => ({
  instructorFirstName: 'Grace',
  instructorLastName: 'Hopper',
  instructorUid: 'grace-uid',
  // The address the class was stored with, which the row must ignore: Grace
  // has since changed her account's to grace@gbstem.org.
  instructorEmail: 'old-grace@gbstem.org',
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
    mockGetUsers.mockResolvedValue({
      users: [{ uid: 'grace-uid', email: 'grace@gbstem.org' }],
    })
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

describe('classService.saveClassEdits', () => {
  const formData = {
    course: 'Python 1',
    gradeRecommendation: '3-5',
    classCap: 12,
    meetingLink: 'https://mit.zoom.us/j/99593863281',
    classDay1: 'Monday',
    classTime1: '16:00',
    classDay2: 'Wednesday',
    classTime2: '16:00',
    online: true,
  } as const

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("merges only the form's fields into that semester's class", async () => {
    mockTransaction.get.mockResolvedValue({ exists: true })

    await classService.saveClassEdits('Spring26', 'inst-uid-1', {
      ...formData,
      // Not the form's to write: a roster from a stale copy would drop
      // whoever enrolled since.
      students: [],
      instructorUid: 'someone-else',
    } as any)

    expect(mockAdminDoc).toHaveBeenCalledWith(
      'semesters/Spring26/classes/inst-uid-1',
    )
    expect(mockTransaction.set).toHaveBeenCalledWith(
      { path: 'semesters/Spring26/classes/inst-uid-1' },
      { ...formData, semester: 'Spring26' },
      { merge: true },
    )
  })

  it('refuses a class that does not exist, writing nothing', async () => {
    mockTransaction.get.mockResolvedValue({ exists: false })

    await expect(
      classService.saveClassEdits('Spring26', 'nope', formData),
    ).rejects.toMatchObject({ status: 404 })
    expect(mockTransaction.set).not.toHaveBeenCalled()
  })
})

describe('classService.refreshClassStatuses', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  const past = new Date('2026-10-01T20:00:00Z')
  const future = new Date('2026-10-20T20:00:00Z')
  /** A session time as Firestore stores it. */
  const timestamp = (date: Date) => ({ toDate: () => date })
  const stored = (klass: Record<string, unknown>) =>
    mockTransaction.get.mockResolvedValue({ exists: true, data: () => klass })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('works the statuses out from the stored class and writes them', async () => {
    stored({
      meetingTimes: [timestamp(past), timestamp(past), timestamp(future)],
      feedbackCompleted: [true, false, false],
      classStatuses: [
        ClassStatus.ClassInFuture,
        ClassStatus.ClassInFuture,
        ClassStatus.ClassInFuture,
      ],
    })
    const expected = [
      ClassStatus.EverythingComplete,
      ClassStatus.ClassNotHeld,
      ClassStatus.ClassInFuture,
    ]

    await expect(
      classService.refreshClassStatuses('inst-uid-1', now),
    ).resolves.toEqual(expected)

    expect(mockAdminDoc).toHaveBeenCalledWith(`${classesCollection}/inst-uid-1`)
    expect(mockTransaction.update).toHaveBeenCalledWith(
      { path: `${classesCollection}/inst-uid-1` },
      { classStatuses: expected },
    )
  })

  it('writes nothing when every status is already current', async () => {
    stored({
      meetingTimes: [timestamp(past), timestamp(future)],
      feedbackCompleted: [false, false],
      classStatuses: [
        ClassStatus.FeedbackIncomplete,
        ClassStatus.ClassInFuture,
      ],
    })

    await expect(
      classService.refreshClassStatuses('inst-uid-1', now),
    ).resolves.toEqual([
      ClassStatus.FeedbackIncomplete,
      ClassStatus.ClassInFuture,
    ])
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })

  it('pads a class stored without its per-session arrays', async () => {
    stored({ meetingTimes: [timestamp(future)] })

    await expect(
      classService.refreshClassStatuses('inst-uid-1', now),
    ).resolves.toEqual([ClassStatus.ClassInFuture])
    expect(mockTransaction.update).toHaveBeenCalledTimes(1)
  })

  it('refuses a class that does not exist, writing nothing', async () => {
    mockTransaction.get.mockResolvedValue({ exists: false })

    await expect(
      classService.refreshClassStatuses('nope', now),
    ).rejects.toMatchObject({ status: 404 })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })
})
