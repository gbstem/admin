// Run in New York time (package.json's `test` sets TZ), where the grid's wall
// clock and gbSTEM's agree, so DST changes land on known dates: clocks went
// back at 2:00 AM on Sunday, Nov 1, 2026.
import {
  DEFAULT_ROWS,
  addWeeks,
  cellInstant,
  cellKey,
  cellsInWeek,
  expandGrid,
  formatColumnDay,
  formatMinute,
  formatWeekday,
  gridPosition,
  isGridCell,
  isOpenCell,
  parseCellKey,
  patternColumns,
  rowRange,
  weekColumns,
  weekStart,
  weeksInWindow,
} from '../src/lib/shared/availabilityGrid'

const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min)

// Sunday, Oct 4, 2026, and the weeks either side of the DST change.
const OCT_4 = local(2026, 10, 4)
const OCT_25 = local(2026, 10, 25)
const NOV_1 = local(2026, 11, 1)

describe('cell keys', () => {
  it('round-trips a weekday and minute', () => {
    expect(cellKey(2, 930)).toBe('2:930')
    expect(parseCellKey('2:930')).toEqual({ day: 2, minute: 930 })
  })

  it.each([
    ['2:930', true],
    ['0:0', true],
    ['6:1425', true],
    ['2:935', false],
    ['7:930', false],
    ['-1:930', false],
    ['2:1440', false],
    ['nonsense', false],
  ])('%s is a row of a 15-minute grid: %s', (key, expected) => {
    expect(isGridCell(key, 15)).toBe(expected)
  })
})

describe('weeks', () => {
  it('starts a week at local midnight on its Sunday', () => {
    expect(weekStart(local(2026, 10, 7, 15, 30))).toEqual(OCT_4)
    expect(weekStart(OCT_4)).toEqual(OCT_4)
    expect(weekStart(local(2026, 10, 10, 23, 59))).toEqual(OCT_4)
  })

  it('steps a week at a time across a DST change, staying on midnight', () => {
    expect(addWeeks(OCT_25, 1)).toEqual(NOV_1)
    expect(addWeeks(NOV_1, -1)).toEqual(OCT_25)
  })

  it('lists every week holding part of a window', () => {
    const weeks = weeksInWindow({
      // Tue, Oct 6 through the instant Thu, Oct 22 ends.
      opens: local(2026, 10, 6),
      closes: local(2026, 10, 23),
    })
    expect(weeks).toEqual([OCT_4, local(2026, 10, 11), local(2026, 10, 18)])
  })

  it('leaves out the week a window closes at the very start of', () => {
    expect(
      weeksInWindow({ opens: local(2026, 10, 6), closes: local(2026, 10, 11) }),
    ).toEqual([OCT_4])
  })
})

describe('cellInstant and gridPosition', () => {
  it("names a cell's wall-clock time in the week", () => {
    expect(cellInstant(OCT_4, '2:930')).toEqual(local(2026, 10, 6, 15, 30))
  })

  it('keeps a 4 PM row at 4 PM across a DST change', () => {
    const before = cellInstant(OCT_25, '1:960')
    const after = cellInstant(NOV_1, '1:960')
    expect(before.getHours()).toBe(16)
    expect(after.getHours()).toBe(16)
    // A week apart on the wall clock is a week and an hour apart in time.
    expect(after.getTime() - before.getTime()).toBe(
      (7 * 24 + 1) * 60 * 60 * 1000,
    )
  })

  it('places an instant in its week and row', () => {
    expect(gridPosition(local(2026, 10, 6, 15, 30), 15)).toEqual({
      week: OCT_4,
      key: '2:930',
      aligned: true,
    })
  })

  it('rounds an off-row instant down, and says so', () => {
    expect(gridPosition(local(2026, 10, 6, 16, 5), 15)).toEqual({
      week: OCT_4,
      key: '2:960',
      aligned: false,
    })
  })
})

