// availabilityGrid.ts - The week grid both sides of interview scheduling paint
// and pick on: interviewers paint the times they offer (admin), candidates
// pick one or paint their own (portal). Kept byte-identical in admin and
// portal, and free of `#lib` imports, like the rest of `src/lib/shared/`, as
// is AvailabilityGrid.svelte, which draws it.
//
// A grid is days across and rows of one interview's length down, in the
// viewer's own time zone. A painted cell is only a pattern: nothing stores
// one. `expandGrid` turns cells into instants, which is all either side
// saves - admin as one slot per instant, portal as a candidate's list of
// times. See INTERVIEW_SCHEDULING_PLAN.md in admin, sections 4.1 and 4.8.

/** A cell: `${day}:${minute}`, see `cellKey`. */
export type CellKey = string

/** A column: 0 is Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6]

const MINUTES_PER_DAY = 24 * 60

/** The cell `minute` minutes past local midnight on weekday `day`. */
export function cellKey(day: number, minute: number): CellKey {
  return `${day}:${minute}`
}

/** A cell's weekday and minute past local midnight. */
export function parseCellKey(key: CellKey): { day: number; minute: number } {
  const [day, minute] = key.split(':').map(Number)
  return { day, minute }
}

/** Whether `key` names a row of a `durationMinutes` grid. */
export function isGridCell(key: CellKey, durationMinutes: number): boolean {
  const { day, minute } = parseCellKey(key)
  return (
    Number.isInteger(day) &&
    day >= 0 &&
    day <= 6 &&
    Number.isInteger(minute) &&
    minute >= 0 &&
    minute < MINUTES_PER_DAY &&
    minute % durationMinutes === 0
  )
}

/** Local midnight on the Sunday that starts the week holding `date`. */
export function weekStart(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - date.getDay(),
  )
}

/** The Sunday `weeks` weeks after the one starting `week`. */
export function addWeeks(week: Date, weeks: number): Date {
  return new Date(
    week.getFullYear(),
    week.getMonth(),
    week.getDate() + weeks * 7,
  )
}

/** Local midnight `day` days into the week starting `week`. */
export function dayOf(week: Date, day: number): Date {
  return new Date(week.getFullYear(), week.getMonth(), week.getDate() + day)
}

/**
 * The instant cell `key` names in the week starting `week`, read as a wall
 * clock in the viewer's zone, so a 4:00 PM row stays 4:00 PM across a DST
 * change.
 */
export function cellInstant(week: Date, key: CellKey): Date {
  const { day, minute } = parseCellKey(key)
  return new Date(
    week.getFullYear(),
    week.getMonth(),
    week.getDate() + day,
    0,
    minute,
  )
}

/** Where an instant falls on the grid. */
export interface GridPosition {
  /** The Sunday starting its week. */
  week: Date
  /** The row it starts in: rounded down to a row boundary. */
  key: CellKey
  /** False when it starts partway through its row, e.g. 4:05 on 15s. */
  aligned: boolean
}

/** Where `date` falls on a `durationMinutes` grid, in the viewer's zone. */
export function gridPosition(
  date: Date,
  durationMinutes: number,
): GridPosition {
  const minuteOfDay = date.getHours() * 60 + date.getMinutes()
  const row = minuteOfDay - (minuteOfDay % durationMinutes)
  return {
    week: weekStart(date),
    key: cellKey(date.getDay(), row),
    aligned:
      row === minuteOfDay &&
      date.getSeconds() === 0 &&
      date.getMilliseconds() === 0,
  }
}

/**
 * The instants in `dates` that fall in the week starting `week`, by the cell
 * each starts in. A cell can hold several: two interviewers offering the same
 * time, or a slot off the row boundaries sharing a row with one on it.
 */
export function cellsInWeek<T extends { date: Date }>(
  items: Iterable<T>,
  week: Date,
  durationMinutes: number,
): Map<CellKey, T[]> {
  const cells = new Map<CellKey, T[]>()
  for (const item of items) {
    const position = gridPosition(item.date, durationMinutes)
    if (position.week.getTime() !== week.getTime()) continue
    const cell = cells.get(position.key) ?? []
    cell.push(item)
    cells.set(position.key, cell)
  }
  return cells
}

/** When interviews can be held: from `opens`, up to but not at `closes`. */
export interface GridWindow {
  opens: Date
  closes: Date
}

/** The weeks, by their Sundays, that hold any part of `window`. */
export function weeksInWindow({ opens, closes }: GridWindow): Date[] {
  const weeks: Date[] = []
  const last = weekStart(new Date(closes.getTime() - 1))
  for (let week = weekStart(opens); week <= last; week = addWeeks(week, 1)) {
    weeks.push(week)
  }
  return weeks
}

/** A run of weeks, by their Sundays, both ends included. */
export interface WeekRange {
  from: Date
  through: Date
}

export interface ExpandOptions {
  /** Only instants inside it are kept. */
  window?: GridWindow
  /** Only instants after it are kept: nothing is offered in the past. */
  now?: Date
}

