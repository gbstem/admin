const docs: Record<string, any> = {}
const mockTransaction = {
  get: jest.fn(async (ref: { path: string }) => ({
    exists: ref.path in docs,
    data: () => docs[ref.path],
  })),
  update: jest.fn(),
}

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (path: string) => ({ path }),
    runTransaction: (fn: (t: typeof mockTransaction) => unknown) =>
      fn(mockTransaction),
  },
}))

import {
  classesCollection,
  registrationsCollection,
} from '$lib/data/collections'
import { dropStudent, enrollStudent } from '$lib/server/classEnrollments'

const CLASS = `${classesCollection}/c-1`
const REG = `${registrationsCollection}/p-1`

/** The update the transaction made to `path`, or undefined. */
const updateOf = (path: string) =>
  mockTransaction.update.mock.calls.find(([ref]) => ref.path === path)?.[1]

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(docs)) delete docs[key]
})

describe('enrollStudent', () => {
  it('adds each document to the other in one transaction', async () => {
    docs[CLASS] = { course: 'Python 1', students: ['p-9'], classCap: 1 }
    docs[REG] = { personal: {}, classes: ['c-0'] }

    const { classData, registration } = await enrollStudent('c-1', 'p-1')

    expect(updateOf(CLASS)).toEqual({ students: ['p-9', 'p-1'] })
    expect(updateOf(REG)).toEqual({ classes: ['c-0', 'c-1'], enrolled: true })
    expect(classData.students).toEqual(['p-9', 'p-1'])
    expect(registration.enrolled).toBe(true)
  })

  // An admin may override what portal enforces for parents.
  it('makes no capacity check', async () => {
    docs[CLASS] = { students: ['p-9'], classCap: 1 }
    docs[REG] = { personal: {} }

    await enrollStudent('c-1', 'p-1')

    expect(updateOf(CLASS)).toEqual({ students: ['p-9', 'p-1'] })
  })

  it('completes a half-finished enrollment without duplicating', async () => {
    docs[CLASS] = { students: ['p-1'] }
    docs[REG] = { personal: {}, classes: [] }

    await enrollStudent('c-1', 'p-1')

    expect(updateOf(CLASS)).toEqual({ students: ['p-1'] })
    expect(updateOf(REG)).toEqual({ classes: ['c-1'], enrolled: true })
  })

  it.each([
    ['class', REG],
    ['registration', CLASS],
  ])('refuses (404) a missing %s, writing nothing', async (_, present) => {
    docs[present] = { personal: {}, students: [] }

    await expect(enrollStudent('c-1', 'p-1')).rejects.toMatchObject({
      status: 404,
    })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })
})

describe('dropStudent', () => {
  it('clears both sides, staying enrolled while classes remain', async () => {
    docs[CLASS] = { students: ['p-1', 'p-9'] }
    docs[REG] = { classes: ['c-1', 'c-2'], enrolled: true }

    await dropStudent('c-1', 'p-1')

    expect(updateOf(CLASS)).toEqual({ students: ['p-9'] })
    expect(updateOf(REG)).toEqual({ classes: ['c-2'], enrolled: true })
  })

  it('sets enrolled false when no class is left, and copes with no classes field', async () => {
    docs[CLASS] = { students: ['p-1'] }
    docs[REG] = {}

    await dropStudent('c-1', 'p-1')

    expect(updateOf(REG)).toEqual({ classes: [], enrolled: false })
  })

  it('still clears the registration when the class is gone', async () => {
    docs[REG] = { classes: ['c-1'] }

    await dropStudent('c-1', 'p-1')

    expect(updateOf(CLASS)).toBeUndefined()
    expect(updateOf(REG)).toEqual({ classes: [], enrolled: false })
  })

  it('refuses (404) a missing registration, writing nothing', async () => {
    docs[CLASS] = { students: ['p-1'] }

    await expect(dropStudent('c-1', 'p-1')).rejects.toMatchObject({
      status: 404,
    })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })
})