describe('cellsInWeek', () => {
  it("groups a week's items by cell, and leaves out other weeks'", () => {
    const a = { date: local(2026, 10, 6, 15, 30), id: 'a' }
    const b = { date: local(2026, 10, 6, 15, 30), id: 'b' }
    const c = { date: local(2026, 10, 6, 15, 40), id: 'c' }
    const elsewhere = { date: local(2026, 10, 13, 15, 30), id: 'd' }

    const cells = cellsInWeek([a, b, c, elsewhere], OCT_4, 15)

    expect([...cells.keys()]).toEqual(['2:930'])
    expect(cells.get('2:930')?.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('expandGrid', () => {
  // Mon-Fri 3:30-4:00 PM: two rows a day.
  const weekdayAfternoons = [1, 2, 3, 4, 5].flatMap((day) => [
    cellKey(day, 930),
    cellKey(day, 945),
  ])

  it('repeats the painted cells in every week of the range, soonest first', () => {
    const dates = expandGrid(
      weekdayAfternoons,
      { from: OCT_4, through: local(2026, 10, 18) },
      15,
    )

    expect(dates).toHaveLength(30)
    expect(dates[0]).toEqual(local(2026, 10, 5, 15, 30))
    expect(dates.at(-1)).toEqual(local(2026, 10, 23, 15, 45))
    expect(dates.every((date, i) => i === 0 || date > dates[i - 1])).toBe(true)
  })

  it('keeps only instants inside the window and after now', () => {
    const dates = expandGrid(
      weekdayAfternoons,
      { from: OCT_4, through: local(2026, 10, 11) },
      15,
      {
        now: local(2026, 10, 6, 15, 30),
        window: { opens: OCT_4, closes: local(2026, 10, 13) },
      },
    )

    // Tue 3:45 PM on, through Mon, Oct 12.
    expect(dates[0]).toEqual(local(2026, 10, 6, 15, 45))
    expect(dates.at(-1)).toEqual(local(2026, 10, 12, 15, 45))
    expect(dates).toHaveLength(9)
  })

  it('ignores cells that are not rows of the grid, and repeats', () => {
    expect(
      expandGrid(
        ['1:930', '1:930', '1:935', 'junk'],
        { from: OCT_4, through: OCT_4 },
        15,
      ),
    ).toEqual([local(2026, 10, 5, 15, 30)])
  })

  it('accepts a range given by any day of its first week', () => {
    expect(
      expandGrid(['1:930'], { from: local(2026, 10, 7), through: OCT_4 }, 15),
    ).toEqual([local(2026, 10, 5, 15, 30)])
  })

  it('crosses a DST change on the wall clock', () => {
    expect(
      expandGrid(['1:960'], { from: OCT_25, through: NOV_1 }, 15).map((date) =>
        date.getHours(),
      ),
    ).toEqual([16, 16])
  })
})

describe('rowRange', () => {
  it('shows the default hours when nothing falls outside them', () => {
    expect(rowRange([local(2026, 10, 6, 15, 30)])).toEqual(DEFAULT_ROWS)
  })

  it('widens to the whole hours covering an early or late time', () => {
    expect(
      rowRange([local(2026, 10, 6, 6, 30), local(2026, 10, 6, 22, 15)]),
    ).toEqual({ start: 6 * 60, end: 23 * 60 })
  })

  it('never runs past midnight', () => {
    expect(rowRange([local(2026, 10, 6, 23, 45)]).end).toBe(24 * 60)
  })
})

describe('columns', () => {
  it('heads an undated pattern with weekday names', () => {
    expect(patternColumns().map((column) => column.label)).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ])
  })

  it('dates a week, disabling days wholly outside the window or past', () => {
    const columns = weekColumns(
      OCT_4,
      { opens: local(2026, 10, 6), closes: local(2026, 10, 9) },
      local(2026, 10, 6, 12),
    )
    expect(columns[2]).toEqual({ day: 2, label: 'Tue 10/6', disabled: false })
    expect(columns.map((column) => column.disabled)).toEqual([
      true,
      true,
      false,
      false,
      false,
      true,
      true,
    ])
  })

  it('formats headings and rows', () => {
    expect(formatWeekday(0)).toBe('Sun')
    expect(formatColumnDay(local(2026, 10, 6))).toBe('Tue 10/6')
    expect(formatMinute(0)).toBe('12:00 AM')
    expect(formatMinute(930)).toBe('3:30 PM')
    expect(formatMinute(720)).toBe('12:00 PM')
  })
})

describe('isOpenCell', () => {
  const window = { opens: OCT_4, closes: local(2026, 10, 8) }
  const now = local(2026, 10, 6, 15, 30)

  it.each([
    ['later the same day', '2:945', true],
    ['the instant now', '2:930', false],
    ['earlier', '1:945', false],
    ['after the window closes', '4:600', false],
  ])('%s: %s -> %s', (_, key, expected) => {
    expect(isOpenCell(OCT_4, key, window, now)).toBe(expected)
  })
})