/**
 * The instants `selection` names in every week of `weeks`, soonest first:
 * the half of turning a painted grid into something to save that both sides
 * share. Interviewers' become slots; candidates' are saved as they are.
 *
 * Cells that aren't rows of a `durationMinutes` grid are ignored, as are
 * instants outside `window` or not after `now`. A wall-clock time that
 * doesn't exist (2:30 AM on the night clocks go forward) comes out as the
 * instant the browser maps it to, once.
 */
export function expandGrid(
  selection: Iterable<CellKey>,
  weeks: WeekRange,
  durationMinutes: number,
  { window, now }: ExpandOptions = {},
): Date[] {
  const cells = [...new Set(selection)].filter((key) =>
    isGridCell(key, durationMinutes),
  )
  const instants = new Map<number, Date>()
  for (
    let week = weekStart(weeks.from);
    week <= weeks.through;
    week = addWeeks(week, 1)
  ) {
    for (const key of cells) {
      const instant = cellInstant(week, key)
      if (now && instant <= now) continue
      if (window && (instant < window.opens || instant >= window.closes)) {
        continue
      }
      instants.set(instant.getTime(), instant)
    }
  }
  return [...instants.values()].sort((a, b) => a.getTime() - b.getTime())
}

/** The rows a grid shows: `start` up to, not including, `end`, in minutes. */
export interface RowRange {
  start: number
  end: number
}

/** Where a grid's rows run when nothing on it says otherwise. */
export const DEFAULT_ROWS: RowRange = { start: 8 * 60, end: 22 * 60 }

/**
 * The rows to show: `defaults`, widened to the whole hours covering every
 * instant in `dates`, so a time offered at 6:30 AM in the viewer's zone is
 * never off the grid.
 */
export function rowRange(
  dates: Iterable<Date>,
  defaults: RowRange = DEFAULT_ROWS,
): RowRange {
  let { start, end } = defaults
  for (const date of dates) {
    const minute = date.getHours() * 60 + date.getMinutes()
    start = Math.min(start, minute - (minute % 60))
    end = Math.max(end, minute - (minute % 60) + 60)
  }
  return { start, end: Math.min(end, MINUTES_PER_DAY) }
}

/** "3:30 PM": a row's start as a wall-clock time. */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60)
  const minutes = minute % 60
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

/** "Sep 6": a week's Sunday, or any day, short. */
export function formatShortDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "Mon 9/7": a column's heading in a dated week. */
export function formatColumnDay(date: Date): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  return `${weekday} ${date.getMonth() + 1}/${date.getDate()}`
}

/** "Mon": a column's heading in an undated weekly pattern. */
export function formatWeekday(day: number): string {
  // 2023-01-01 was a Sunday.
  return new Date(2023, 0, 1 + day).toLocaleDateString('en-US', {
    weekday: 'short',
  })
}

/** A column as AvailabilityGrid.svelte takes one. */
export interface WeekColumn {
  day: number
  label: string
  /** Greyed out, and neither paintable nor pickable: outside the window. */
  disabled: boolean
}

/**
 * What a grid cell holds besides paint: `offered` a time open to book,
 * `open` the viewer's own open slot, `booked` a held interview, `available`
 * a time someone else painted, `mine` the viewer's own slot shown for
 * context.
 */
export type CellTone = 'offered' | 'open' | 'booked' | 'available' | 'mine'

/** A cell's contents, as AvailabilityGrid.svelte draws them. */
export interface CellInfo {
  tone: CellTone
  /** Short text drawn in the cell, e.g. a candidate's name. */
  label?: string
  /** Read out and shown on hover. */
  title?: string
  /** Painting can't change it: a booked interview. */
  locked?: boolean
  /** In `pick` mode, a button that calls `onpick`. */
  pickable?: boolean
}

/** An undated weekly pattern's columns, Sunday to Saturday. */
export function patternColumns(): WeekColumn[] {
  return WEEKDAYS.map((day) => ({
    day,
    label: formatWeekday(day),
    disabled: false,
  }))
}

/**
 * The week starting `week`'s columns, dated, with a day wholly outside
 * `window` (or wholly before `now`) disabled.
 */
export function weekColumns(
  week: Date,
  window: GridWindow,
  now?: Date,
): WeekColumn[] {
  return WEEKDAYS.map((day) => {
    const start = dayOf(week, day)
    const end = dayOf(week, day + 1)
    return {
      day,
      label: formatColumnDay(start),
      disabled:
        end <= window.opens ||
        start >= window.closes ||
        (now !== undefined && end <= now),
    }
  })
}

/**
 * Whether cell `key` in the week starting `week` is a time that can still be
 * offered: after `now` and inside `window`.
 */
export function isOpenCell(
  week: Date,
  key: CellKey,
  window: GridWindow,
  now: Date,
): boolean {
  const instant = cellInstant(week, key)
  return instant > now && instant >= window.opens && instant < window.closes
}
