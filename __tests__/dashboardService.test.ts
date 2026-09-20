import { dashboardService } from '$lib/services/dashboardService'
import * as firestore from 'firebase/firestore'
import type {} from '../src/data.d.ts'

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  getDocs: jest.fn(),
  getCountFromServer: jest.fn(),
}))

function mockSnapshot(docs: any[]) {
  return { docs, forEach: (cb: any) => docs.forEach(cb), size: docs.length }
}

/**
 * Answers /api/resolveEmails from `accounts` (uid -> current address), the
 * way the server would. Also records every request made.
 */
function mockAccounts(accounts: Record<string, string>) {
  ;(global.fetch as jest.Mock).mockImplementation(
    async (_url: string, init: any) => {
      const { uids } = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          emails: Object.fromEntries(
            uids.map((uid: string) => [uid, accounts[uid] ?? null]),
          ),
        }),
      }
    },
  )
}

function requestedIntents() {
  return (global.fetch as jest.Mock).mock.calls.map(
    ([, init]) => JSON.parse(init.body).intent,
  )
}

function mockCount(count: number) {
  return { data: () => ({ count }) }
}

function mockDoc(id: string, data: Record<string, any>) {
  return { id, data: () => data }
}

describe('dashboardService (Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn() as jest.Mock
    mockAccounts({})
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('fetchDashboardData (reviewer view)', () => {
    it('aggregates application counts and uncompleted applicant emails, leaving registration/user data zeroed', async () => {
      // The stored addresses are stale; each applicant account's current one
      // is what the button copies.
      mockAccounts({ 'app-1': 'a@example.com' })
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockSnapshot([
          mockDoc('app-1', { personal: { email: 'stale-a@example.com' } }),
          mockDoc('app-2', { personal: {} }),
        ]),
      )
      ;(firestore.getCountFromServer as jest.Mock)
        .mockResolvedValueOnce(mockCount(10))
        .mockResolvedValueOnce(mockCount(8))
        .mockResolvedValueOnce(mockCount(5))

      const result = await dashboardService.fetchDashboardData(true)

      expect(result.dashboardData).toEqual({
        applications: {
          total: 10,
          submitted: 8,
          decided: 5,
          registered: 0,
          totalRegistrationsStarted: 0,
          enrolled: 0,
        },
        users: { total: 0 },
      })
      expect(result.classesToday).toEqual([])
      expect(result.uncompletedRegistrationsEmails).toEqual([])
      expect(result.uncompletedApplicationsEmails).toEqual(['a@example.com'])
    })

    it('skips an applicant whose account is gone', async () => {
      ;(firestore.getDocs as jest.Mock).mockResolvedValueOnce(
        mockSnapshot([
          mockDoc('app-1', { personal: { email: 'stored@example.com' } }),
        ]),
      )
      ;(firestore.getCountFromServer as jest.Mock)
        .mockResolvedValueOnce(mockCount(1))
        .mockResolvedValueOnce(mockCount(0))
        .mockResolvedValueOnce(mockCount(0))

      const result = await dashboardService.fetchDashboardData(true)
      expect(result.uncompletedApplicationsEmails).toEqual([])
    })
  })

  describe('fetchDashboardData (non-reviewer/full admin view)', () => {
    it('aggregates applications, registrations, users, and today-only classes', async () => {
      const today = new Date()
      const notToday = new Date(2000, 0, 1)

      mockAccounts({
        'parent-a': 'uncompleted-reg@example.com',
        'parent-b': 'submitted@example.com',
        'app-1': 'uncompleted-app@example.com',
      })
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(
          mockSnapshot([
            mockDoc('parent-a-1', { personal: { email: 'stale@example.com' } }),
          ]),
        )
        .mockResolvedValueOnce(
          mockSnapshot([
            mockDoc('app-1', { personal: { email: 'stale@example.com' } }),
            mockDoc('app-2', { personal: {} }),
          ]),
        )
        .mockResolvedValueOnce(
          mockSnapshot([mockDoc('parent-b-1', { personal: {} })]),
        )
        .mockResolvedValueOnce(
          mockSnapshot([
            mockDoc('class-today', {
              course: 'Python 1',
              meetingTimes: [today, notToday],
            }),
            mockDoc('class-not-today', {
              course: 'Python 2',
              meetingTimes: [notToday],
            }),
            mockDoc('class-no-times', { course: 'Python 3' }),
          ]),
        )
      ;(firestore.getCountFromServer as jest.Mock)
        .mockResolvedValueOnce(mockCount(20))
        .mockResolvedValueOnce(mockCount(15))
        .mockResolvedValueOnce(mockCount(10))
        .mockResolvedValueOnce(mockCount(50))
        .mockResolvedValueOnce(mockCount(30))
        .mockResolvedValueOnce(mockCount(12))

      const result = await dashboardService.fetchDashboardData(false)

      expect(result.dashboardData).toEqual({
        applications: {
          total: 20,
          submitted: 15,
          decided: 10,
          registered: 1,
          totalRegistrationsStarted: 30,
          enrolled: 12,
        },
        users: { total: 50 },
      })
      expect(result.uncompletedRegistrationsEmails).toEqual([
        'uncompleted-reg@example.com',
      ])
      expect(result.uncompletedApplicationsEmails).toEqual([
        'uncompleted-app@example.com',
      ])
      expect(result.classesToday).toEqual([
        { id: 'class-today', classNumber: 0, class: expect.any(Object) },
      ])
    })

    // Matched by parent account, not by address: a parent who has submitted
    // one child's registration isn't nagged about another child's draft.
    it('excludes a parent who has already submitted a registration for another child', async () => {
      mockAccounts({ 'parent-a': 'parent@example.com' })
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(
          mockSnapshot([mockDoc('parent-a-2', { personal: {} })]),
        )
        .mockResolvedValueOnce(mockSnapshot([]))
        .mockResolvedValueOnce(
          mockSnapshot([mockDoc('parent-a-1', { personal: {} })]),
        )
        .mockResolvedValueOnce(mockSnapshot([]))
      ;(firestore.getCountFromServer as jest.Mock).mockResolvedValue(
        mockCount(0),
      )

      const result = await dashboardService.fetchDashboardData(false)
      expect(result.uncompletedRegistrationsEmails).toEqual([])
      expect(requestedIntents()).not.toContain('registrationParents')
    })

    it('still loads, with empty email lists, when the lookup fails', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      })
      jest.spyOn(console, 'error').mockImplementation(() => {})
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(
          mockSnapshot([mockDoc('parent-a-1', { personal: {} })]),
        )
        .mockResolvedValueOnce(mockSnapshot([mockDoc('app-1', {})]))
        .mockResolvedValueOnce(mockSnapshot([]))
        .mockResolvedValueOnce(mockSnapshot([]))
      ;(firestore.getCountFromServer as jest.Mock).mockResolvedValue(
        mockCount(3),
      )

      const result = await dashboardService.fetchDashboardData(false)
      expect(result.dashboardData.applications.total).toBe(3)
      expect(result.uncompletedRegistrationsEmails).toEqual([])
      expect(result.uncompletedApplicationsEmails).toEqual([])
    })

    it('ignores non-array or missing meetingTimes without throwing', async () => {
      ;(firestore.getDocs as jest.Mock)
        .mockResolvedValueOnce(mockSnapshot([]))
        .mockResolvedValueOnce(mockSnapshot([]))
        .mockResolvedValueOnce(mockSnapshot([]))
        .mockResolvedValueOnce(
          mockSnapshot([
            mockDoc('class-bad', { meetingTimes: 'not-an-array' }),
            mockDoc('class-null-slot', { meetingTimes: [null] }),
          ]),
        )
      ;(firestore.getCountFromServer as jest.Mock).mockResolvedValue(
        mockCount(0),
      )

      const result = await dashboardService.fetchDashboardData(false)
      expect(result.classesToday).toEqual([])
    })
  })

  describe('timeout handling', () => {
    it('rejects with a timeout error if queries do not settle in time', async () => {
      jest.useFakeTimers()
      ;(firestore.getDocs as jest.Mock).mockReturnValue(new Promise(() => {}))
      ;(firestore.getCountFromServer as jest.Mock).mockReturnValue(
        new Promise(() => {}),
      )

      const resultPromise = dashboardService.fetchDashboardData(true, 5000)
      // Deliberately not awaited here: starting the rejection listener before
      // advancing the fake clock is what lets it observe the timeout that
      // firing the clock causes below. It's awaited on the last line.
      // eslint-disable-next-line jest/valid-expect
      const assertion = expect(resultPromise).rejects.toThrow(
        'Query timeout (5 seconds)',
      )
      await jest.advanceTimersByTimeAsync(5000)
      await assertion
    })

    it('resolves normally when queries settle before the timeout', async () => {
      jest.useFakeTimers()
      ;(firestore.getDocs as jest.Mock).mockResolvedValue(mockSnapshot([]))
      ;(firestore.getCountFromServer as jest.Mock).mockResolvedValue(
        mockCount(0),
      )

      const result = await dashboardService.fetchDashboardData(true, 5000)
      expect(result.dashboardData.applications.total).toBe(0)
    })
  })

  describe('error propagation', () => {
    it('propagates errors thrown by the underlying Firestore queries', async () => {
      ;(firestore.getDocs as jest.Mock).mockRejectedValueOnce(
        new Error('permission-denied'),
      )
      ;(firestore.getCountFromServer as jest.Mock).mockResolvedValue(
        mockCount(0),
      )

      await expect(dashboardService.fetchDashboardData(true)).rejects.toThrow(
        'permission-denied',
      )
    })
  })
})
