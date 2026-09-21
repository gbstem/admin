// Set timezone to America/New_York so that date formatting tests are deterministic
process.env.TZ = 'America/New_York'

jest.mock('$lib/stores', () => ({
  alert: {
    trigger: jest.fn(),
  },
}))

import { alert } from '$lib/stores'
import {
  classHeldToday,
  cleanEnvVar,
  clickOutside,
  cn,
  copyEmails,
  escapeCSVCell,
  formatClassTimes,
  formatDate,
  formatDateLocal,
  formatDateInGbstemTime,
  formatDateShort,
  formatDateString,
  formatTime24to12,
  generateCSV,
  getNearestFutureClass,
  getNearestFutureClassIndex,
  isClassUpcoming,
  normalizeCapitals,
  parseGbstemDateTime,
  parseLimit,
  parsePage,
  parsePagination,
  timestampToDate,
  toLocalISOString,
  trapFocus,
} from '../src/lib/utils'

describe('utils', () => {
  describe('cn', () => {
    it('merges class names correctly', () => {
      expect(cn('class1', 'class2')).toBe('class1 class2')
    })

    it('handles conditional class names', () => {
      expect(cn('class1', false && 'class2', true && 'class3')).toBe(
        'class1 class3',
      )
    })

    it('merges tailwind classes properly using twMerge', () => {
      expect(cn('px-2 py-1', 'p-4')).toBe('p-4')
    })
  })

  describe('clickOutside', () => {
    let node: HTMLDivElement
    let outside: HTMLButtonElement
    let inside: HTMLButtonElement

    beforeEach(() => {
      node = document.createElement('div')
      outside = document.createElement('button')
      inside = document.createElement('button')

      node.appendChild(inside)
      document.body.appendChild(node)
      document.body.appendChild(outside)
    })

    afterEach(() => {
      document.body.removeChild(node)
      document.body.removeChild(outside)
    })

    it('dispatches outclick event when clicked outside', () => {
      const listener = jest.fn()
      node.addEventListener('outclick', listener)

      const action = clickOutside(node)
      outside.click()

      expect(listener).toHaveBeenCalled()
      action.destroy()
    })

    it('does not dispatch outclick event when clicked inside', () => {
      const listener = jest.fn()
      node.addEventListener('outclick', listener)

      const action = clickOutside(node)
      inside.click()

      expect(listener).not.toHaveBeenCalled()
      action.destroy()
    })

    it('removes click event listener when destroyed', () => {
      const listener = jest.fn()
      node.addEventListener('outclick', listener)

      const action = clickOutside(node)
      action.destroy()

      outside.click()
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('trapFocus', () => {
    let container: HTMLDivElement
    let button1: HTMLButtonElement
    let button2: HTMLButtonElement
    let outsideButton: HTMLButtonElement

    beforeEach(() => {
      container = document.createElement('div')
      button1 = document.createElement('button')
      button2 = document.createElement('button')
      outsideButton = document.createElement('button')

      container.appendChild(button1)
      container.appendChild(button2)
      document.body.appendChild(container)
      document.body.appendChild(outsideButton)
    })

    afterEach(() => {
      document.body.removeChild(container)
      document.body.removeChild(outsideButton)
    })

    it('focuses the first focusable element on initialization', () => {
      outsideButton.focus()
      expect(document.activeElement).toBe(outsideButton)

      const action = trapFocus(container)
      expect(document.activeElement).toBe(button1)

      action.destroy()
    })

    it('restores focus to previous element on destroy', () => {
      outsideButton.focus()
      const action = trapFocus(container)
      action.destroy()
      expect(document.activeElement).toBe(outsideButton)
    })

    it('wraps focus from last to first element on Tab', () => {
      const action = trapFocus(container)
      button2.focus()

      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: false,
      })
      container.dispatchEvent(event)

      expect(document.activeElement).toBe(button1)
      action.destroy()
    })

    it('wraps focus from first to last element on Shift+Tab', () => {
      const action = trapFocus(container)
      button1.focus()

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })
      container.dispatchEvent(event)

      expect(document.activeElement).toBe(button2)
      action.destroy()
    })
  })

  describe('formatTime24to12', () => {
    it('formats times correctly', () => {
      expect(formatTime24to12('13:30')).toBe('1:30 PM')
      expect(formatTime24to12('09:05')).toBe('9:05 AM')
      expect(formatTime24to12('00:00')).toBe('12:00 AM')
      expect(formatTime24to12('12:00')).toBe('12:00 PM')
    })
  })

  describe('formatClassTimes', () => {
    it('formats a list of class days and times', () => {
      const days = ['Monday', 'Wednesday']
      const times = ['14:00', '16:30']
      expect(formatClassTimes(days, times)).toEqual([
        'Monday at 2:00 PM',
        'Wednesday at 4:30 PM',
      ])
    })
  })

  describe('date formatters', () => {
    it('formatDate formats date without year', () => {
      const date = new Date(2026, 4, 28, 15, 30) // May 28, 2026 3:30 PM
      expect(formatDate(date)).toBe('Thursday, May 28 at 3:30 PM')
    })

    it('formatDateString formats a date string with year', () => {
      expect(formatDateString('2026-05-28T15:30:00')).toBe(
        'Thursday, May 28, 2026 at 03:30 PM',
      )
    })

    it('formatDateLocal formats Date or string with timezone abbreviation', () => {
      expect(formatDateLocal('2026-05-28T15:30:00')).toBe(
        'Thursday, May 28, 2026 at 03:30 PM EDT',
      )
    })

    it('formatDateShort formats a short date representation', () => {
      const date = new Date(2026, 4, 28, 15, 30)
      expect(formatDateShort(date)).toBe('Thu, May 28')
    })

    it('toLocalISOString formats local date components to ISO string format', () => {
      const date = new Date(2026, 4, 28, 15, 30)
      expect(toLocalISOString(date)).toBe('2026-05-28T15:30')
    })

    it('formatDateInGbstemTime names the Eastern zone regardless of the runtime zone', () => {
      const date = new Date('2026-05-28T19:30:00Z')
      expect(formatDateInGbstemTime(date, 'long')).toBe(
        'Thursday, May 28 at 3:30 PM Eastern Daylight Time',
      )
      expect(formatDateInGbstemTime(date, 'short')).toBe(
        'Thu, May 28, 3:30 PM EDT',
      )
    })

    it('parseGbstemDateTime anchors a semesterDates.json date/time to EDT in summer', () => {
      // 09/20/26 at 19:00 is EDT (UTC-4), regardless of the process's own TZ.
      const date = parseGbstemDateTime('09/20/26', '19:00')
      expect(date.toISOString()).toBe('2026-09-20T23:00:00.000Z')
      expect(formatDateInGbstemTime(date, 'long')).toBe(
        'Sunday, September 20 at 7:00 PM Eastern Daylight Time',
      )
    })

    it('parseGbstemDateTime anchors a semesterDates.json date/time to EST in winter', () => {
      // 01/15/26 at 18:30 is EST (UTC-5).
      const date = parseGbstemDateTime('01/15/26', '18:30')
      expect(date.toISOString()).toBe('2026-01-15T23:30:00.000Z')
      expect(formatDateInGbstemTime(date, 'long')).toBe(
        'Thursday, January 15 at 6:30 PM Eastern Standard Time',
      )
    })
  })

  describe('timestampToDate', () => {
    it('converts Firestore Timestamp to Date', () => {
      const mockTimestamp = { seconds: 1779900600 } as any // 2026-05-28T15:30:00Z
      const result = timestampToDate(mockTimestamp)
      expect(result.getTime()).toBe(1779900600 * 1000)
    })
  })

  describe('classHeldToday and isClassUpcoming with fake timers', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      // Set local system time to May 28, 2026 12:00:00 EDT
      jest.setSystemTime(new Date('2026-05-28T12:00:00-04:00'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    describe('classHeldToday', () => {
      it('returns true if class was held earlier today', () => {
        const classTime = new Date('2026-05-28T10:00:00-04:00')
        const mockTimestamp = Object.assign(classTime, {
          seconds: classTime.getTime() / 1000,
        })
        const datesHeld = [mockTimestamp] as any
        const classTimeToday = { seconds: classTime.getTime() / 1000 } as any
        expect(classHeldToday(datesHeld, classTimeToday)).toBe(true)
      })

      it('returns true if next class time is in the future', () => {
        const datesHeld: any[] = []
        const classTimeToday = {
          seconds: new Date('2026-05-28T14:00:00-04:00').getTime() / 1000,
        } as any
        expect(classHeldToday(datesHeld, classTimeToday)).toBe(true)
      })

      it('returns false if class was held on a different day and no future classes are scheduled today', () => {
        const classTime = new Date('2026-05-27T10:00:00-04:00')
        const mockTimestamp = Object.assign(classTime, {
          seconds: classTime.getTime() / 1000,
        })
        const datesHeld = [mockTimestamp] as any
        const classTimeToday = { seconds: classTime.getTime() / 1000 } as any
        expect(classHeldToday(datesHeld, classTimeToday)).toBe(false)
      })
    })

    describe('isClassUpcoming', () => {
      it('returns true if class starts within 30 minutes in the future', () => {
        const classDate = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes from now
        expect(isClassUpcoming(classDate)).toBe(true)
      })

      it('returns false if class starts more than 30 minutes in the future', () => {
        const classDate = new Date(Date.now() + 45 * 60 * 1000) // 45 minutes from now
        expect(isClassUpcoming(classDate)).toBe(false)
      })

      it('returns false if class started in the past', () => {
        const classDate = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
        expect(isClassUpcoming(classDate)).toBe(false)
      })
    })

    describe('getNearestFutureClass and getNearestFutureClassIndex', () => {
      it('returns formatted date of the nearest future class and its index', () => {
        const pastClass = {
          seconds: new Date('2026-05-27T12:00:00-04:00').getTime() / 1000,
        } as any
        const futureClass1 = {
          seconds: new Date('2026-05-28T15:30:00-04:00').getTime() / 1000,
        } as any
        const futureClass2 = {
          seconds: new Date('2026-05-29T10:00:00-04:00').getTime() / 1000,
        } as any

        const meetingTimes = [pastClass, futureClass1, futureClass2]

        expect(getNearestFutureClassIndex(meetingTimes)).toBe(1)
        expect(getNearestFutureClass(meetingTimes)).toBe(
          'Thursday, May 28 at 3:30 PM',
        )
      })

      it('returns index -1 and default message when there are no future classes', () => {
        const pastClass = {
          seconds: new Date('2026-05-27T12:00:00-04:00').getTime() / 1000,
        } as any
        const meetingTimes = [pastClass]

        expect(getNearestFutureClassIndex(meetingTimes)).toBe(-1)
        expect(getNearestFutureClass(meetingTimes)).toBe('No Upcoming Classes')
      })
    })
  })

  describe('normalizeCapitals', () => {
    it('normalizes names to title case', () => {
      expect(normalizeCapitals('john doe')).toBe('John Doe')
      expect(normalizeCapitals('JOHN DOE')).toBe('John Doe')
      expect(normalizeCapitals('jOhN DoE')).toBe('John Doe')
    })
  })

  describe('copyEmails', () => {
    let originalClipboard: any

    beforeAll(() => {
      originalClipboard = { ...navigator.clipboard }
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: jest.fn(),
        },
        writable: true,
        configurable: true,
      })
    })

    afterAll(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        writable: true,
        configurable: true,
      })
    })

    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('filters false-y/blank values, sorts them, joins them, and triggers success alert', async () => {
      ;(navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined)

      copyEmails([
        'test2@example.com',
        '',
        null,
        undefined,
        '  ',
        'test1@example.com',
      ])

      // Wait for promise microtasks
      await new Promise(process.nextTick)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'test1@example.com, test2@example.com',
      )
      expect(alert.trigger).toHaveBeenCalledWith(
        'success',
        'Emails copied to clipboard!',
      )
    })

    it('triggers error alert when email copying fails', async () => {
      ;(navigator.clipboard.writeText as jest.Mock).mockRejectedValue(
        new Error('Permission denied'),
      )

      copyEmails(['test@example.com'])

      // Wait for promise microtasks
      await new Promise(process.nextTick)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'test@example.com',
      )
      expect(alert.trigger).toHaveBeenCalledWith(
        'error',
        'Failed to copy emails to clipboard!',
      )
    })
  })

  describe('cleanEnvVar', () => {
    it('removes double quotes', () => {
      expect(cleanEnvVar('"value"')).toBe('value')
    })

    it('removes single quotes', () => {
      expect(cleanEnvVar("'value'")).toBe('value')
    })

    it('trims whitespace', () => {
      expect(cleanEnvVar('  value  ')).toBe('value')
    })

    it('removes both quotes and whitespace', () => {
      expect(cleanEnvVar('  "value"  ')).toBe('value')
    })

    it('returns empty string for empty input', () => {
      expect(cleanEnvVar('')).toBe('')
    })

    it('returns empty string for undefined', () => {
      expect(cleanEnvVar(undefined)).toBe('')
    })

    it('returns value unchanged if not quoted', () => {
      expect(cleanEnvVar('value')).toBe('value')
    })

    it('handles special characters in value', () => {
      expect(cleanEnvVar('"user-agent: Mozilla..."')).toBe(
        'user-agent: Mozilla...',
      )
    })
  })

  describe('CSV helpers', () => {
    describe('escapeCSVCell', () => {
      it('escapes cells containing commas, double quotes, or newlines', () => {
        expect(escapeCSVCell('hello')).toBe('hello')
        expect(escapeCSVCell('hello, world')).toBe('"hello, world"')
        expect(escapeCSVCell('hello "world"')).toBe('"hello ""world"""')
        expect(escapeCSVCell('hello\nworld')).toBe('"hello\nworld"')
        expect(escapeCSVCell(null)).toBe('')
        expect(escapeCSVCell(undefined)).toBe('')
      })
    })

    describe('generateCSV', () => {
      it('generates CSV content from 2D array rows', () => {
        const headers = ['id', 'name', 'comment']
        const rows = [
          [1, 'Alice', 'no comment'],
          [2, 'Bob', 'hello, world'],
          [3, 'Charlie', 'line 1\nline 2'],
        ]
        const expected = [
          'id,name,comment',
          '1,Alice,no comment',
          '2,Bob,"hello, world"',
          '3,Charlie,"line 1\nline 2"',
        ].join('\n')

        expect(generateCSV(headers, rows)).toBe(expected)
      })

      it('generates CSV content from 1D flat array', () => {
        const headers = ['id', 'name']
        const flatArray = [1, 'Alice', 2, 'Bob']
        const expected = ['id,name', '1,Alice', '2,Bob'].join('\n')

        expect(generateCSV(headers, flatArray)).toBe(expected)
      })

      it('automatically sorts rows alphabetically by the first column by default', () => {
        const headers = ['id', 'name']
        const rows = [
          ['class-fake-13', 'Susan'],
          ['class-fake-1', 'Mary'],
          ['class-fake-25', 'Betty'],
        ]
        const expected = [
          'id,name',
          'class-fake-1,Mary',
          'class-fake-13,Susan',
          'class-fake-25,Betty',
        ].join('\n')

        expect(generateCSV(headers, rows)).toBe(expected)
      })

      it('can disable sorting or sort by a custom column', () => {
        const headers = ['id', 'name']
        const rows = [
          ['class-fake-13', 'Susan'],
          ['class-fake-1', 'Mary'],
          ['class-fake-25', 'Betty'],
        ]
        const unsortedExpected = [
          'id,name',
          'class-fake-13,Susan',
          'class-fake-1,Mary',
          'class-fake-25,Betty',
        ].join('\n')
        const sortByColumn1Expected = [
          'id,name',
          'class-fake-25,Betty',
          'class-fake-1,Mary',
          'class-fake-13,Susan',
        ].join('\n')

        expect(generateCSV(headers, rows, false)).toBe(unsortedExpected)
        expect(generateCSV(headers, rows, true, 1)).toBe(sortByColumn1Expected)
      })
    })
  })

  describe('pagination helpers', () => {
    describe('parsePage', () => {
      it('parses valid numeric strings and numbers', () => {
        expect(parsePage('1')).toBe(1)
        expect(parsePage('5')).toBe(5)
        expect(parsePage('42')).toBe(42)
        expect(parsePage(3)).toBe(3)
        expect(parsePage(4.8)).toBe(4)
      })

      it('falls back to defaultPage for empty, missing, or invalid values', () => {
        expect(parsePage(undefined)).toBe(1)
        expect(parsePage(null)).toBe(1)
        expect(parsePage('')).toBe(1)
        expect(parsePage('abc')).toBe(1)
        expect(parsePage('0')).toBe(1)
        expect(parsePage('-5')).toBe(1)
        expect(parsePage(-5)).toBe(1)
        expect(parsePage(NaN)).toBe(1)
        expect(parsePage(Infinity)).toBe(1)
      })

      it('respects a custom defaultPage', () => {
        expect(parsePage(undefined, 3)).toBe(3)
        expect(parsePage('', 5)).toBe(5)
        expect(parsePage('0', 2)).toBe(2)
        expect(parsePage('-1', 4)).toBe(4)
        expect(parsePage('7', 2)).toBe(7)
      })
    })

    describe('parseLimit', () => {
      it('parses valid numeric strings and numbers', () => {
        expect(parseLimit('25')).toBe(25)
        expect(parseLimit('50')).toBe(50)
        expect(parseLimit('100')).toBe(100)
        expect(parseLimit(50)).toBe(50)
        expect(parseLimit(99.9)).toBe(99)
      })

      it('falls back to defaultLimit for empty, missing, or invalid values', () => {
        expect(parseLimit(undefined)).toBe(25)
        expect(parseLimit(null)).toBe(25)
        expect(parseLimit('')).toBe(25)
        expect(parseLimit('abc')).toBe(25)
        expect(parseLimit('0')).toBe(25)
        expect(parseLimit('-10')).toBe(25)
        expect(parseLimit(-10)).toBe(25)
        expect(parseLimit(NaN)).toBe(25)
        expect(parseLimit(Infinity)).toBe(25)
      })

      it('respects a custom defaultLimit', () => {
        expect(parseLimit(undefined, 50)).toBe(50)
        expect(parseLimit('', 100)).toBe(100)
        expect(parseLimit('0', 10)).toBe(10)
        expect(parseLimit('-5', 20)).toBe(20)
        expect(parseLimit('75', 25)).toBe(75)
      })
    })

    describe('parsePagination', () => {
      it('parses pagination from URL objects correctly', () => {
        const url = new URL('https://example.com/tokens?page=3&limit=50')
        const result = parsePagination(url)
        expect(result).toEqual({
          page: 3,
          limit: 50,
          offset: 100,
          pageNum: 3,
          limitVal: 50,
          offsetVal: 100,
        })
      })

      it('parses pagination from URLSearchParams', () => {
        const params = new URLSearchParams('page=2&limit=25')
        const result = parsePagination(params)
        expect(result).toEqual({
          page: 2,
          limit: 25,
          offset: 25,
          pageNum: 2,
          limitVal: 25,
          offsetVal: 25,
        })
      })

      it('parses pagination from query strings', () => {
        const resultWithQuestionMark = parsePagination('?page=4&limit=10')
        expect(resultWithQuestionMark).toEqual({
          page: 4,
          limit: 10,
          offset: 30,
          pageNum: 4,
          limitVal: 10,
          offsetVal: 30,
        })

        const resultWithoutQuestionMark = parsePagination('page=4&limit=10')
        expect(resultWithoutQuestionMark).toEqual({
          page: 4,
          limit: 10,
          offset: 30,
          pageNum: 4,
          limitVal: 10,
          offsetVal: 30,
        })
      })

      it('parses pagination from objects with searchParams property', () => {
        const obj = { searchParams: new URLSearchParams('page=5&limit=20') }
        const result = parsePagination(obj)
        expect(result).toEqual({
          page: 5,
          limit: 20,
          offset: 80,
          pageNum: 5,
          limitVal: 20,
          offsetVal: 80,
        })
      })

      it('handles empty, missing, or invalid parameters gracefully', () => {
        expect(parsePagination(new URL('https://example.com/tokens'))).toEqual({
          page: 1,
          limit: 25,
          offset: 0,
          pageNum: 1,
          limitVal: 25,
          offsetVal: 0,
        })

        expect(
          parsePagination(new URL('https://example.com/tokens?page=&limit=')),
        ).toEqual({
          page: 1,
          limit: 25,
          offset: 0,
          pageNum: 1,
          limitVal: 25,
          offsetVal: 0,
        })

        expect(
          parsePagination(
            new URL('https://example.com/tokens?page=invalid&limit=xyz'),
          ),
        ).toEqual({
          page: 1,
          limit: 25,
          offset: 0,
          pageNum: 1,
          limitVal: 25,
          offsetVal: 0,
        })

        expect(parsePagination(null)).toEqual({
          page: 1,
          limit: 25,
          offset: 0,
          pageNum: 1,
          limitVal: 25,
          offsetVal: 0,
        })

        expect(parsePagination(undefined)).toEqual({
          page: 1,
          limit: 25,
          offset: 0,
          pageNum: 1,
          limitVal: 25,
          offsetVal: 0,
        })
      })

      it('supports custom options for defaults', () => {
        const result = parsePagination(new URL('https://example.com/tokens'), {
          defaultPage: 2,
          defaultLimit: 10,
        })
        expect(result).toEqual({
          page: 2,
          limit: 10,
          offset: 10,
          pageNum: 2,
          limitVal: 10,
          offsetVal: 10,
        })
      })
    })
  })
})
