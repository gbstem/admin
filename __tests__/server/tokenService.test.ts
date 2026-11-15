const mockGet = jest.fn()
const mockQuery = {
  orderBy: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  get: (...args: any[]) => mockGet(...args),
}
const mockCollection = jest.fn()
const mockBatch = { update: jest.fn(), commit: jest.fn() }
const mockTransaction = { getAll: jest.fn(), delete: jest.fn() }
const mockResolveAccountEmails = jest.fn()

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
    batch: () => mockBatch,
    runTransaction: (fn: (t: typeof mockTransaction) => Promise<unknown>) =>
      fn(mockTransaction),
  },
}))

jest.mock('#lib/server/accountEmails.js', () => ({
  resolveAccountEmails: (...args: any[]) => mockResolveAccountEmails(...args),
}))

import { parseTokenStatus, tokenService } from '#lib/server/tokenService.js'

const ts = (iso: string) => ({ toDate: () => new Date(iso) })

const storedToken = (overrides: Record<string, unknown> = {}) => ({
  role: 'reviewer',
  expires: ts('2026-12-01T00:00:00Z'),
  consumable: true,
  consumers: [],
  createdAt: ts('2026-11-30T00:00:00Z'),
  createdBy: 'admin-1',
  purpose: 'Reviewer access for fall interviews',
  revokedAt: null,
  revokedBy: null,
  ...overrides,
})

const NOW = new Date('2026-11-30T12:00:00Z')

describe('parseTokenStatus', () => {
  it.each([
    ['all', 'all'],
    ['active', 'active'],
    [null, 'active'],
    ['bogus', 'active'],
  ])('reads %p as %p', (value, expected) => {
    expect(parseTokenStatus(value)).toBe(expected)
  })
})

describe('tokenService.fetchTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.where.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
    mockResolveAccountEmails.mockResolvedValue(new Map())
  })

  const fetchPage = (status: 'active' | 'all' = 'active') =>
    tokenService.fetchTokens({ limit: 10, offset: 20, status }, NOW)

  it('reads newest first and applies the page window', async () => {
    await fetchPage()

    expect(mockCollection).toHaveBeenCalledWith('tokens')
    expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc')
    expect(mockQuery.limit).toHaveBeenCalledWith(10)
    expect(mockQuery.offset).toHaveBeenCalledWith(20)
  })

  it('shows only unexpired tokens when active', async () => {
    await fetchPage('active')

    expect(mockQuery.where).toHaveBeenCalledWith('expires', '>', NOW)
  })

  it('shows every token when all', async () => {
    await fetchPage('all')

    expect(mockQuery.where).not.toHaveBeenCalled()
  })

  it("converts timestamps and resolves creator, revoker and consumers' emails in one lookup", async () => {
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'token-1',
          data: () =>
            storedToken({
              consumers: ['user-1', 'gone-user'],
              revokedAt: ts('2026-11-30T06:00:00Z'),
              revokedBy: 'admin-2',
            }),
        },
      ],
    })
    mockResolveAccountEmails.mockResolvedValue(
      new Map([
        ['admin-1', 'creator@test.com'],
        ['admin-2', 'revoker@test.com'],
        ['user-1', 'user@test.com'],
      ]),
    )

    const [row] = await fetchPage('all')

    expect(mockResolveAccountEmails).toHaveBeenCalledTimes(1)
    expect(mockResolveAccountEmails).toHaveBeenCalledWith([
      'admin-1',
      'admin-2',
      'user-1',
      'gone-user',
    ])
    expect(row).toEqual({
      id: 'token-1',
      values: {
        role: 'reviewer',
        expires: new Date('2026-12-01T00:00:00Z'),
        consumable: true,
        consumers: ['user-1', 'gone-user'],
        createdAt: new Date('2026-11-30T00:00:00Z'),
        createdBy: 'admin-1',
        purpose: 'Reviewer access for fall interviews',
        revokedAt: new Date('2026-11-30T06:00:00Z'),
        revokedBy: 'admin-2',
      },
      createdByEmail: 'creator@test.com',
      revokedByEmail: 'revoker@test.com',
      consumerEmails: ['user@test.com', null],
    })
  })

  it('reads a backfilled legacy token, with no creator, as unknown', async () => {
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'legacy',
          data: () =>
            storedToken({
              createdBy: null,
              purpose: '',
              revokedAt: undefined,
              revokedBy: undefined,
            }),
        },
      ],
    })

    const [row] = await fetchPage('all')

    expect(mockResolveAccountEmails).toHaveBeenCalledWith([])
    expect(row.createdByEmail).toBeNull()
    expect(row.values).toMatchObject({
      createdBy: null,
      purpose: '',
      revokedAt: null,
      revokedBy: null,
    })
  })

  it('propagates a failed query so the page can report it', async () => {
    mockGet.mockRejectedValue(new Error('Firestore boom'))

    await expect(fetchPage()).rejects.toThrow('Firestore boom')
  })
})

