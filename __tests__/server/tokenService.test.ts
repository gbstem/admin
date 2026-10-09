const mockGet = jest.fn()
const mockQuery = {
  orderBy: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  get: (...args: any[]) => mockGet(...args),
}
const mockCollection = jest.fn()
const mockBatch = { delete: jest.fn(), commit: jest.fn() }

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
    batch: () => mockBatch,
  },
}))

import { tokenService } from '#lib/server/tokenService.js'

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

describe('tokenService.createToken', () => {
  const mockAdd = jest.fn()
  const now = new Date('2026-10-01T12:00:00Z')

  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue({ add: mockAdd })
    mockAdd.mockResolvedValue({ id: 'tok-1' })
  })

  it('stores an unused token expiring that many hours on, and returns its id', async () => {
    await expect(
      tokenService.createToken(
        { role: 'reviewer', consumable: true, expires: 24 },
        now,
      ),
    ).resolves.toBe('tok-1')

    expect(mockCollection).toHaveBeenCalledWith('tokens')
    expect(mockAdd).toHaveBeenCalledWith({
      role: 'reviewer',
      consumable: true,
      expires: new Date('2026-10-02T12:00:00Z'),
      consumers: [],
    })
  })

  it('writes only the fields a token has', async () => {
    await tokenService.createToken(
      {
        role: 'admin',
        consumable: false,
        expires: 1,
        consumers: ['someone'],
      } as any,
      now,
    )

    expect(mockAdd.mock.calls[0][0]).toEqual({
      role: 'admin',
      consumable: false,
      expires: new Date('2026-10-01T13:00:00Z'),
      consumers: [],
    })
  })
})

describe('tokenService.deleteTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue({ doc: (id: string) => ({ id }) })
    mockBatch.commit.mockResolvedValue(undefined)
  })

  it('deletes every token in one batch', async () => {
    await tokenService.deleteTokens(['tok-1', 'tok-2'])

    expect(mockBatch.delete.mock.calls).toEqual([
      [{ id: 'tok-1' }],
      [{ id: 'tok-2' }],
    ])
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
  })

  it('propagates a failed commit', async () => {
    mockBatch.commit.mockRejectedValue(new Error('unavailable'))

    await expect(tokenService.deleteTokens(['tok-1'])).rejects.toThrow(
      'unavailable',
    )
  })
})
