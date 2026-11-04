import {
  cellInstant,
  cellsInWeek,
  formatMinute,
  gridPosition,
  isOpenCell,
  parseCellKey,
  type CellInfo,
  type CellKey,
  type GridWindow,
} from '#lib/shared/availabilityGrid.js'
import { INTERVIEW_DURATION_MINUTES } from '#lib/shared/interviews.js'
import type {
  CreateManySlotsResponse,
  DeleteManySlotsResponse,
} from '../../routes/api/interviewSlot/+server'
import { isOwnInterviewSlot } from './setInterviewTimes'
import type {} from '../../data.d.ts'

// The availability grid as admin draws it over interview slots: what the
// interviewer's own slots look like on a week, what un-painting would delete,
// and how a candidate's painted times read against the interviewer's
// calendar. The grid itself is #lib/shared/AvailabilityGrid.svelte.

const DURATION_MS = INTERVIEW_DURATION_MINUTES * 60_000

/** A slot with its `date` as a Date: slots are listed as local ISO strings. */
type DatedSlot = Omit<Data.InterviewSlot, 'date'> & { date: Date }

const dated = (slots: Data.InterviewSlot[]): DatedSlot[] =>
  slots.map((slot) => ({ ...slot, date: new Date(slot.date) }))

const fullName = (
  slot: Pick<
    Data.InterviewSlot,
    'intervieweeFirstName' | 'intervieweeLastName'
  >,
) => `${slot.intervieweeFirstName} ${slot.intervieweeLastName}`.trim()

/** Whether an applicant holds `slot`: booked, and not marked missed. */
const isBookedSlot = (
  slot: Pick<Data.InterviewSlot, 'intervieweeId' | 'interviewSlotStatus'>,
) => Boolean(slot.intervieweeId) && slot.interviewSlotStatus !== 'missed'

/** One week of an interviewer's own slots, as their grid paints it. */
export interface OwnSlotWeek {
  /** Open slots on a row boundary: what starts out painted. */
  painted: Set<CellKey>
  /** The open slot behind each painted cell, for un-painting to delete. */
  openSlotIds: Map<CellKey, string>
  /** Everything else, locked: booked, missed, or open off a boundary. */
  cells: Record<CellKey, CellInfo>
}

/**
 * The signed-in interviewer's slots in the week starting `week`. A booked
 * cell shows its candidate and is locked, so un-painting can never cancel an
 * interview; withdrawing one stays a deliberate delete in the slot list. A
 * missed one is a record and is locked too, as is an open slot that starts
 * between rows (4:05, from the one-slot form), which the grid can't say
 * exactly.
 */
export function ownSlotWeek(
  slots: Data.InterviewSlot[],
  uid: string | null | undefined,
  week: Date,
): OwnSlotWeek {
  const own = dated(slots.filter((slot) => isOwnInterviewSlot(slot, uid)))
  const result: OwnSlotWeek = {
    painted: new Set(),
    openSlotIds: new Map(),
    cells: {},
  }
  for (const [key, inCell] of cellsInWeek(
    own,
    week,
    INTERVIEW_DURATION_MINUTES,
  )) {
    const booked = inCell.find(isBookedSlot)
    if (booked) {
      result.cells[key] = {
        tone: 'booked',
        label: booked.intervieweeFirstName || 'Booked',
        title: `Booked by ${fullName(booked) || 'a candidate'}; delete it from the slot list to cancel`,
        locked: true,
      }
      continue
    }
    const open = inCell.find(
      (slot) =>
        slot.interviewSlotStatus === 'available' &&
        gridPosition(slot.date, INTERVIEW_DURATION_MINUTES).aligned,
    )
    if (open) {
      result.painted.add(key)
      result.openSlotIds.set(key, open.id)
      continue
    }
    const other = inCell[0]
    result.cells[key] = {
      tone: 'mine',
      label:
        other.interviewSlotStatus === 'missed'
          ? 'Missed'
          : formatMinute(other.date.getHours() * 60 + other.date.getMinutes()),
      title:
        other.interviewSlotStatus === 'missed'
          ? `Missed interview with ${fullName(other) || 'a candidate'}`
          : 'An open slot between rows; edit it in the slot list',
      locked: true,
    }
  }
  return result
}

/** What saving a week's grid would change. */
export interface WeekChanges {
  /** Newly painted times still to come and inside the window. */
  add: Date[]
  /** The open slots un-painted. */
  remove: string[]
}

/** The difference between `before` and the cells now `painted`. */
export function weekChanges(
  week: Date,
  before: OwnSlotWeek,
  painted: Set<CellKey>,
  window: GridWindow,
  now: Date,
): WeekChanges {
  const add = [...painted]
    .filter((key) => !before.painted.has(key))
    .filter((key) => isOpenCell(week, key, window, now))
    .map((key) => cellInstant(week, key))
    .sort((a, b) => a.getTime() - b.getTime())
  const remove = [...before.painted]
    .filter((key) => !painted.has(key))
    .map((key) => before.openSlotIds.get(key)!)
  return { add, remove }
}

