const mockRunTransaction = jest.fn()
const mockDeleteUser = jest.fn()

/** Every document the fake Firestore holds, by full path (`collection/id`). */
let docs: Record<string, any>

function queryDocs(q: { collection: string; field: string; value: unknown }) {
  const prefix = `${q.collection}/`
  return Object.entries(docs)
    .filter(
      ([path, data]) => path.startsWith(prefix) && data[q.field] === q.value,
    )
    .map(([path, data]) => ({
      id: path.slice(prefix.length),
      data: () => data,
    }))
}

function makeQuery(collection: string, field: string, value: unknown) {
  const q = { __query: true as const, collection, field, value }
  return { ...q, get: async () => ({ docs: queryDocs(q) }) }
}

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: (id: string) => ({ path: `${name}/${id}` }),
      where: (field: string, _op: string, value: unknown) =>
        makeQuery(name, field, value),
    }),
    runTransaction: (...args: any[]) => mockRunTransaction(...args),
  },
  adminAuth: {
    deleteUser: (...args: any[]) => mockDeleteUser(...args),
  },
}))

import type {} from '../src/data.d.ts'
import {
  checkAdminAccountDeletionEligibility,
  deleteAdminAccount,
  recordNewAccount,
} from '$lib/server/accountService'

const ACCOUNT = {
  uid: 'new-uid',
  token: 'token-1',
  firstName: 'Grace',
  lastName: 'Hopper',
}

const DAY = 24 * 60 * 60 * 1000
const timestamp = (date: Date) => ({ toDate: () => date })

let transaction: {
  get: jest.Mock
  set: jest.Mock
  update: jest.Mock
  delete: jest.Mock
}

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
    get: jest.fn(async (ref: any) =>
      ref.__query
        ? { docs: queryDocs(ref) }
        : { exists: ref.path in docs, data: () => docs[ref.path] },
    ),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  }
  mockRunTransaction.mockImplementation(async (fn: any) => fn(transaction))
})

describe('recordNewAccount', () => {
  it('writes the users document and consumes the token in one transaction', async () => {
    await recordNewAccount(ACCOUNT)

    expect(mockRunTransaction).toHaveBeenCalledTimes(1)
    expect(transaction.set).toHaveBeenCalledWith(
      { path: 'users/new-uid' },
      { firstName: 'Grace', lastName: 'Hopper' },
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

const SLOTS_COLLECTION = 'semesters/Fall26/instructorInterviewTimes'
const UID = 'interviewer-uid'
const future = new Date(Date.now() + DAY)
const past = new Date(Date.now() - DAY)
const slotDoc = (overrides: Record<string, unknown> = {}) => ({
  interviewerUid: UID,
  intervieweeId: '',
  date: timestamp(future),
  ...overrides,
})

describe('checkAdminAccountDeletionEligibility', () => {
  it('is eligible with no interview slots', async () => {
    await expect(checkAdminAccountDeletionEligibility(UID)).resolves.toEqual({
      canDelete: true,
      reason: null,
    })
  })

  it('is eligible with only open or past-booked slots', async () => {
    docs[`${SLOTS_COLLECTION}/open`] = slotDoc()
    docs[`${SLOTS_COLLECTION}/past-booked`] = slotDoc({
      intervieweeId: 'applicant-1',
      date: timestamp(past),
    })

    await expect(checkAdminAccountDeletionEligibility(UID)).resolves.toEqual({
      canDelete: true,
      reason: null,
    })
  })

  it('is blocked by a future booked slot', async () => {
    docs[`${SLOTS_COLLECTION}/future-booked`] = slotDoc({
      intervieweeId: 'applicant-1',
    })

    const result = await checkAdminAccountDeletionEligibility(UID)
    expect(result.canDelete).toBe(false)
    expect(result.reason).toMatch(/scheduled interview/i)
  })

  it("ignores another interviewer's slots", async () => {
    docs[`${SLOTS_COLLECTION}/someone-elses`] = slotDoc({
      interviewerUid: 'someone-else',
      intervieweeId: 'applicant-1',
    })

    await expect(checkAdminAccountDeletionEligibility(UID)).resolves.toEqual({
      canDelete: true,
      reason: null,
    })
  })
})

describe('deleteAdminAccount', () => {
  it('deletes every open slot and the users document, then the Auth account', async () => {
    docs[`${SLOTS_COLLECTION}/open-1`] = slotDoc()
    docs[`${SLOTS_COLLECTION}/open-2`] = slotDoc()
    docs[`${SLOTS_COLLECTION}/past-booked`] = slotDoc({
      intervieweeId: 'applicant-1',
      date: timestamp(past),
    })

    await deleteAdminAccount(UID)

    expect(transaction.delete).toHaveBeenCalledWith({
      path: `${SLOTS_COLLECTION}/open-1`,
    })
    expect(transaction.delete).toHaveBeenCalledWith({
      path: `${SLOTS_COLLECTION}/open-2`,
    })
    expect(transaction.delete).not.toHaveBeenCalledWith({
      path: `${SLOTS_COLLECTION}/past-booked`,
    })
    expect(transaction.delete).toHaveBeenCalledWith({
      path: `users/${UID}`,
    })
    expect(mockDeleteUser).toHaveBeenCalledWith(UID)
  })

  it('re-checks eligibility inside the transaction and refuses a future booked slot', async () => {
    docs[`${SLOTS_COLLECTION}/future-booked`] = slotDoc({
      intervieweeId: 'applicant-1',
    })

    await expect(deleteAdminAccount(UID)).rejects.toMatchObject({
      status: 409,
    })
    expect(transaction.delete).not.toHaveBeenCalled()
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('does not delete the Auth account when the transaction fails', async () => {
    mockRunTransaction.mockRejectedValueOnce(new Error('unavailable'))

    await expect(deleteAdminAccount(UID)).rejects.toThrow('unavailable')
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })
})
