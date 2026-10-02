const mockCheckInStudent = jest.fn()
const mockSetMealServed = jest.fn()

jest.mock('$lib/server/checkIns', () => ({
  checkInStudent: (...args: any[]) => mockCheckInStudent(...args),
  setMealServed: (...args: any[]) => mockSetMealServed(...args),
}))

import { PATCH, POST } from '../src/routes/api/checkIn/+server'

const admin = { uid: 'admin-1', email: 'a@test.com', role: 'admin' }
const reviewer = { uid: 'rev-1', email: 'r@test.com', role: 'reviewer' }
const instructor = { uid: 'inst-1', email: 'i@test.com', role: 'instructor' }

const call = (handler: any, user: unknown, body: unknown) =>
  handler({
    request: { json: async () => body },
    locals: { user },
  })

const checkIn = {
  checkedInAt: '2026-10-17T13:00:00.000Z',
  food: { '2026-10-17': { lunch: false } },
}
const meal = {
  registrationId: 'reg-1',
  date: '2026-10-17',
  meal: 'lunch',
  served: true,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCheckInStudent.mockResolvedValue(checkIn)
  mockSetMealServed.mockResolvedValue(undefined)
})

describe('POST /api/checkIn', () => {
  it.each([
    ['an admin', admin],
    ['a reviewer', reviewer],
  ])('checks the student in for %s', async (_, user) => {
    const res = await call(POST, user, { registrationId: 'reg-1' })

    expect(res.body).toEqual(checkIn)
    expect(mockCheckInStudent).toHaveBeenCalledWith('reg-1')
  })

  it('takes no time or meals from the caller', async () => {
    await call(POST, admin, {
      registrationId: 'reg-1',
      checkedInAt: '2020-01-01T00:00:00.000Z',
      food: { '2026-10-17': { lunch: true } },
    })

    expect(mockCheckInStudent).toHaveBeenCalledWith('reg-1')
  })

  it.each([
    ['a signed-out caller', null, 401],
    ['an instructor', instructor, 403],
  ])('refuses %s', async (_, user, status) => {
    await expect(
      call(POST, user, { registrationId: 'reg-1' }),
    ).rejects.toMatchObject({ status })
    expect(mockCheckInStudent).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing student', {}],
    ['an id that addresses another path', { registrationId: 'a/b/c' }],
  ])('refuses %s', async (_, body) => {
    await expect(call(POST, admin, body)).rejects.toMatchObject({ status: 400 })
    expect(mockCheckInStudent).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/checkIn', () => {
  it.each([
    ['an admin', admin],
    ['a reviewer', reviewer],
  ])('records the meal for %s', async (_, user) => {
    const res = await call(PATCH, user, meal)

    expect(res.body).toEqual({ success: true })
    expect(mockSetMealServed).toHaveBeenCalledWith(
      'reg-1',
      '2026-10-17',
      'lunch',
      true,
    )
  })

  it.each([
    ['a signed-out caller', null, 401],
    ['an instructor', instructor, 403],
  ])('refuses %s', async (_, user, status) => {
    await expect(call(PATCH, user, meal)).rejects.toMatchObject({ status })
    expect(mockSetMealServed).not.toHaveBeenCalled()
  })

  it.each([
    ['a date that is not a date', { ...meal, date: 'food' }],
    ['a meal that is a field path', { ...meal, meal: 'lunch.extra' }],
    ['a served that is not a boolean', { ...meal, served: 'yes' }],
    ['an id that addresses another path', { ...meal, registrationId: 'a/b' }],
  ])('refuses %s', async (_, body) => {
    await expect(call(PATCH, admin, body)).rejects.toMatchObject({
      status: 400,
    })
    expect(mockSetMealServed).not.toHaveBeenCalled()
  })
})
