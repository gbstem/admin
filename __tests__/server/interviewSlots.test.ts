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

jest.mock('#lib/server/firebase.js', () => ({
  adminDb: {
    doc: (path: string) => ({ path, id: path.split('/').at(-1) }),
    runTransaction: (fn: (t: typeof mockTransaction) => unknown) =>
      fn(mockTransaction),
  },
}))
jest.mock('#lib/server/userProfile.js', () => ({
  accountName: (...args: any[]) => mockAccountName(...args),
}))
jest.mock('#lib/server/accountEmail.js', () => ({
  resolveAccountEmail: (...args: any[]) => mockResolveAccountEmail(...args),
}))
jest.mock('#lib/server/email.js', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

import {
  applicationsCollection,
  currentSemester,
  interviewTimesCollection,
} from '#lib/data/collections.js'
import {
  createInterviewSlot,
  deleteInterviewSlot,
  markInterviewSlotMissed,
  sendInterviewAssignedEmail,
  sendInterviewCanceledEmail,
  sendInterviewMissedEmail,
  sendInterviewRescheduledEmail,
  updateInterviewSlot,
} from '#lib/server/interviewSlots.js'

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
    ['is decided', application({ decisionType: 'rejected' }), 409],
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

  // `interview` invites the applicant to schedule; it decides nothing.
  it('assigns an applicant invited to interview', async () => {
    docs[APP] = application({ decided: true, decisionType: 'interview' })

    await createInterviewSlot(admin, { date: DATE, meetingLink: LINK }, 'app-1')

    expect(docs[APP].meta.interview).toBe(true)
  })

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

  it('resolves to the booked slot and its previous time when the time moves', async () => {
    const rescheduled = await updateInterviewSlot(reviewer, SLOT_ID, {
      date: NEW_DATE,
      meetingLink: LINK,
    })

    expect(rescheduled).toEqual({
      slot: expect.objectContaining({
        id: SLOT_ID,
        intervieweeId: 'applicant-uid',
        date: NEW_DATE,
        meetingLink: LINK,
      }),
      previousDate: DATE,
    })
  })

  it('resolves to the booked slot with no previous time when only the link changes', async () => {
    const rescheduled = await updateInterviewSlot(reviewer, SLOT_ID, {
      date: new Date(DATE),
      meetingLink: 'https://mit.zoom.us/j/2',
    })

    expect(rescheduled).toEqual({
      slot: expect.objectContaining({ meetingLink: 'https://mit.zoom.us/j/2' }),
    })
  })

  it.each([
    ['an edit that changes nothing', 'applicant-uid', DATE],
    ['an open slot', '', NEW_DATE],
  ])('resolves to null for %s', async (_, intervieweeId, date) => {
    docs[SLOT].intervieweeId = intervieweeId

    await expect(
      updateInterviewSlot(reviewer, SLOT_ID, { date, meetingLink: LINK }),
    ).resolves.toBeNull()
  })

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

  it('refuses (409) a missed slot, which stays as the record', async () => {
    docs[SLOT].interviewSlotStatus = 'missed'

    await expect(
      updateInterviewSlot(admin, SLOT_ID, {
        date: NEW_DATE,
        meetingLink: LINK,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })
})

describe('deleteInterviewSlot', () => {
  const BOOKED_APP = `${applicationsCollection}/applicant-uid`

  it("deletes a booked slot and clears its applicant's meta.interview together", async () => {
    docs[SLOT] = { interviewerUid: 'rev-1', intervieweeId: 'applicant-uid' }
    docs[BOOKED_APP] = application({ interview: true })

    const canceled = await deleteInterviewSlot(reviewer, SLOT_ID)

    expect(docs[SLOT]).toBeUndefined()
    expect(docs[BOOKED_APP].meta.interview).toBe(false)
    // For the applicant's cancellation email.
    expect(canceled).toMatchObject({
      id: SLOT_ID,
      intervieweeId: 'applicant-uid',
    })
  })

  // Account deletion removes the application; the orphaned slot must still
  // be deletable.
  it('deletes a booked slot whose application is gone', async () => {
    docs[SLOT] = { interviewerUid: 'rev-1', intervieweeId: 'applicant-uid' }

    await expect(deleteInterviewSlot(reviewer, SLOT_ID)).resolves.toBeNull()

    expect(docs[SLOT]).toBeUndefined()
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })

  // Marking it missed already cleared the flag, and the applicant may hold a
  // new booking by now.
  it("deletes a missed slot leaving its applicant's meta.interview alone", async () => {
    docs[SLOT] = {
      interviewerUid: 'rev-1',
      intervieweeId: 'applicant-uid',
      interviewSlotStatus: 'missed',
    }
    docs[BOOKED_APP] = application({ interview: true })

    // Its applicant was already emailed when it was marked missed.
    await expect(deleteInterviewSlot(reviewer, SLOT_ID)).resolves.toBeNull()

    expect(docs[SLOT]).toBeUndefined()
    expect(docs[BOOKED_APP].meta.interview).toBe(true)
  })

  it('deletes an open slot without reading any application', async () => {
    docs[SLOT] = { interviewerUid: 'rev-1', intervieweeId: '' }

    await expect(deleteInterviewSlot(admin, SLOT_ID)).resolves.toBeNull()

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
    await expect(deleteInterviewSlot(reviewer, 'nope')).resolves.toBeNull()
    expect(mockTransaction.delete).not.toHaveBeenCalled()
  })
})

describe('markInterviewSlotMissed', () => {
  const BOOKED_APP = `${applicationsCollection}/applicant-uid`
  const AFTER = new Date(DATE.getTime() + 60 * 60 * 1000)
  const booked = (overrides: Record<string, unknown> = {}) => ({
    interviewerUid: 'rev-1',
    intervieweeId: 'applicant-uid',
    interviewSlotStatus: 'pending',
    date: DATE,
    ...overrides,
  })

  it.each([
    ['its interviewer', reviewer, 'interviewer'],
    ['an admin', admin, 'interviewee'],
  ] as const)(
    'lets %s record who missed it, freeing the applicant in the same transaction',
    async (_, caller, missedBy) => {
      docs[SLOT] = booked()
      docs[BOOKED_APP] = application({ interview: true })

      const missed = await markInterviewSlotMissed(
        caller,
        SLOT_ID,
        missedBy,
        AFTER,
      )

      // For the applicant's email, which says who missed it.
      expect(missed).toMatchObject({
        id: SLOT_ID,
        intervieweeId: 'applicant-uid',
        date: DATE,
        missedBy,
      })
      // The booking stays on the slot as the record of what was missed.
      expect(docs[SLOT]).toMatchObject({
        intervieweeId: 'applicant-uid',
        interviewSlotStatus: 'missed',
        missedBy,
      })
      expect(docs[BOOKED_APP].meta.interview).toBe(false)
    },
  )

  it('marks the slot even when its application is gone', async () => {
    docs[SLOT] = booked()

    await expect(
      markInterviewSlotMissed(reviewer, SLOT_ID, 'interviewee', AFTER),
    ).resolves.toBeNull()

    expect(docs[SLOT].interviewSlotStatus).toBe('missed')
    expect(docs[BOOKED_APP]).toBeUndefined()
  })

  it.each([
    ['gone', undefined, 404],
    [
      'open',
      booked({ intervieweeId: '', interviewSlotStatus: 'available' }),
      409,
    ],
    ['already missed', booked({ interviewSlotStatus: 'missed' }), 409],
    ['still to come', booked({ date: new Date(AFTER.getTime() + 1) }), 409],
  ])('refuses a slot that is %s, writing nothing', async (_, slot, status) => {
    if (slot) docs[SLOT] = slot
    docs[BOOKED_APP] = application({ interview: true })

    await expect(
      markInterviewSlotMissed(admin, SLOT_ID, 'interviewee', AFTER),
    ).rejects.toMatchObject({ status })
    expect(mockTransaction.update).not.toHaveBeenCalled()
  })

  it("refuses (403) another reviewer's slot", async () => {
    docs[SLOT] = booked()

    await expect(
      markInterviewSlotMissed(otherReviewer, SLOT_ID, 'interviewer', AFTER),
    ).rejects.toMatchObject({ status: 403 })
    expect(mockTransaction.update).not.toHaveBeenCalled()
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
    interviewSlotStatus: 'pending' as const,
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

describe('the booked-slot change emails', () => {
  const NEW_DATE = new Date('2026-10-06T18:00:00.000Z')
  const slot = {
    id: SLOT_ID,
    date: NEW_DATE,
    meetingLink: LINK,
    interviewerName: 'Jane Doe',
    interviewerUid: 'rev-1',
    intervieweeId: 'applicant-uid',
    intervieweeFirstName: 'Ada',
    intervieweeLastName: 'Lovelace',
    interviewSlotStatus: 'pending' as const,
  }
  const sent = () => mockSendEmail.mock.calls[0][0]
  // The sentences as a reader sees them: MJML wraps lines mid-sentence.
  const text = () =>
    sent()
      .html.replace(/\s+/g, ' ')
      .replace(/&#x27;/g, "'")

  it('mails a moved time with both times in gbSTEM time, copying the interviewer', async () => {
    await expect(
      sendInterviewRescheduledEmail({ slot, previousDate: DATE }),
    ).resolves.toBe(true)

    expect(sent()).toMatchObject({
      to: 'applicant-uid@test.com',
      cc: 'rev-1@test.com',
      replyTo: 'rev-1@test.com',
      subject: 'Ada, your interview with Jane Doe has been rescheduled',
    })
    expect(text()).toMatch(
      /moved from Monday, October 5, 2026 at 02:00 PM EDT to Tuesday, October 6, 2026/,
    )
    expect(sent().html).toContain(LINK)
  })

  it('mails a new link alone as an update', async () => {
    await sendInterviewRescheduledEmail({ slot })

    expect(sent().subject).toBe(
      'Ada, your interview with Jane Doe has been updated',
    )
    expect(text()).toContain('has a new meeting link')
    expect(text()).not.toContain('moved from')
  })

  it('mails a cancellation, sending the applicant back to book', async () => {
    await expect(sendInterviewCanceledEmail(slot)).resolves.toBe(true)

    expect(sent()).toMatchObject({
      to: 'applicant-uid@test.com',
      cc: 'rev-1@test.com',
      subject: 'Ada, your interview with Jane Doe has been canceled',
    })
    expect(text()).toContain('has been canceled')
    expect(text()).toContain('book a new interview time')
    expect(text()).toContain('https://portal.gbstem.org/interview')
  })

  it.each([
    ['interviewer', ['Your interviewer', "We're sorry"], ["We didn't see you"]],
    ['interviewee', ["We didn't see you"], ['Your interviewer', "We're sorry"]],
  ] as const)(
    'mails an interview missed by the %s, saying so',
    async (missedBy, says, doesNotSay) => {
      await expect(
        sendInterviewMissedEmail({
          ...slot,
          interviewSlotStatus: 'missed',
          missedBy,
        }),
      ).resolves.toBe(true)

      expect(sent().subject).toBe(
        'Ada, your interview with Jane Doe was missed',
      )
      for (const sentence of says) expect(text()).toContain(sentence)
      for (const sentence of doesNotSay) expect(text()).not.toContain(sentence)
      expect(text()).toContain('book a new interview time')
    },
  )

  it('reports false rather than throwing when the send fails', async () => {
    mockSendEmail.mockRejectedValue(new Error('SendGrid down'))

    await expect(sendInterviewCanceledEmail(slot)).resolves.toBe(false)
  })
})
