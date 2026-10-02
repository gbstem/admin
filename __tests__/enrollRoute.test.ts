const mockEnrollStudent = jest.fn()
const mockDropStudent = jest.fn()
const mockResolveAccountEmail = jest.fn()
const mockSendEmail = jest.fn()

jest.mock('$lib/server/classEnrollments', () => ({
  enrollStudent: (...args: any[]) => mockEnrollStudent(...args),
  dropStudent: (...args: any[]) => mockDropStudent(...args),
}))
jest.mock('$lib/server/accountEmail', () => ({
  resolveAccountEmail: (...args: any[]) => mockResolveAccountEmail(...args),
}))
jest.mock('$lib/server/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

import { DELETE, POST } from '../src/routes/api/enroll/+server'

const admin = { uid: 'admin-1', email: 'a@test.com', role: 'admin' }
const reviewer = { uid: 'rev-1', email: 'r@test.com', role: 'reviewer' }

const call = (handler: any, user: unknown, body: unknown) =>
  handler({
    request: { json: async () => body },
    locals: { user },
  })

const enrollment = (classOverrides: Record<string, unknown> = {}) => ({
  classData: {
    course: 'Python 1',
    instructorUid: 'inst-uid',
    instructorFirstName: 'Jane',
    instructorLastName: 'Doe',
    classDay1: 'Monday',
    classTime1: '14:00',
    classDay2: 'Wednesday',
    classTime2: '16:00',
    meetingLink: 'https://mit.zoom.us/j/99593863281',
    online: true,
    students: ['parent-uid-1'],
    ...classOverrides,
  },
  registration: {
    personal: {
      studentFirstName: 'Sally',
      studentLastName: 'Brown',
      parentFirstName: 'Charlie',
    },
    classes: ['c-1'],
    enrolled: true,
  },
})

beforeEach(() => {
  jest.clearAllMocks()
  mockEnrollStudent.mockResolvedValue(enrollment())
  mockDropStudent.mockResolvedValue(undefined)
  mockResolveAccountEmail.mockImplementation(async (uid: string) =>
    uid === 'parent-uid' ? 'parent@test.com' : 'inst@test.com',
  )
  mockSendEmail.mockResolvedValue(undefined)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('POST /api/enroll', () => {
  it('enrolls, then mails the family from the stored documents', async () => {
    const res = await call(POST, admin, {
      classId: 'c-1',
      registrationId: 'parent-uid-1',
    })

    expect(mockEnrollStudent).toHaveBeenCalledWith('c-1', 'parent-uid-1')
    expect(res.body).toEqual({ emailSent: true })
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'parent@test.com',
        cc: 'inst@test.com',
        subject: 'Python 1 class details for Sally Brown',
      }),
    )
    const { html } = mockSendEmail.mock.calls[0][0]
    expect(html).toContain('Charlie')
    expect(html).toContain('Jane Doe')
    expect(html).toContain('https://mit.zoom.us/j/99593863281')
  })

  it('leaves out a stored meeting link that is not an allowed host', async () => {
    mockEnrollStudent.mockResolvedValue(
      enrollment({ meetingLink: 'https://evil.example.com/j/1' }),
    )

    await call(POST, admin, { classId: 'c-1', registrationId: 'parent-uid-1' })

    expect(mockSendEmail.mock.calls[0][0].html).not.toContain('evil.example')
  })

  it('reports an unsent email without undoing the enrollment', async () => {
    mockSendEmail.mockRejectedValue(new Error('smtp down'))

    const res = await call(POST, admin, {
      classId: 'c-1',
      registrationId: 'parent-uid-1',
    })

    expect(res.init?.status ?? 200).toBe(200)
    expect(res.body).toEqual({ emailSent: false })
  })

  it('reports an unsent email when the parent account is gone', async () => {
    mockResolveAccountEmail.mockRejectedValue(
      Object.assign(new Error('gone'), { status: 400 }),
    )

    const res = await call(POST, admin, {
      classId: 'c-1',
      registrationId: 'parent-uid-1',
    })

    expect(res.body).toEqual({ emailSent: false })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('refuses a reviewer, enrolling no one', async () => {
    await expect(
      call(POST, reviewer, { classId: 'c-1', registrationId: 'parent-uid-1' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockEnrollStudent).not.toHaveBeenCalled()
  })

  it.each([
    [{ registrationId: 'parent-uid-1' }],
    [{ classId: 'c-1', registrationId: 'a/b' }],
    // The old payload, with the email's details supplied by the caller.
    [{ registrationId: 'parent-uid-1', course: 'Math', instructorUid: 'x' }],
  ])('refuses a malformed body %j', async (body) => {
    await expect(call(POST, admin, body)).rejects.toMatchObject({
      status: 400,
    })
    expect(mockEnrollStudent).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/enroll', () => {
  it('drops the student, sending no email', async () => {
    const res = await call(DELETE, admin, {
      classId: 'c-1',
      registrationId: 'parent-uid-1',
    })

    expect(res.init?.status ?? 200).toBe(200)
    expect(mockDropStudent).toHaveBeenCalledWith('c-1', 'parent-uid-1')
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('refuses a reviewer', async () => {
    await expect(
      call(DELETE, reviewer, { classId: 'c-1', registrationId: 'p-1' }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockDropStudent).not.toHaveBeenCalled()
  })
})
