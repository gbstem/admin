const docs: Record<string, any> = {}
const mockTransaction = {
  get: jest.fn(async (ref: { path: string }) => ({
    exists: ref.path in docs,
    data: () => docs[ref.path],
  })),
  set: jest.fn((ref: { path: string }, data: any) => {
    docs[ref.path] = data
  }),
  update: jest.fn((ref: { path: string }, data: any) => {
    const next = structuredClone(docs[ref.path])
    for (const [key, value] of Object.entries(data)) {
      const parts = key.split('.')
      let target = next
      for (const part of parts.slice(0, -1)) target = target[part]
      target[parts.at(-1)!] = value
    }
    docs[ref.path] = next
  }),
  delete: jest.fn((ref: { path: string }) => {
    delete docs[ref.path]
  }),
}
const mockAccountName = jest.fn()
const mockResolveAccountEmail = jest.fn()
const mockSendEmail = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    runTransaction: (fn: (t: typeof mockTransaction) => unknown) =>
      fn(mockTransaction),
  },
}))
jest.mock('$lib/server/userProfile', () => ({
  accountName: (...args: any[]) => mockAccountName(...args),
}))
jest.mock('$lib/server/accountEmail', () => ({
  resolveAccountEmail: (...args: any[]) => mockResolveAccountEmail(...args),
}))
jest.mock('$lib/server/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

import {
  applicationsCollection,
  currentSemester,
  interviewTimesCollection,
} from '$lib/data/collections'
import {
  createInterviewSlot,
  deleteInterviewSlot,
  sendInterviewAssignedEmail,
  updateInterviewSlot,
} from '$lib/server/interviewSlots'

const DATE = new Date('2026-10-05T18:00:00.000Z')
const LINK = 'https://mit.zoom.us/j/1'
const reviewer = { uid: 'rev-1', role: 'reviewer' as const }
const otherReviewer = { uid: 'rev-2', role: 'reviewer' as const }
const admin = { uid: 'admin-1', role: 'admin' as const }

const SLOT_ID = `${DATE.getTime()}rev-1`
const SLOT = `${interviewTimesCollection}/${SLOT_ID}`
const APP = `${applicationsCollection}/app-1`

const application = (meta: Record<string, unknown> = {}) => ({
  personal: { firstName: 'Ada', lastName: 'Lovelace' },
  meta: { uid: 'applicant-uid', submitted: true, interview: false, ...meta },
})

beforeEach(() => {
  jest.clearAllMocks()
  for (const key of Object.keys(docs)) delete docs[key]
  mockAccountName.mockResolvedValue('Jane Doe')
  mockResolveAccountEmail.mockImplementation(
    async (uid: string) => `${uid}@test.com`,
  )
  mockSendEmail.mockResolvedValue(undefined)
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('createInterviewSlot', () => {
  it("adds an open slot under the caller's uid and profile name", async () => {
    const slot = await createInterviewSlot(reviewer, {
      date: DATE,
      meetingLink: LINK,
    })

    expect(mockAccountName).toHaveBeenCalledWith('rev-1')
    expect(slot).toEqual({
      id: SLOT_ID,
      date: DATE,
      meetingLink: LINK,
      interviewerName: 'Jane Doe',
      interviewerUid: 'rev-1',
      intervieweeId: '',
      intervieweeFirstName: '',
      intervieweeLastName: '',
      interviewSlotStatus: 'available',
    })
    expect(docs[SLOT]).toEqual({ ...slot, semester: currentSemester })
  })

  it('refuses (400) a caller with no name on file', async () => {
    mockAccountName.mockResolvedValue('')

    await expect(
      createInterviewSlot(reviewer, { date: DATE, meetingLink: LINK }),
    ).rejects.toMatchObject({ status: 400 })
    expect(docs[SLOT]).toBeUndefined()
  })

  it("assigns the slot to the application's own applicant and flags the application", async () => {
    docs[APP] = application()

    const slot = await createInterviewSlot(
      { ...admin, uid: 'rev-1' },
      { date: DATE, meetingLink: LINK },
      'app-1',
    )

    expect(slot).toMatchObject({
      intervieweeId: 'applicant-uid',
      intervieweeFirstName: 'Ada',
      intervieweeLastName: 'Lovelace',
      interviewSlotStatus: 'pending',
    })
    expect(docs[APP].meta.interview).toBe(true)
  })

  it.each([
    ['is missing', undefined, 404],
    ['already has an interview', application({ interview: true }), 409],
    ['was never submitted', application({ submitted: false }), 409],
  ])(
    'refuses to assign when the application %s, writing nothing',
    async (_, stored, status) => {
      if (stored) docs[APP] = stored

      await expect(
        createInterviewSlot(admin, { date: DATE, meetingLink: LINK }, 'app-1'),
      ).rejects.toMatchObject({ status })
      expect(mockTransaction.set).not.toHaveBeenCalled()
      expect(mockTransaction.update).not.toHaveBeenCalled()
    },
  )

  // Same time, same interviewer, same id: replacing it would drop the booking
  // and leave the applicant flagged with no slot.
  it('refuses (409) to replace a slot that is already booked', async () => {
    docs[SLOT] = { intervieweeId: 'applicant-uid', interviewerUid: 'rev-1' }

    await expect(
      createInterviewSlot(reviewer, { date: DATE, meetingLink: LINK }),
    ).rejects.toMatchObject({ status: 409 })
    expect(docs[SLOT].intervieweeId).toBe('applicant-uid')
  })

  it('replaces an open slot at the same time', async () => {
    docs[SLOT] = { intervieweeId: '', interviewerUid: 'rev-1' }

    await createInterviewSlot(reviewer, {
      date: DATE,
      meetingLink: 'https://mit.zoom.us/j/2',
    })

    expect(docs[SLOT].meetingLink).toBe('https://mit.zoom.us/j/2')
  })
})

describe('updateInterviewSlot', () => {
  const NEW_DATE = new Date('2026-10-06T18:00:00.000Z')

  beforeEach(() => {
    docs[SLOT] = {
      interviewerUid: 'rev-1',
      intervieweeId: 'applicant-uid',
      date: DATE,
      meetingLink: LINK,
    }
  })

  it.each([
    ['its owner', reviewer],
    ['an admin', admin],
  ])(
    'lets %s change the date and link, keeping the booking',
    async (_, caller) => {
      await updateInterviewSlot(caller, SLOT_ID, {
        date: NEW_DATE,
        meetingLink: 'https://mit.zoom.us/j/2',
      })

      expect(mockTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ path: SLOT }),
        {
          date: NEW_DATE,
          meetingLink: 'https://mit.zoom.us/j/2',
          semester: currentSemester,
        },
      )
      expect(docs[SLOT].intervieweeId).toBe('applicant-uid')
    },
  )

  it("refuses (403) another reviewer's slot", async () => {
    await expect(
      updateInterviewSlot(otherReviewer, SLOT_ID, {
        date: NEW_DATE,
        meetingLink: LINK,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })

  it('refuses (404) a slot that is gone', async () => {
    await expect(
      updateInterviewSlot(admin, 'nope', { date: NEW_DATE, meetingLink: LINK }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('deleteInterviewSlot', () => {
  const BOOKED_APP = `${applicationsCollection}/applicant-uid`

  it("deletes a booked slot and clears its applicant's meta.interview together", async () => {
    docs[SLOT] = { interviewerUid: 'rev-1', intervieweeId: 'applicant-uid' }
    docs[BOOKED_APP] = application({ interview: true })

    await deleteInterviewSlot(reviewer, SLOT_ID)

    expect(docs[SLOT]).toBeUndefined()
    expect(docs[BOOKED_APP].meta.interview).toBe(false)
  })

  // Account deletion removes the application; the orphaned slot must still
  // be deletable.
  it('deletes a booked slot whose application is gone', async () => {
    docs[SLOT] = { interviewerUid: 'rev-1', intervieweeId: 'applicant-uid' }

    await deleteInterviewSlot(reviewer, SLOT_ID)

    expect(docs[SLOT]).toBeUndefined()
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })

  it('deletes an open slot without reading any application', async () => {
    docs[SLOT] = { interviewerUid: 'rev-1', intervieweeId: '' }

    await deleteInterviewSlot(admin, SLOT_ID)

    expect(docs[SLOT]).toBeUndefined()
    expect(mockTransaction.get).toHaveBeenCalledTimes(1)
  })

  it("refuses (403) another reviewer's slot, deleting nothing", async () => {
    docs[SLOT] = { interviewerUid: 'rev-1', intervieweeId: '' }

    await expect(
      deleteInterviewSlot(otherReviewer, SLOT_ID),
    ).rejects.toMatchObject({ status: 403 })
    expect(docs[SLOT]).toBeDefined()
  })

  it('succeeds for a slot that is already gone', async () => {
    await expect(deleteInterviewSlot(reviewer, 'nope')).resolves.toBeUndefined()
    expect(mockTransaction.delete).not.toHaveBeenCalled()
  })
})

describe('sendInterviewAssignedEmail', () => {
  const slot = {
    id: SLOT_ID,
    date: DATE,
    meetingLink: LINK,
    interviewerName: 'Jane Doe',
    interviewerUid: 'rev-1',
    intervieweeId: 'applicant-uid',
    intervieweeFirstName: 'Ada',
    intervieweeLastName: 'Lovelace',
    interviewSlotStatus: 'pending',
  }

  it('mails the applicant, copying the interviewer, with the time in gbSTEM time', async () => {
    await expect(sendInterviewAssignedEmail(slot)).resolves.toBe(true)

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'applicant-uid@test.com',
        cc: 'rev-1@test.com',
        replyTo: 'rev-1@test.com',
        subject: 'Ada, your interview with Jane Doe has been scheduled',
      }),
    )
    // 18:00 UTC on 5 October is 2 PM Eastern, whatever zone the server is in.
    const { html } = mockSendEmail.mock.calls[0][0]
    expect(html).toContain('October 5, 2026')
    expect(html).toContain('02:00 PM EDT')
    expect(html).toContain(LINK)
  })

  it('reports false rather than throwing when an address cannot be resolved', async () => {
    mockResolveAccountEmail.mockRejectedValue(new Error('gone'))

    await expect(sendInterviewAssignedEmail(slot)).resolves.toBe(false)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
