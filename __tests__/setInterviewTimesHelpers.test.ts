process.env.TZ = 'America/New_York'
import type {} from '../src/data.d.ts'
import {
  parseAvailabilityDoc,
  parseInterviewSlotDoc,
  filterEligibleInterviewees,
  canMarkSlotMissed,
  canUserModifySlot,
  listCandidateAvailability,
  interviewIneligibility,
  isFinalDecision,
  needsInterview,
  type EligibleInterviewee,
} from '#lib/helpers/setInterviewTimes.js'

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

  describe('parseAvailabilityDoc', () => {
    test('returns null for a document with no times', () => {
      expect(parseAvailabilityDoc('uid-1', null)).toBeNull()
      expect(parseAvailabilityDoc('uid-1', { updated: new Date() })).toBeNull()
    })

    test('reads stored timestamps as Dates, soonest first, keyed by its id', () => {
      const availability = parseAvailabilityDoc('uid-1', {
        times: [{ seconds: 1790000000 }, new Date(1780000000 * 1000)],
        updated: { seconds: 1779000000 },
      })

      expect(availability).toEqual({
        uid: 'uid-1',
        times: [new Date(1780000000 * 1000), new Date(1790000000 * 1000)],
        updated: new Date(1779000000 * 1000),
      })
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

  describe('listCandidateAvailability', () => {
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
    const at = (offsetDays: number) =>
      new Date(NOW.getTime() + offsetDays * DAY)
    const availability = (
      uid: string,
      ...offsets: number[]
    ): Data.InterviewAvailability => ({
      uid,
      times: offsets.map(at),
      updated: NOW,
    })

    test("lists each eligible candidate's times to come, soonest candidate first", () => {
      const list = listCandidateAvailability(
        [availability('ada', -1, 2, 3), availability('grace', 1, 5)],
        [ada, grace],
        NOW,
      )

      expect(list.map((c) => c.interviewee.uid)).toEqual(['grace', 'ada'])
      expect(list[1].times).toEqual([at(2), at(3)])
    })

    // Scheduled or decided candidates aren't among the eligible, so their
    // availability drops out - and comes back once they're eligible again.
    test("leaves out candidates who don't need an interview", () => {
      const all = [availability('ada', 1), availability('grace', 1)]

      expect(
        listCandidateAvailability(all, [grace], NOW).map((c) => c.interviewee),
      ).toEqual([grace])
      expect(listCandidateAvailability(all, [ada, grace], NOW)).toHaveLength(2)
    })

    test('leaves out a candidate whose times have all passed', () => {
      expect(
        listCandidateAvailability([availability('ada', -2, -1)], [ada], NOW),
      ).toEqual([])
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
