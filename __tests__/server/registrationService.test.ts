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

import { registrationService } from '$lib/server/registrationService'

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

describe('registrationService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
  })

  describe('fetchRegistrations', () => {
    it('reads the semester registrations collection', async () => {
      await registrationService.fetchRegistrations({
        semesterId: 'Fall26',
        limit: 25,
        offset: 0,
      })

      expect(mockCollection).toHaveBeenCalledWith(
        'semesters/Fall26/registrations',
      )
    })

    it.each([[undefined], ['submitted']])(
      'filters to submitted registrations for filter %p (the default)',
      async (filter) => {
        await registrationService.fetchRegistrations({
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

    it('filters to enrolled registrations for the enrolled filter', async () => {
      await registrationService.fetchRegistrations({
        semesterId: 'Fall26',
        filter: 'enrolled',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith('enrolled', '==', true)
    })

    it('filters to submitted, unenrolled registrations for the "not enrolled" filter', async () => {
      await registrationService.fetchRegistrations({
        semesterId: 'Fall26',
        filter: 'not enrolled',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).toHaveBeenCalledWith('enrolled', '==', false)
      expect(mockQuery.where).toHaveBeenCalledWith('meta.submitted', '==', true)
    })

    it('filters to submitted, in-person registrations for the inPerson filter', async () => {
      await registrationService.fetchRegistrations({
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
      expect(mockQuery.where).toHaveBeenCalledWith('meta.submitted', '==', true)
    })

    it('filters to unsubmitted registrations for the incomplete filter', async () => {
      await registrationService.fetchRegistrations({
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

    it('applies no filter for an unrecognized value', async () => {
      await registrationService.fetchRegistrations({
        semesterId: 'Fall26',
        filter: 'bogus',
        limit: 25,
        offset: 0,
      })

      expect(mockQuery.where).not.toHaveBeenCalled()
    })

    it('orders by last update and applies the page window', async () => {
      await registrationService.fetchRegistrations({
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

    it('converts stored timestamps to Dates', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'reg-1', data: () => storedRegistration() }],
      })

      const [row] = await registrationService.fetchRegistrations({
        semesterId: 'Fall26',
        limit: 25,
        offset: 0,
      })

      expect(row.values.timestamps.updated).toEqual(
        new Date('2026-09-01T00:00:00Z'),
      )
      expect(row.id).toBe('reg-1')
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        registrationService.fetchRegistrations({
          semesterId: 'Fall26',
          limit: 25,
          offset: 0,
        }),
      ).rejects.toThrow('Firestore boom')
    })
  })

  describe('searchRegistrations', () => {
    it('searches the semester registrations index', async () => {
      mockSearchIndex.mockResolvedValue([])

      await registrationService.searchRegistrations('Fall26', 'Ada')

      expect(mockSearchIndex).toHaveBeenCalledWith(
        'semesters/Fall26/registrations',
        'Ada',
      )
    })

    it('maps hits to registration rows', async () => {
      mockSearchIndex.mockResolvedValue([
        { ...storedRegistration(), objectID: 'reg-9' },
      ])

      const [row] = await registrationService.searchRegistrations(
        'Fall26',
        'Ada',
      )

      expect(row.id).toBe('reg-9')
      expect(row.values.personal.studentFirstName).toBe('Ada')
    })

    it('propagates a failed search so the page can report it', async () => {
      mockSearchIndex.mockRejectedValue(new Error('search boom'))

      await expect(
        registrationService.searchRegistrations('Fall26', 'Ada'),
      ).rejects.toThrow('search boom')
    })
  })
})