/** A time the interviewer can pick from a candidate's availability. */
export interface PickTarget {
  date: Date
  /** The interviewer's open slot at exactly that time, to assign. */
  slot?: Pick<Data.InterviewSlot, 'id' | 'meetingLink'>
}

/** A candidate's week, as an interviewer picks from it. */
export interface CandidateWeek {
  cells: Record<CellKey, CellInfo>
  targets: Map<CellKey, PickTarget>
}

/**
 * The candidate's painted `times` in the week starting `week`, read against
 * the signed-in interviewer's own slots: where they have an open slot (one
 * click assigns it), where they're free (one click creates a slot assigned
 * to the candidate), and where they're booked (shown, not pickable). Their
 * other slots that week are shown for context.
 */
export function candidateWeek(
  times: Date[],
  slots: Data.InterviewSlot[],
  uid: string | null | undefined,
  week: Date,
): CandidateWeek {
  const own = dated(
    slots.filter(
      (slot) =>
        isOwnInterviewSlot(slot, uid) && slot.interviewSlotStatus !== 'missed',
    ),
  )
  const result: CandidateWeek = { cells: {}, targets: new Map() }
  for (const [key, inCell] of cellsInWeek(
    own,
    week,
    INTERVIEW_DURATION_MINUTES,
  )) {
    result.cells[key] = {
      tone: 'mine',
      title: inCell.some(isBookedSlot) ? 'You are booked' : 'Your open slot',
    }
  }
  const offered = cellsInWeek(
    times.map((date) => ({ date })),
    week,
    INTERVIEW_DURATION_MINUTES,
  )
  for (const [key, [{ date }]] of offered) {
    const overlapping = own.filter(
      (slot) => Math.abs(slot.date.getTime() - date.getTime()) < DURATION_MS,
    )
    const booked = overlapping.find(isBookedSlot)
    const exact = overlapping.find(
      (slot) =>
        slot.date.getTime() === date.getTime() &&
        slot.interviewSlotStatus === 'available',
    )
    if (booked) {
      result.cells[key] = {
        tone: 'booked',
        label: 'Booked',
        title: `You are booked here, with ${fullName(booked) || 'a candidate'}`,
      }
    } else if (exact) {
      result.cells[key] = {
        tone: 'open',
        label: 'Open',
        title: 'You have an open slot here: assign it',
        pickable: true,
      }
      result.targets.set(key, { date, slot: exact })
    } else if (overlapping.length) {
      result.cells[key] = {
        tone: 'mine',
        title: 'Your open slot overlaps this time',
      }
    } else {
      result.cells[key] = {
        tone: 'available',
        title: 'You are free here: create a slot for them',
        pickable: true,
      }
      result.targets.set(key, { date })
    }
  }
  return result
}

/** The link on the interviewer's most recent slot, to offer again. */
export function lastMeetingLink(
  slots: Data.InterviewSlot[],
  uid: string | null | undefined,
): string {
  const own = dated(
    slots.filter(
      (slot) => isOwnInterviewSlot(slot, uid) && Boolean(slot.meetingLink),
    ),
  ).sort((a, b) => b.date.getTime() - a.date.getTime())
  return own[0]?.meetingLink ?? ''
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** The interviewer's toast after a grid save. */
export function describeSave(
  created: CreateManySlotsResponse | null,
  deleted: DeleteManySlotsResponse | null,
): string {
  const parts: string[] = []
  if (created) {
    parts.push(`${plural(created.created, 'slot')} created`)
    if (created.replaced) {
      parts.push(`${plural(created.replaced, 'open slot')} given the new link`)
    }
    if (created.skippedBooked) {
      parts.push(`${plural(created.skippedBooked, 'booked time')} left alone`)
    }
    if (created.skippedOverlap) {
      parts.push(
        `${plural(created.skippedOverlap, 'time')} skipped for overlapping another of your slots`,
      )
    }
    if (created.skippedOutside) {
      parts.push(
        `${plural(created.skippedOutside, 'time')} skipped as past or outside the interview window`,
      )
    }
  }
  if (deleted) {
    parts.push(`${plural(deleted.deleted, 'open slot')} deleted`)
    if (deleted.skippedBooked) {
      parts.push(
        `${plural(deleted.skippedBooked, 'slot')} kept because someone booked it`,
      )
    }
  }
  const sentence = parts.join(', ')
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}

/** "Mon Sep 7, 3:30 PM": a cell's time in a confirmation. */
export function describeCellTime(week: Date, key: CellKey): string {
  const { day, minute } = parseCellKey(key)
  const date = new Date(
    week.getFullYear(),
    week.getMonth(),
    week.getDate() + day,
  )
  const dayLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  return `${dayLabel}, ${formatMinute(minute)}`
}
