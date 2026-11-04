import type {} from '../src/data.d.ts'
import {
  candidateWeek,
  describeCellTime,
  describeSave,
  lastMeetingLink,
  ownSlotWeek,
  weekChanges,
} from '#lib/helpers/availabilityGrid.js'
import { toLocalISOString } from '#lib/utils.js'

// Run in New York time (package.json's `test` sets TZ).
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min)
const WEEK = local(2026, 10, 4)
const ME = 'rev-1'

const slot = (
  date: Date,
  overrides: Partial<Data.InterviewSlot> = {},
): Data.InterviewSlot => ({
  id: `${date.getTime()}${overrides.interviewerUid ?? ME}`,
  date: toLocalISOString(date),
  meetingLink: 'https://zoom.us/j/1',
  interviewerName: 'Rita Reviewer',
  interviewerUid: ME,
  intervieweeId: '',
  intervieweeFirstName: '',
  intervieweeLastName: '',
  interviewSlotStatus: 'available',
  ...overrides,
})

const booked = (date: Date, overrides: Partial<Data.InterviewSlot> = {}) =>
  slot(date, {
    intervieweeId: 'ada',
    intervieweeFirstName: 'Ada',
    intervieweeLastName: 'Lovelace',
    interviewSlotStatus: 'pending',
    ...overrides,
  })

describe('ownSlotWeek', () => {
  it("paints the interviewer's open slots on row boundaries", () => {
    const open = slot(local(2026, 10, 6, 15, 30))
    const week = ownSlotWeek([open], ME, WEEK)

    expect([...week.painted]).toEqual(['2:930'])
    expect(week.openSlotIds.get('2:930')).toBe(open.id)
    expect(week.cells).toEqual({})
  })

  it('locks a booked cell, naming its candidate', () => {
    const week = ownSlotWeek([booked(local(2026, 10, 6, 15, 30))], ME, WEEK)

    expect(week.painted.size).toBe(0)
    expect(week.cells['2:930']).toMatchObject({
      tone: 'booked',
      label: 'Ada',
      locked: true,
    })
    expect(week.cells['2:930'].title).toContain('Ada Lovelace')
  })

  it('locks a missed slot and an open one between rows', () => {
    const week = ownSlotWeek(
      [
        booked(local(2026, 10, 6, 15, 30), { interviewSlotStatus: 'missed' }),
        slot(local(2026, 10, 6, 16, 5)),
      ],
      ME,
      WEEK,
    )

    expect(week.painted.size).toBe(0)
    expect(week.cells['2:930']).toMatchObject({ label: 'Missed', locked: true })
    expect(week.cells['2:960']).toMatchObject({
      label: '4:05 PM',
      locked: true,
    })
  })

  it("leaves out other interviewers' slots and other weeks'", () => {
    const week = ownSlotWeek(
      [
        slot(local(2026, 10, 6, 15, 30), { interviewerUid: 'rev-2' }),
        slot(local(2026, 10, 13, 15, 30)),
      ],
      ME,
      WEEK,
    )

    expect(week.painted.size).toBe(0)
    expect(week.cells).toEqual({})
  })
})

describe('weekChanges', () => {
  const window = { opens: local(2026, 10, 1), closes: local(2026, 11, 1) }
  const now = local(2026, 10, 5, 12)

  it('adds newly painted times and removes un-painted open slots', () => {
    const open = slot(local(2026, 10, 6, 15, 30))
    const before = ownSlotWeek([open], ME, WEEK)

    expect(
      weekChanges(WEEK, before, new Set(['3:600', '3:615']), window, now),
    ).toEqual({
      add: [local(2026, 10, 7, 10), local(2026, 10, 7, 10, 15)],
      remove: [open.id],
    })
  })

  it('adds nothing already past or outside the window', () => {
    const before = ownSlotWeek([], ME, WEEK)

    expect(
      weekChanges(WEEK, before, new Set(['1:600', '6:600']), window, now),
    ).toEqual({ add: [local(2026, 10, 10, 10)], remove: [] })
    expect(
      weekChanges(WEEK, before, new Set(['1:600']), window, now).add,
    ).toEqual([])
  })
})

