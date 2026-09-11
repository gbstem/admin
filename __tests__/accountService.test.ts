const mockRunTransaction = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
    }),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
}))

import type {} from '../src/data.d.ts'
import { recordNewAccount } from '$lib/server/accountService'

const ACCOUNT = {
  uid: 'new-uid',
  token: 'token-1',
  role: 'reviewer' as Data.Role,
  firstName: 'Grace',
  lastName: 'Hopper',
}

const DAY = 24 * 60 * 60 * 1000
const timestamp = (date: Date) => ({ toDate: () => date })

/** Every document the fake Firestore holds, by path. */
let docs: Record<string, any>
let transaction: { get: jest.Mock; set: jest.Mock; update: jest.Mock }

beforeEach(() => {
  jest.clearAllMocks()
  docs = {
    'tokens/token-1': {
      role: 'reviewer',
      consumable: true,
      consumers: [],
      expires: timestamp(new Date(Date.now() + DAY)),
    },
  }
  transaction = {
    get: jest.fn(async (ref: { path: string }) => ({
      exists: ref.path in docs,
      data: () => docs[ref.path],
    })),
    set: jest.fn(),
    update: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
})

describe('recordNewAccount', () => {
  it('writes the users document and consumes the token in one transaction', async () => {
    await recordNewAccount(ACCOUNT)

    expect(mockRunTransaction).toHaveBeenCalledTimes(1)
    expect(transaction.set).toHaveBeenCalledWith(
      { path: 'users/new-uid' },
      { role: 'reviewer', firstName: 'Grace', lastName: 'Hopper' },
    )
    expect(transaction.update).toHaveBeenCalledWith(
      { path: 'tokens/token-1' },
      { consumers: ['new-uid'] },
    )
  })

  it('reads the token before writing anything', async () => {
    const order: string[] = []
    transaction.get.mockImplementation(async (ref: { path: string }) => {
      order.push(`get ${ref.path}`)
      return { exists: true, data: () => docs[ref.path] }
    })
    transaction.set.mockImplementation((ref: { path: string }) =>
      order.push(`set ${ref.path}`),
    )
    transaction.update.mockImplementation((ref: { path: string }) =>
      order.push(`update ${ref.path}`),
    )

    await recordNewAccount(ACCOUNT)

    expect(order).toEqual([
      'get tokens/token-1',
      'set users/new-uid',
      'update tokens/token-1',
    ])
  })

  // The race the signup page's up-front check can't see: another signup
  // consumed this single-use token after that check passed.
  it('refuses a single-use token another signup consumed, and writes nothing', async () => {
    docs['tokens/token-1'].consumers = ['someone-else']

    await expect(recordNewAccount(ACCOUNT)).rejects.toBe('consumed')
    expect(transaction.set).not.toHaveBeenCalled()
    expect(transaction.update).not.toHaveBeenCalled()
  })

  it('adds to the consumers of a reusable token', async () => {
    docs['tokens/token-1'].consumable = false
    docs['tokens/token-1'].consumers = ['earlier-uid']

    await recordNewAccount(ACCOUNT)

    expect(transaction.update).toHaveBeenCalledWith(
      { path: 'tokens/token-1' },
      { consumers: ['earlier-uid', 'new-uid'] },
    )
  })

  it('refuses a token that has expired since the page checked it', async () => {
    docs['tokens/token-1'].expires = timestamp(new Date(Date.now() - 1000))

    await expect(recordNewAccount(ACCOUNT)).rejects.toBe('expired')
    expect(transaction.set).not.toHaveBeenCalled()
  })

  it('refuses a token that no longer exists', async () => {
    delete docs['tokens/token-1']

    await expect(recordNewAccount(ACCOUNT)).rejects.toBe('fake')
    expect(transaction.set).not.toHaveBeenCalled()
  })
})
