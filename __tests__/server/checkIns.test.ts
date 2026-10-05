const mockTransaction = {
  get: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}
const mockAdminDoc = jest.fn((path: string) => ({ path }))

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (path: string) => mockAdminDoc(path),
    runTransaction: (run: (transaction: unknown) => unknown) =>
      run(mockTransaction),
  },
}))

const mockSchedule: Record<string, Record<string, boolean>> = {}
jest.mock('$lib/data/retreatMealSchedule', () => ({
  get retreatMealSchedule() {
    return mockSchedule
  },
}))

import {
  checkInsCollection,
  registrationsCollection,
} from '$lib/data/collections'
import { checkInStudent, setMealServed } from '$lib/server/checkIns'

const now = new Date('2026-10-17T13:00:00Z')
const CHECK_IN = { path: `${checkInsCollection}/reg-1` }

/** What the transaction reads, by document path. */
function stored(docs: Record<string, Record<string, unknown> | undefined>) {
  mockTransaction.get.mockImplementation(
    async ({ path }: { path: string }) => ({
      exists: docs[path] !== undefined,
      data: () => docs[path],
    }),
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  for (const date of Object.keys(mockSchedule)) delete mockSchedule[date]
  mockSchedule['2026-10-17'] = { lunch: false, dinner: false }
})

describe('checkInStudent', () => {
  const registration = `${registrationsCollection}/reg-1`

  it('checks the student in at the given time with the meal schedule', async () => {
    stored({ [registration]: {} })

    await expect(checkInStudent('reg-1', now)).resolves.toEqual({
      checkedInAt: now.toISOString(),
      food: { '2026-10-17': { lunch: false, dinner: false } },
    })

    expect(mockTransaction.set).toHaveBeenCalledWith(
      CHECK_IN,
      {
        checkedIn: true,
        checkedInAt: now,
        food: { '2026-10-17': { lunch: false, dinner: false } },
      },
      { merge: true },
    )
  })

  it('seeds the meals as a copy, not the shared schedule', async () => {
    stored({ [registration]: {} })

    const { food } = await checkInStudent('reg-1', now)

    expect(food).not.toBe(mockSchedule)
    expect(food['2026-10-17']).not.toBe(mockSchedule['2026-10-17'])
  })

  it('leaves a student already checked in as they were, meals and all', async () => {
    const earlier = new Date('2026-10-17T09:00:00Z')
    stored({
      [registration]: {},
      [CHECK_IN.path]: {
        checkedIn: true,
        checkedInAt: { toDate: () => earlier },
        food: { '2026-10-17': { lunch: true, dinner: false } },
      },
    })

    await expect(checkInStudent('reg-1', now)).resolves.toEqual({
      checkedInAt: earlier.toISOString(),
      food: { '2026-10-17': { lunch: true, dinner: false } },
    })
    expect(mockTransaction.set).not.toHaveBeenCalled()
  })

  it('refuses an id with no registration, writing nothing', async () => {
    stored({})

    await expect(checkInStudent('nobody', now)).rejects.toMatchObject({
      status: 404,
    })
    expect(mockTransaction.set).not.toHaveBeenCalled()
  })
})

describe('setMealServed', () => {
  const checkedIn = (food: unknown) =>
    stored({ [CHECK_IN.path]: { checkedIn: true, food } })

  it('sets the one meal, keeping the rest of the record', async () => {
    checkedIn({
      '2026-10-17': { lunch: false, dinner: true },
      '2026-10-18': { breakfast: false },
    })

    await setMealServed('reg-1', '2026-10-17', 'lunch', true)

    expect(mockTransaction.update).toHaveBeenCalledWith(CHECK_IN, {
      food: {
        '2026-10-17': { lunch: true, dinner: true },
        '2026-10-18': { breakfast: false },
      },
    })
  })

  it.each([
    ['a date', '2026-12-25', 'lunch'],
    ['a meal', '2026-10-17', 'brunch'],
  ])("refuses %s that isn't on the student's record", async (_, date, meal) => {
    checkedIn({ '2026-10-17': { lunch: false } })

    await expect(
      setMealServed('reg-1', date, meal, true),
    ).rejects.toMatchObject({ status: 400 })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })

  it.each([
    ['has no check-in record', {}],
    ['has a record but is not checked in', { [CHECK_IN.path]: { food: {} } }],
  ])('refuses a student who %s', async (_, docs) => {
    stored(docs)

    await expect(
      setMealServed('reg-1', '2026-10-17', 'lunch', true),
    ).rejects.toMatchObject({ status: 404 })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })
})