describe('tokenService.createToken', () => {
  const mockAdd = jest.fn()
  const now = new Date('2026-10-01T12:00:00Z')
  const values = {
    role: 'reviewer' as const,
    consumable: true,
    expires: 24,
    purpose: 'Reviewer access for fall interviews',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue({ add: mockAdd })
    mockAdd.mockResolvedValue({ id: 'tok-1' })
  })

  it('stores an unused, unrevoked token with its creator and purpose, and returns its id', async () => {
    await expect(
      tokenService.createToken(values, 'admin-1', now),
    ).resolves.toBe('tok-1')

    expect(mockCollection).toHaveBeenCalledWith('tokens')
    expect(mockAdd).toHaveBeenCalledWith({
      role: 'reviewer',
      consumable: true,
      expires: new Date('2026-10-02T12:00:00Z'),
      consumers: [],
      createdAt: now,
      createdBy: 'admin-1',
      purpose: 'Reviewer access for fall interviews',
      revokedAt: null,
      revokedBy: null,
    })
  })

  it('writes only the fields a token has', async () => {
    await tokenService.createToken(
      {
        ...values,
        consumers: ['someone'],
        createdBy: 'forged',
      } as any,
      'admin-1',
      now,
    )

    expect(mockAdd.mock.calls[0][0]).toMatchObject({
      consumers: [],
      createdBy: 'admin-1',
    })
  })
})

describe('tokenService.revokeTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue({ doc: (id: string) => ({ id }) })
    mockBatch.commit.mockResolvedValue(undefined)
  })

  it('expires and marks every token revoked in one batch', async () => {
    await tokenService.revokeTokens(['tok-1', 'tok-2'], 'admin-1', NOW)

    const fields = { expires: NOW, revokedAt: NOW, revokedBy: 'admin-1' }
    expect(mockBatch.update.mock.calls).toEqual([
      [{ id: 'tok-1' }, fields],
      [{ id: 'tok-2' }, fields],
    ])
    expect(mockBatch.commit).toHaveBeenCalledTimes(1)
  })

  it('propagates a failed commit', async () => {
    mockBatch.commit.mockRejectedValue(new Error('NOT_FOUND'))

    await expect(
      tokenService.revokeTokens(['missing'], 'admin-1', NOW),
    ).rejects.toThrow('NOT_FOUND')
  })
})

describe('tokenService.deleteTokens', () => {
  const snap = (consumers?: string[]) => ({
    data: () => (consumers ? { consumers } : undefined),
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue({ doc: (id: string) => ({ id }) })
  })

  it('deletes every unused token in one transaction', async () => {
    mockTransaction.getAll.mockResolvedValue([snap([]), snap([])])

    await tokenService.deleteTokens(['tok-1', 'tok-2'])

    expect(mockTransaction.getAll).toHaveBeenCalledWith(
      { id: 'tok-1' },
      { id: 'tok-2' },
    )
    expect(mockTransaction.delete.mock.calls).toEqual([
      [{ id: 'tok-1' }],
      [{ id: 'tok-2' }],
    ])
  })

  it('treats an already-missing token as unused', async () => {
    mockTransaction.getAll.mockResolvedValue([snap()])

    await tokenService.deleteTokens(['gone'])

    expect(mockTransaction.delete).toHaveBeenCalledWith({ id: 'gone' })
  })

  it('refuses with a 409, deleting nothing, if any token has been used', async () => {
    mockTransaction.getAll.mockResolvedValue([snap([]), snap(['user-1'])])

    await expect(
      tokenService.deleteTokens(['tok-1', 'tok-2']),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockTransaction.delete).not.toHaveBeenCalled()
  })
})
