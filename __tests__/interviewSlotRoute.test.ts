const mockCreateInterviewSlot = jest.fn()
const mockUpdateInterviewSlot = jest.fn()
const mockDeleteInterviewSlot = jest.fn()
const mockSendInterviewAssignedEmail = jest.fn()

jest.mock('$lib/server/interviewSlots', () => ({
  createInterviewSlot: (...args: any[]) => mockCreateInterviewSlot(...args),
  updateInterviewSlot: (...args: any[]) => mockUpdateInterviewSlot(...args),
  deleteInterviewSlot: (...args: any[]) => mockDeleteInterviewSlot(...args),
  sendInterviewAssignedEmail: (...args: any[]) =>
    mockSendInterviewAssignedEmail(...args),
}))

import { DELETE, PATCH, POST } from '../src/routes/api/interviewSlot/+server'

const admin = { uid: 'admin-1', email: 'a@test.com', role: 'admin' }
const reviewer = { uid: 'rev-1', email: 'r@test.com', role: 'reviewer' }
const DATE = '2026-10-05T18:00:00.000Z'
const LINK = 'https://mit.zoom.us/j/1'

const call = (handler: any, user: unknown, body: unknown): Promise<any> =>
  handler({ request: { json: async () => body }, locals: { user } })

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateInterviewSlot.mockResolvedValue({ id: 'slot-1' })
  mockSendInterviewAssignedEmail.mockResolvedValue(true)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('POST /api/interviewSlot', () => {
  it('lets a reviewer add an open slot, as themselves, emailing nobody', async () => {
    const res = await call(POST, reviewer, { date: DATE, meetingLink: LINK })

    expect(mockCreateInterviewSlot).toHaveBeenCalledWith(
      reviewer,
      { date: new Date(DATE), meetingLink: LINK },
      undefined,
    )
    expect(mockSendInterviewAssignedEmail).not.toHaveBeenCalled()
    expect(res.body).toEqual({ id: 'slot-1', emailSent: true })
  })

  it('ignores an interviewer or interviewee the caller names', async () => {
    await call(POST, reviewer, {
      date: DATE,
      meetingLink: LINK,
      interviewerName: 'Someone Else',
      interviewerUid: 'other-uid',
      intervieweeId: 'victim-uid',
    })

    expect(mockCreateInterviewSlot).toHaveBeenCalledWith(
      reviewer,
      { date: new Date(DATE), meetingLink: LINK },
      undefined,
    )
  })

  it('lets an admin assign the slot, then emails the applicant', async () => {
    mockSendInterviewAssignedEmail.mockResolvedValue(false)

    const res = await call(POST, admin, {
      date: DATE,
      meetingLink: LINK,
      applicationId: 'app-1',
    })

    expect(mockCreateInterviewSlot).toHaveBeenCalledWith(
      admin,
      { date: new Date(DATE), meetingLink: LINK },
      'app-1',
    )
    expect(mockSendInterviewAssignedEmail).toHaveBeenCalledWith({
      id: 'slot-1',
    })
    expect(res.body).toEqual({ id: 'slot-1', emailSent: false })
  })

  it('refuses a reviewer assigning a slot', async () => {
    await expect(
      call(POST, reviewer, {
        date: DATE,
        meetingLink: LINK,
        applicationId: 'app-1',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockCreateInterviewSlot).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a local date-time rather than an instant',
      { date: '2026-10-05T14:00', meetingLink: LINK },
    ],
    [
      'a meeting link on another host',
      { date: DATE, meetingLink: 'https://evil.example.com/j/1' },
    ],
    [
      'a path-like application id',
      { date: DATE, meetingLink: LINK, applicationId: 'a/b' },
    ],
  ])('refuses %s', async (_, body) => {
    await expect(call(POST, admin, body)).rejects.toMatchObject({ status: 400 })
    expect(mockCreateInterviewSlot).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    await expect(
      call(POST, null, { date: DATE, meetingLink: LINK }),
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe('PATCH /api/interviewSlot', () => {
  it('passes the caller, for the ownership check, with the new date and link', async () => {
    await call(PATCH, reviewer, {
      slotId: 'slot-1',
      date: DATE,
      meetingLink: LINK,
    })

    expect(mockUpdateInterviewSlot).toHaveBeenCalledWith(reviewer, 'slot-1', {
      date: new Date(DATE),
      meetingLink: LINK,
    })
  })

  it('refuses a disallowed meeting link', async () => {
    await expect(
      call(PATCH, admin, {
        slotId: 'slot-1',
        date: DATE,
        meetingLink: 'http://x.test',
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(mockUpdateInterviewSlot).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/interviewSlot', () => {
  it('passes the caller, for the ownership check, with the slot', async () => {
    await call(DELETE, reviewer, { slotId: 'slot-1' })

    expect(mockDeleteInterviewSlot).toHaveBeenCalledWith(reviewer, 'slot-1')
  })

  it.each([
    ['a signed-out caller', null, { slotId: 'slot-1' }, 401],
    ['a path-like slot id', admin, { slotId: 'a/b' }, 400],
  ])('refuses %s', async (_, user, body, status) => {
    await expect(call(DELETE, user, body)).rejects.toMatchObject({ status })
    expect(mockDeleteInterviewSlot).not.toHaveBeenCalled()
  })
})