describe('candidateWeek', () => {
  const at = local(2026, 10, 6, 15, 30)

  it('offers a time where the interviewer is free, to create a slot', () => {
    const view = candidateWeek([at], [], ME, WEEK)

    expect(view.cells['2:930']).toMatchObject({
      tone: 'available',
      pickable: true,
    })
    expect(view.targets.get('2:930')).toEqual({ date: at })
  })

  it("offers the interviewer's open slot there, to assign", () => {
    const open = slot(at)
    const view = candidateWeek([at], [open], ME, WEEK)

    expect(view.cells['2:930']).toMatchObject({
      tone: 'open',
      label: 'Open',
      pickable: true,
    })
    expect(view.targets.get('2:930')?.slot?.id).toBe(open.id)
  })

  it('shows where the interviewer is booked, or overlapping, and offers neither', () => {
    const view = candidateWeek(
      [at, local(2026, 10, 6, 16)],
      [booked(local(2026, 10, 6, 15, 40)), slot(local(2026, 10, 6, 16, 5))],
      ME,
      WEEK,
    )

    expect(view.cells['2:930']).toMatchObject({ tone: 'booked' })
    expect(view.cells['2:930'].pickable).toBeUndefined()
    expect(view.cells['2:960']).toMatchObject({ tone: 'mine' })
    expect(view.targets.size).toBe(0)
  })

  it("ignores other interviewers' slots and the interviewer's missed ones", () => {
    const view = candidateWeek(
      [at],
      [
        booked(at, { interviewerUid: 'rev-2' }),
        booked(at, { interviewSlotStatus: 'missed' }),
      ],
      ME,
      WEEK,
    )

    expect(view.cells['2:930']).toMatchObject({ tone: 'available' })
  })

  it("shows the interviewer's other slots that week for context", () => {
    const view = candidateWeek([at], [slot(local(2026, 10, 8, 10))], ME, WEEK)

    expect(view.cells['4:600']).toMatchObject({ tone: 'mine' })
    expect(view.targets.has('4:600')).toBe(false)
  })
})

describe('lastMeetingLink', () => {
  it("is the interviewer's most recent slot's link", () => {
    expect(
      lastMeetingLink(
        [
          slot(local(2026, 10, 6), { meetingLink: 'https://zoom.us/j/old' }),
          slot(local(2026, 10, 8), { meetingLink: 'https://zoom.us/j/new' }),
          slot(local(2026, 10, 9), {
            interviewerUid: 'rev-2',
            meetingLink: 'https://zoom.us/j/theirs',
          }),
        ],
        ME,
      ),
    ).toBe('https://zoom.us/j/new')
  })

  it('is empty for an interviewer with no slots', () => {
    expect(lastMeetingLink([], ME)).toBe('')
  })
})

describe('describeSave', () => {
  it('reports what was created and what was skipped', () => {
    expect(
      describeSave(
        {
          created: 12,
          replaced: 1,
          skippedBooked: 2,
          skippedOverlap: 0,
          skippedOutside: 1,
        },
        null,
      ),
    ).toBe(
      '12 slots created, 1 open slot given the new link, 2 booked times left alone, 1 time skipped as past or outside the interview window.',
    )
  })

  it('reports deletions, and booked slots kept', () => {
    expect(
      describeSave(null, { deleted: 1, skippedBooked: 1, skippedNotOwn: 0 }),
    ).toBe('1 open slot deleted, 1 slot kept because someone booked it.')
  })
})

describe('describeCellTime', () => {
  it("names a cell's day and time", () => {
    expect(describeCellTime(WEEK, '2:930')).toBe('Tue, Oct 6, 3:30 PM')
  })
})
