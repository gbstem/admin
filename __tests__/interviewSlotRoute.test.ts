/**
 * @jest-environment node
 */
// The routes answer with Fetch API `Response`s, which jsdom does not provide.
const mockCreateInterviewSlot = jest.fn()
const mockUpdateInterviewSlot = jest.fn()
const mockDeleteInterviewSlot = jest.fn()
const mockMarkInterviewSlotMissed = jest.fn()
const mockSendInterviewAssignedEmail = jest.fn()
const mockSendInterviewRescheduledEmail = jest.fn()
const mockSendInterviewCanceledEmail = jest.fn()
const mockSendInterviewMissedEmail = jest.fn()
const mockCreateOpenInterviewSlots = jest.fn()
const mockDeleteOpenInterviewSlots = jest.fn()

jest.mock('#lib/server/interviewSlots.js', () => ({
  createInterviewSlot: (...args: any[]) => mockCreateInterviewSlot(...args),
  updateInterviewSlot: (...args: any[]) => mockUpdateInterviewSlot(...args),
  deleteInterviewSlot: (...args: any[]) => mockDeleteInterviewSlot(...args),
  markInterviewSlotMissed: (...args: any[]) =>
    mockMarkInterviewSlotMissed(...args),
  sendInterviewAssignedEmail: (...args: any[]) =>
    mockSendInterviewAssignedEmail(...args),
  sendInterviewRescheduledEmail: (...args: any[]) =>
    mockSendInterviewRescheduledEmail(...args),
  sendInterviewCanceledEmail: (...args: any[]) =>
    mockSendInterviewCanceledEmail(...args),
  sendInterviewMissedEmail: (...args: any[]) =>
    mockSendInterviewMissedEmail(...args),
  createOpenInterviewSlots: (...args: any[]) =>
    mockCreateOpenInterviewSlots(...args),
  deleteOpenInterviewSlots: (...args: any[]) =>
    mockDeleteOpenInterviewSlots(...args),
}))
jest.mock('#lib/server/interviewWindow.js', () => ({
  interviewSchedulingWindow: () => WINDOW,
}))
const WINDOW = {
  opens: new Date('2026-09-01T04:00:00.000Z'),
  closes: new Date('2030-01-01T05:00:00.000Z'),
}

import { DELETE, PATCH, POST } from '../src/routes/api/interviewSlot/+server'

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
const DATE = '2026-10-05T18:00:00.000Z'
const LINK = 'https://mit.zoom.us/j/1'

