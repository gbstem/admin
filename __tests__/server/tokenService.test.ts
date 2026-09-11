const mockGet = jest.fn()
const mockQuery = {
  orderBy: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  get: (...args: any[]) => mockGet(...args),
}
const mockCollection = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
  },
}))

import { tokenService } from '$lib/server/tokenService'

const storedToken = (overrides: Record<string, unknown> = {}) => ({
  role: 'applicant',
  expires: { toDate: () => new Date('2026-12-01T00:00:00Z') },
  consumable: true,
  consumers: [],
  ...overrides,
})

describe('tokenService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
  })

  describe('fetchTokens', () => {
    it('reads the tokens collection', async () => {
      await tokenService.fetchTokens({ limit: 25, offset: 0 })

      expect(mockCollection).toHaveBeenCalledWith('tokens')
    })

    it('orders by soonest-expiring first and applies the page window', async () => {
      await tokenService.fetchTokens({ limit: 10, offset: 20 })

      expect(mockQuery.orderBy).toHaveBeenCalledWith('expires', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('converts the expires Timestamp to a Date', async () => {
      mockGet.mockResolvedValue({
        docs: [{ id: 'token-1', data: () => storedToken() }],
      })

      const [row] = await tokenService.fetchTokens({ limit: 25, offset: 0 })

      expect(row).toEqual({
        id: 'token-1',
        values: {
          role: 'applicant',
          expires: new Date('2026-12-01T00:00:00Z'),
          consumable: true,
          consumers: [],
        },
      })
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        tokenService.fetchTokens({ limit: 25, offset: 0 }),
      ).rejects.toThrow('Firestore boom')
    })
  })
})
