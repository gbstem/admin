const mockGet = jest.fn()
const mockDocGet = jest.fn()
const mockDoc = jest.fn(() => ({ get: mockDocGet }))
const mockQuery = {
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  doc: mockDoc,
  get: (...args: any[]) => mockGet(...args),
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

import { applicationService } from '$lib/server/applicationService'

const storedApplication = (overrides: Record<string, unknown> = {}) => ({
  personal: { firstName: 'Ada', lastName: 'Lovelace' },
  academic: { school: 'MIT' },
  program: { inPerson: false },
  essay: {},
  agreements: {},
  meta: { uid: 'uid-1', interview: false, submitted: true, decided: false },
  timestamps: {
    updated: { toDate: () => new Date('2026-09-01T00:00:00Z') },
    created: { toDate: () => new Date('2026-08-01T00:00:00Z') },
  },
  ...overrides,
})

const storedDecision = {
  type: 'accepted',
  likelyDecision: 'likely yes',
  notes: 'strong candidate',
}

describe('applicationService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
    mockDocGet.mockResolvedValue({ data: () => storedDecision })
  })

  describe('fetchApplications', () => {
    it('reads the semester applications collection', async () => {
      await applicationService.fetchApplications({
        semesterId: 'Fall26',
        limit: 25,
        offset: 0,
      })

      expect(mockCollection).toHaveBeenCalledWith(
        'semesters/Fall26/applications',
      )
    })

    it('filters to undecided, submitted applications for the undecided filter', async () => {
      await applicationService.fetchApplications({
        semesterId: 'Fall26',
        filter: 'undecided',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith('meta.submitted', '==', true)
      expect(mockQuery.where).toHaveBeenCalledWith('meta.decided', '==', false)
    })

    it('filters to in-person applications for the inPerson filter', async () => {
      await applicationService.fetchApplications({
        semesterId: 'Fall26',
        filter: 'inPerson',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith(
        'program.inPerson',
        '==',
        true,
      )
    })

    it('filters to unsubmitted applications for the incomplete filter', async () => {
      await applicationService.fetchApplications({
        semesterId: 'Fall26',
        filter: 'incomplete',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith(
        'meta.submitted',
        '==',
        false,
      )
    })

    it.each([undefined, null, 'complete', 'bogus'])(
      'defaults to submitted applications for filter %p',
      async (filter) => {
        await applicationService.fetchApplications({
          semesterId: 'Fall26',
          filter,
          limit: 25,
          offset: 0,
        })

        expect(mockQuery.where).toHaveBeenCalledWith(
          'meta.submitted',
          '==',
          true,
        )
      },
    )

    it('orders by last update and applies the page window', async () => {
      await applicationService.fetchApplications({
        semesterId: 'Fall26',
        limit: 10,
        offset: 20,
      })

      expect(mockQuery.orderBy).toHaveBeenCalledWith(
        'timestamps.updated',
        'desc',
      )
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('attaches the decision for a decided application', async () => {
      mockGet.mockResolvedValue({
        docs: [
          {
            id: 'app-1',
            data: () => storedApplication({ meta: { decided: true } }),
          },
        ],
      })

      const [row] = await applicationService.fetchApplications({
        semesterId: 'Fall26',
        limit: 25,
        offset: 0,
      })

      expect(mockCollection).toHaveBeenCalledWith('semesters/Fall26/decisions')
      expect(mockDoc).toHaveBeenCalledWith('app-1')
      expect(row.values.meta.decision).toEqual(storedDecision)
    })

    it('leaves decision null for an undecided application', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'app-2', data: () => storedApplication() }],
      })

      const [row] = await applicationService.fetchApplications({
        semesterId: 'Fall26',
        limit: 25,
        offset: 0,
      })

      expect(mockDocGet).not.toHaveBeenCalled()
      expect(row.values.meta.decision).toBeNull()
    })

    it('converts stored timestamps to Dates', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'app-3', data: () => storedApplication() }],
      })

      const [row] = await applicationService.fetchApplications({
        semesterId: 'Fall26',
        limit: 25,
        offset: 0,
      })

      expect(row.values.timestamps.updated).toEqual(
        new Date('2026-09-01T00:00:00Z'),
      )
      expect(row.values.timestamps.created).toEqual(
        new Date('2026-08-01T00:00:00Z'),
      )
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        applicationService.fetchApplications({
          semesterId: 'Fall26',
          limit: 25,
          offset: 0,
        }),
      ).rejects.toThrow('Firestore boom')
    })
  })

  describe('searchApplications', () => {
    it('searches the semester applications index', async () => {
      mockSearchIndex.mockResolvedValue([])

      await applicationService.searchApplications('Fall26', 'Ada')

      expect(mockSearchIndex).toHaveBeenCalledWith(
        'semesters/Fall26/applications',
        'Ada',
      )
    })

    it('attaches decisions only for decided hits', async () => {
      mockSearchIndex.mockResolvedValue([
        {
          ...storedApplication({
            meta: { uid: 'uid-1', decided: true, submitted: true },
          }),
          objectID: 'app-1',
        },
        {
          ...storedApplication({
            meta: { uid: 'uid-2', decided: false, submitted: true },
          }),
          objectID: 'app-2',
        },
      ])

      const rows = await applicationService.searchApplications('Fall26', 'Ada')

      expect(mockDoc).toHaveBeenCalledTimes(1)
      expect(mockDoc).toHaveBeenCalledWith('app-1')
      expect(rows[0].values.meta.decision).toEqual(storedDecision)
      expect(rows[1].values.meta.decision).toBeNull()
    })

    it('propagates a failed search so the page can report it', async () => {
      mockSearchIndex.mockRejectedValue(new Error('search boom'))

      await expect(
        applicationService.searchApplications('Fall26', 'Ada'),
      ).rejects.toThrow('search boom')
    })
  })
})
