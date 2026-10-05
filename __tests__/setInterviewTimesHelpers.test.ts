process.env.TZ = 'America/New_York'
import type {} from '../src/data.d.ts'
import {
  parseInterviewSlotDoc,
  parseSlotRequestDoc,
  sortSlotRequestsByDate,
  filterEligibleInterviewees,
  canMarkSlotMissed,
  canUserModifySlot,
  groupSlotRequests,
  interviewIneligibility,
  isFinalDecision,
  needsInterview,
  type EligibleInterviewee,
} from '$lib/helpers/setInterviewTimes'

describe('SetInterviewTimes Helpers', () => {
  describe('parseInterviewSlotDoc', () => {
    test('returns null when input is null or missing date', () => {
      expect(parseInterviewSlotDoc('slot-1', null)).toBeNull()
      expect(parseInterviewSlotDoc('slot-1', {})).toBeNull()
    })

    test('parses raw doc into Data.InterviewSlot with ISO string date', () => {
      const testDate = new Date(2026, 4, 28, 14, 30)
      const rawData = {
        date: { seconds: Math.floor(testDate.getTime() / 1000) },
        interviewerName: 'Jane Doe',
        interviewerEmail: 'jane@example.com',
      }

      const slot = parseInterviewSlotDoc('slot-100', rawData)
      expect(slot?.id).toBe('slot-100')
      expect(slot?.interviewerName).toBe('Jane Doe')
      expect(slot?.date).toContain('2026-05-28')
    })
  })

  describe('parseSlotRequestDoc & sortSlotRequestsByDate', () => {
    test('leaves the uid empty on a request with no uid field', () => {
      const raw = {
        date: { seconds: 1779900600 },
        firstName: 'Alice',
        lastName: 'Smith',
      }

      const req = parseSlotRequestDoc('uid123-2026-05-28', raw)
      expect(req?.id).toBe('uid123-2026-05-28')
      expect(req?.uid).toBe('')
      expect(req?.firstName).toBe('Alice')
    })

    test('uses explicit data.uid when present in raw doc', () => {
      const raw = {
        uid: 'explicit-uid-456',
        date: { seconds: 1779900600 },
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@example.com',
      }

      const req = parseSlotRequestDoc('fallback-id-2026-05-28', raw)
      expect(req?.uid).toBe('explicit-uid-456')
      expect(req?.firstName).toBe('Bob')
    })

    test('sorts requests chronologically by date', () => {
      const req1 = { date: new Date('2026-05-20') } as Data.SlotRequest
      const req2 = { date: new Date('2026-05-10') } as Data.SlotRequest

      const sorted = sortSlotRequestsByDate([req1, req2])
      expect(sorted[0].date.getTime()).toBeLessThan(sorted[1].date.getTime())
    })
  })

  describe('isFinalDecision', () => {
    test.each([
      ['accepted', true],
      ['substitute', true],
      ['waitlisted', true],
      ['rejected', true],
      // An invitation to interview, not a decision on the applicant.
      ['interview', false],
      [null, false],
      [undefined, false],
    ] as const)('%s -> %s', (decision, expected) => {
      expect(isFinalDecision(decision)).toBe(expected)
    })
  })

  describe('interviewIneligibility / needsInterview', () => {
    const meta = (overrides: Record<string, unknown> = {}) => ({
      submitted: true,
      interview: false,
      decided: false,
      ...overrides,
    })

    test.each([
      ['a submitted, unscheduled, undecided applicant', meta(), null],
      [
        'one invited to interview',
        meta({ decided: true, decisionType: 'interview' }),
        null,
      ],
      // Notes or a likely decision set `decided` without deciding anything.
      ['one with only notes', meta({ decided: true }), null],
      ['no application', undefined, 'unsubmitted'],
      ['an unsubmitted one', meta({ submitted: false }), 'unsubmitted'],
      ['a scheduled one', meta({ interview: true }), 'scheduled'],
      ['a decided one', meta({ decisionType: 'rejected' }), 'decided'],
    ] as const)('%s -> %s', (_, value, expected) => {
      expect(interviewIneligibility(value as any)).toBe(expected)
      expect(needsInterview(value as any)).toBe(expected === null)
    })
  })

  describe('filterEligibleInterviewees', () => {
    const snap = (id: string, data: any) => ({ id, data: () => data })

    test('keeps only applicants who need an interview, sorted by name', () => {
      const docs = [
        snap('doc-1', {
          meta: { uid: 'doc-1', interview: false, submitted: true },
          personal: { firstName: 'Zed', lastName: 'Zimmerman' },
        }),
        snap('doc-2', {
          meta: { uid: 'doc-2', interview: true, submitted: true },
          personal: { firstName: 'Bob', lastName: 'Smith' },
        }),
        snap('doc-3', {
          meta: { uid: 'doc-3', interview: false, submitted: false },
          personal: { firstName: 'Charlie', lastName: 'Brown' },
        }),
        snap('doc-4', {
          meta: {
            uid: 'doc-4',
            interview: false,
            submitted: true,
            decisionType: 'accepted',
          },
          personal: { firstName: 'Dana', lastName: 'Decided' },
        }),
        snap('doc-5', {
          meta: { uid: '', interview: false, submitted: true },
          personal: { firstName: 'Alice', lastName: 'Adams' },
        }),
      ]

      expect(filterEligibleInterviewees(docs)).toEqual([
        // No uid on the application: its id is the applicant's.
        {
          applicationId: 'doc-5',
          uid: 'doc-5',
          firstName: 'Alice',
          lastName: 'Adams',
        },
        {
          applicationId: 'doc-1',
          uid: 'doc-1',
          firstName: 'Zed',
          lastName: 'Zimmerman',
        },
      ])
    })
  })

  describe('groupSlotRequests', () => {
    const NOW = new Date('2026-10-04T12:00:00.000Z')
    const DAY = 24 * 60 * 60 * 1000
    const ada: EligibleInterviewee = {
      applicationId: 'ada',
      uid: 'ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
    }
    const grace: EligibleInterviewee = {
      applicationId: 'grace',
      uid: 'grace',
      firstName: 'Grace',
      lastName: 'Hopper',
    }
    const request = (uid: string, offsetDays: number): Data.SlotRequest => ({
      id: `${uid}-${offsetDays}`,
      uid,
      date: new Date(NOW.getTime() + offsetDays * DAY),
      firstName: '',
      lastName: '',
    })

    test("groups each eligible applicant's requests, soonest group first", () => {
      const groups = groupSlotRequests(
        [
          request('ada', 3),
          request('grace', 1),
          request('ada', 2),
          request('grace', 5),
        ],
        [ada, grace],
        NOW,
      )

      expect(groups.map((g) => g.interviewee.uid)).toEqual(['grace', 'ada'])
      expect(groups[1].requests.map((r) => r.id)).toEqual(['ada-2', 'ada-3'])
    })

    // Scheduled or decided applicants aren't among the eligible, so their
    // requests drop out - and come back once they're eligible again.
    test("leaves out the requests of applicants who don't need an interview", () => {
      const requests = [request('ada', 1), request('grace', 1)]

      expect(
        groupSlotRequests(requests, [grace], NOW).map((g) => g.interviewee),
      ).toEqual([grace])
      expect(groupSlotRequests(requests, [ada, grace], NOW)).toHaveLength(2)
    })

    test('keeps requests up to 30 days past, and no older', () => {
      const groups = groupSlotRequests(
        [request('ada', -29), request('ada', -31)],
        [ada],
        NOW,
      )

      expect(groups[0].requests.map((r) => r.id)).toEqual(['ada--29'])
    })
  })

  describe('canMarkSlotMissed', () => {
    const NOW = new Date('2026-10-04T12:00:00.000Z')
    const slot = (overrides: Partial<Data.InterviewSlot> = {}) => ({
      date: '2026-10-04T11:00:00.000Z',
      interviewSlotStatus: 'pending' as const,
      intervieweeId: 'ada',
      ...overrides,
    })

    test('allows a booked slot whose time has come', () => {
      expect(canMarkSlotMissed(slot(), NOW)).toBe(true)
    })

    test.each([
      ['a future slot', slot({ date: '2026-10-05T11:00:00.000Z' })],
      ['an open slot', slot({ interviewSlotStatus: 'available' })],
      ['one already missed', slot({ interviewSlotStatus: 'missed' })],
      ['one naming nobody', slot({ intervieweeId: '' })],
    ])('refuses %s', (_, value) => {
      expect(canMarkSlotMissed(value, NOW)).toBe(false)
    })
  })

  describe('canUserModifySlot', () => {
    // The production bug this guards against: the owner changed their
    // account's email after creating the slot. Ownership is the uid stamped
    // at creation, so the change is irrelevant - and no address is stored to
    // go stale in the first place.
    test('lets the slot owner and any admin modify it, by uid', () => {
      const slot = { interviewerUid: 'uid-owner' }
      expect(canUserModifySlot(slot, 'uid-owner', 'reviewer')).toBe(true)
      expect(canUserModifySlot(slot, 'uid-other', 'admin')).toBe(true)
      expect(canUserModifySlot(slot, 'uid-other', 'reviewer')).toBe(false)
    })

    // A slot written before `interviewerUid` existed names nobody this can
    // identify, so only an admin can touch it. It must not fall open to
    // whoever happens to be signed in.
    test("treats a slot with no uid as nobody's", () => {
      const slot = { interviewerUid: '' }
      expect(canUserModifySlot(slot, 'uid-owner', 'reviewer')).toBe(false)
      expect(canUserModifySlot(slot, undefined, 'reviewer')).toBe(false)
      expect(canUserModifySlot(slot, 'uid-owner', 'admin')).toBe(true)
    })
  })
})