const call = (handler: any, user: unknown, body: unknown): Promise<any> =>
  handler({ request: { json: async () => body }, locals: { user } })

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateInterviewSlot.mockResolvedValue({ id: 'slot-1' })
  mockSendInterviewAssignedEmail.mockResolvedValue(true)
  // An open slot, by default: the change emails nobody.
  mockUpdateInterviewSlot.mockResolvedValue(null)
  mockDeleteInterviewSlot.mockResolvedValue(null)
  mockMarkInterviewSlotMissed.mockResolvedValue(null)
  mockSendInterviewRescheduledEmail.mockResolvedValue(true)
  mockSendInterviewCanceledEmail.mockResolvedValue(true)
  mockSendInterviewMissedEmail.mockResolvedValue(true)
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
    expect(await res.json()).toEqual({ id: 'slot-1', emailSent: true })
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
    expect(await res.json()).toEqual({ id: 'slot-1', emailSent: false })
  })

  // A slot made here is always the caller's own, so assigning one is open to
  // any interviewer: whichever is free answers a candidate's availability.
  it('lets a reviewer assign their own slot to an applicant', async () => {
    await call(POST, reviewer, {
      date: DATE,
      meetingLink: LINK,
      applicationId: 'app-1',
    })

    expect(mockCreateInterviewSlot).toHaveBeenCalledWith(
      reviewer,
      { date: new Date(DATE), meetingLink: LINK },
      'app-1',
    )
    expect(mockSendInterviewAssignedEmail).toHaveBeenCalled()
  })

  it('refuses an applicant adding a slot', async () => {
    await expect(
      call(
        POST,
        { ...reviewer, role: 'instructor' },
        {
          date: DATE,
          meetingLink: LINK,
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockCreateInterviewSlot).not.toHaveBeenCalled()
  })

  describe("action: 'createMany'", () => {
    const counts = {
      created: 2,
      replaced: 0,
      skippedBooked: 0,
      skippedOverlap: 0,
      skippedOutside: 0,
    }
    const LATER = '2026-10-05T18:15:00.000Z'

    it("creates the caller's open slots inside the server's window", async () => {
      mockCreateOpenInterviewSlots.mockResolvedValue(counts)

      const res = await call(POST, reviewer, {
        action: 'createMany',
        dates: [DATE, LATER],
        meetingLink: LINK,
      })

      expect(mockCreateOpenInterviewSlots).toHaveBeenCalledWith(
        reviewer,
        [new Date(DATE), new Date(LATER)],
        LINK,
        WINDOW,
      )
      expect(await res.json()).toEqual(counts)
      expect(mockCreateInterviewSlot).not.toHaveBeenCalled()
    })

    it.each([
      ['no times', { dates: [], meetingLink: LINK }],
      ['a local date-time', { dates: ['2026-10-05T14:00'], meetingLink: LINK }],
      [
        'a meeting link on another host',
        { dates: [DATE], meetingLink: 'https://evil.example.com/j/1' },
      ],
      [
        'more times than one save sends',
        { dates: Array(2001).fill(DATE), meetingLink: LINK },
      ],
    ])('refuses %s', async (_, body) => {
      await expect(
        call(POST, reviewer, { action: 'createMany', ...body }),
      ).rejects.toMatchObject({ status: 400 })
      expect(mockCreateOpenInterviewSlots).not.toHaveBeenCalled()
    })

    it('refuses a caller who is not an interviewer', async () => {
      await expect(
        call(
          POST,
          { ...reviewer, role: 'student' },
          {
            action: 'createMany',
            dates: [DATE],
            meetingLink: LINK,
          },
        ),
      ).rejects.toMatchObject({ status: 403 })
    })
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

  it.each(['interviewer', 'interviewee'])(
    'marks a slot missed by the %s, for the caller to be checked against',
    async (missedBy) => {
      const res = await call(PATCH, reviewer, {
        action: 'markMissed',
        slotId: 'slot-1',
        missedBy,
      })

      expect(mockMarkInterviewSlotMissed).toHaveBeenCalledWith(
        reviewer,
        'slot-1',
        missedBy,
      )
      expect(mockUpdateInterviewSlot).not.toHaveBeenCalled()
      expect(await res.json()).toEqual({ message: 'Marked missed.' })
    },
  )

  it.each([
    ['no missedBy', { action: 'markMissed', slotId: 'slot-1' }],
    [
      'an unknown missedBy',
      { action: 'markMissed', slotId: 'slot-1', missedBy: 'both' },
    ],
    [
      'a path-like slot id',
      { action: 'markMissed', slotId: 'a/b', missedBy: 'interviewer' },
    ],
  ])('refuses marking missed with %s', async (_, body) => {
    await expect(call(PATCH, admin, body)).rejects.toMatchObject({
      status: 400,
    })
    expect(mockMarkInterviewSlotMissed).not.toHaveBeenCalled()
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

describe('/api/interviewSlot emails for a booked slot', () => {
  const booked = { id: 'slot-1', intervieweeId: 'applicant-uid' }
  const update = { slotId: 'slot-1', date: DATE, meetingLink: LINK }
  const markMissed = {
    action: 'markMissed',
    slotId: 'slot-1',
    missedBy: 'interviewer',
  }

  it.each([
    [
      'an edit',
      PATCH,
      update,
      mockUpdateInterviewSlot,
      mockSendInterviewRescheduledEmail,
      'Updated.',
    ],
    [
      'a missed mark',
      PATCH,
      markMissed,
      mockMarkInterviewSlotMissed,
      mockSendInterviewMissedEmail,
      'Marked missed.',
    ],
    [
      'a delete',
      DELETE,
      { slotId: 'slot-1' },
      mockDeleteInterviewSlot,
      mockSendInterviewCanceledEmail,
      'Deleted.',
    ],
  ])(
    'emails the applicant about %s, reporting whether it went out',
    async (_, handler, body, write, send, message) => {
      write.mockResolvedValue(booked)

      const res = await call(handler, reviewer, body)

      expect(send).toHaveBeenCalledWith(booked)
      expect(await res.json()).toEqual({ message, emailSent: true })

      send.mockResolvedValue(false)
      const failed = await call(handler, reviewer, body)
      expect(await failed.json()).toEqual({ message, emailSent: false })
    },
  )

  it.each([
    ['an edit', PATCH, update, 'Updated.'],
    ['a missed mark', PATCH, markMissed, 'Marked missed.'],
    ['a delete', DELETE, { slotId: 'slot-1' }, 'Deleted.'],
  ])(
    'emails nobody about %s that has no applicant to tell',
    async (_, handler, body, message) => {
      const res = await call(handler, reviewer, body)

      expect(await res.json()).toEqual({ message })
      expect(mockSendInterviewRescheduledEmail).not.toHaveBeenCalled()
      expect(mockSendInterviewMissedEmail).not.toHaveBeenCalled()
      expect(mockSendInterviewCanceledEmail).not.toHaveBeenCalled()
    },
  )
})

describe("DELETE /api/interviewSlot, action: 'deleteMany'", () => {
  it("deletes the caller's open slots among the ids", async () => {
    const counts = { deleted: 1, skippedBooked: 1, skippedNotOwn: 0 }
    mockDeleteOpenInterviewSlots.mockResolvedValue(counts)

    const res = await call(DELETE, reviewer, {
      action: 'deleteMany',
      slotIds: ['slot-1', 'slot-2'],
    })

    expect(mockDeleteOpenInterviewSlots).toHaveBeenCalledWith(reviewer, [
      'slot-1',
      'slot-2',
    ])
    expect(await res.json()).toEqual(counts)
    expect(mockDeleteInterviewSlot).not.toHaveBeenCalled()
    expect(mockSendInterviewCanceledEmail).not.toHaveBeenCalled()
  })

  it.each([
    ['no ids', []],
    ['a path-like id', ['a/b']],
  ])('refuses %s', async (_, slotIds) => {
    await expect(
      call(DELETE, reviewer, { action: 'deleteMany', slotIds }),
    ).rejects.toMatchObject({ status: 400 })
    expect(mockDeleteOpenInterviewSlots).not.toHaveBeenCalled()
  })
})
