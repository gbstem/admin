/**
 * @jest-environment node
 */
// The routes answer with Fetch API `Response`s, which jsdom does not provide.
const mockRefreshClassStatuses = jest.fn()

jest.mock('#lib/server/classService.js', () => ({
  classService: {
    refreshClassStatuses: (...args: any[]) => mockRefreshClassStatuses(...args),
  },
}))

import { error } from '@sveltejs/kit'
import { POST } from '../src/routes/api/classStatuses/+server'

const admin = {
  uid: 'admin-1',
  email: 'a@test.com',
  role: 'admin',
  emailVerified: true,
}
const reviewer = {
  uid: 'rev-1',
  email: 'r@test.com',
  role: 'reviewer',
  emailVerified: true,
}

const call = (user: unknown, body: unknown) =>
  (POST as any)({
    request: { json: async () => body },
    locals: { user },
  })

beforeEach(() => {
  jest.clearAllMocks()
  mockRefreshClassStatuses.mockResolvedValue(['ClassNotHeld'])
})

describe('POST /api/classStatuses', () => {
  it.each([
    ['an admin', admin],
    ['a reviewer', reviewer],
  ])("refreshes and returns the class's statuses for %s", async (_, user) => {
    const res = await call(user, { classId: 'inst-uid-1' })

    expect(await res.json()).toEqual({ classStatuses: ['ClassNotHeld'] })
    expect(mockRefreshClassStatuses).toHaveBeenCalledWith('inst-uid-1')
  })

  it('takes no statuses from the caller', async () => {
    await call(admin, {
      classId: 'inst-uid-1',
      classStatuses: ['EverythingComplete'],
    })

    expect(mockRefreshClassStatuses).toHaveBeenCalledWith('inst-uid-1')
  })

  it.each([
    ['a signed-out caller', null, 401],
    [
      'an instructor',
      { uid: 'inst-uid', role: 'instructor', emailVerified: true },
      403,
    ],
  ])('refuses %s', async (_, user, status) => {
    await expect(call(user, { classId: 'inst-uid-1' })).rejects.toMatchObject({
      status,
    })
    expect(mockRefreshClassStatuses).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing class id', {}],
    ['an id that addresses another path', { classId: 'a/b/c' }],
  ])('refuses %s', async (_, body) => {
    await expect(call(admin, body)).rejects.toMatchObject({ status: 400 })
    expect(mockRefreshClassStatuses).not.toHaveBeenCalled()
  })

  it("passes on the service's refusal of a class that doesn't exist", async () => {
    mockRefreshClassStatuses.mockImplementation(async () => {
      throw error(404, 'Class not found.')
    })

    await expect(call(admin, { classId: 'nope' })).rejects.toMatchObject({
      status: 404,
    })
  })
})
