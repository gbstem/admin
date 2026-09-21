import { alert } from '$lib/stores'
import type { ClassValue } from 'clsx'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Timestamp } from 'firebase/firestore'

export function cn(...classes: Array<ClassValue>) {
  return twMerge(clsx(...classes))
}

export function clickOutside(node: HTMLElement) {
  function handleClick(e: MouseEvent) {
    if (!node.contains(e.target as HTMLElement)) {
      node.dispatchEvent(new CustomEvent('outclick'))
    }
  }
  document.addEventListener('click', handleClick, true)
  return {
    destroy() {
      document.removeEventListener('click', handleClick, true)
    },
  }
}

export function trapFocus(node: HTMLElement) {
  const previous = document.activeElement as HTMLElement
  function focusable() {
    return Array.from(
      node.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) as NodeListOf<HTMLElement>,
    )
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return
    const current = document.activeElement
    const elements = focusable()
    const first = elements.at(0) as HTMLElement
    const last = elements.at(-1) as HTMLElement
    if (event.shiftKey && current === first) {
      last.focus()
      event.preventDefault()
    }
    if (!event.shiftKey && current === last) {
      first.focus()
      event.preventDefault()
    }
  }
  focusable()[0]?.focus()
  node.addEventListener('keydown', handleKeyDown)
  return {
    destroy() {
      node.removeEventListener('keydown', handleKeyDown)
      previous?.focus()
    },
  }
}

export function formatTime24to12(time24: string): string {
  // Split the string by ":" to obtain hours and minutes
  const [hours24, minutes] = time24.split(':')

  // Parse the hours and minutes to integers
  const hours24Int = parseInt(hours24, 10)
  const minutesInt = parseInt(minutes, 10)

  // Create a date object at January 1, 2000, at the specified hours and minutes
  const date = new Date(2000, 0, 1, hours24Int, minutesInt)

  // Return the formatted time string in 12-hour format with AM/PM
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  })
}

export function formatClassTimes(
  classDays: string[],
  classTimes: string[],
): string[] {
  return classDays.map(
    (day, index) => `${day} at ${formatTime24to12(classTimes[index])}`,
  )
}

export const formatDate = (date: Date) => {
  return date.toLocaleString('en-US', {
    weekday: 'long', // long, short, narrow
    month: 'long', // numeric, 2-digit, long, short, narrow
    day: 'numeric', // numeric, 2-digit
    hour: 'numeric', // numeric, 2-digit
    minute: 'numeric', // numeric, 2-digit
    hour12: true, // use 12-hour time format with AM/PM
  })
}

export function formatDateString(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateLocal(date: Date | string) {
  return new Date(date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export const formatDateShort = (date: Date) => {
  return date.toLocaleString('en-US', {
    weekday: 'short', // long, short, narrow
    month: 'short', // numeric, 2-digit, long, short, narrow
    day: 'numeric', // numeric, 2-digit
  })
}

/** Where gbSTEM runs its classes and interviews. */
export const GBSTEM_TIME_ZONE = 'America/New_York'

/**
 * Formats a date in gbSTEM's time zone, naming the zone - for text built on
 * the server, such as emails, where the server's own time zone means nothing
 * to the reader.
 */
export function formatDateInGbstemTime(
  date: Date,
  style: 'short' | 'long',
): string {
  return date.toLocaleString('en-US', {
    weekday: style,
    month: style,
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    timeZone: GBSTEM_TIME_ZONE,
    timeZoneName: style,
  })
}

/**
 * Combines a semesterDates.json-style `MM/DD/YY` date and `HH:mm` (24-hour)
 * time - each a bare wall-clock value with no zone of its own - into the
 * instant they name in `GBSTEM_TIME_ZONE`. Resolving this on the server
 * matters: the server's own local time zone (e.g. UTC in production) isn't
 * gbSTEM's, and EST/EDT depends on the date, so neither can be assumed.
 */
export function parseGbstemDateTime(
  dateString: string,
  timeString: string,
): Date {
  const [month, day, twoDigitYear] = dateString.split('/').map(Number)
  const [hour, minute] = timeString.split(':').map(Number)
  const year = 2000 + twoDigitYear

  // Guess the instant as if the wall-clock time were UTC, then correct by
  // the zone's actual offset at that instant.
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)
  const offsetName = new Intl.DateTimeFormat('en-US', {
    timeZone: GBSTEM_TIME_ZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(utcGuess)
    .find((part) => part.type === 'timeZoneName')?.value

  const offsetMatch = offsetName?.match(/GMT([+-])(\d{2}):(\d{2})/)
  const offsetMinutes = offsetMatch
    ? (offsetMatch[1] === '-' ? -1 : 1) *
      (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : 0

  return new Date(utcGuess - offsetMinutes * 60 * 1000)
}

export const timestampToDate = (timestamp: Timestamp | Date) => {
  if (timestamp instanceof Date) {
    return timestamp
  }
  if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date(timestamp.seconds * 1000)
  }
  return new Date(timestamp)
}

export const classHeldToday = (datesHeld: Date[], classTimeToday: Date) => {
  return (
    datesHeld.filter(
      (date) =>
        new Date().toDateString() === timestampToDate(date).toDateString() &&
        new Date() > date,
    ).length > 0 || timestampToDate(classTimeToday) > new Date()
  )
}

export const isClassUpcoming = (date: Date) => {
  return (
    date.getTime() > Date.now() &&
    Math.abs(date.getTime() - new Date().getTime()) / (1000 * 60) < 30
  )
}

export function normalizeCapitals(name: string) {
  if (name === undefined) return ''
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export const getNearestFutureClass = (meetingTimes: Date[]) => {
  const nextIndex = meetingTimes.findIndex(
    (schedule) => new Date(timestampToDate(schedule)) > new Date(),
  )
  return nextIndex === -1
    ? 'No Upcoming Classes'
    : formatDate(timestampToDate(meetingTimes[nextIndex]))
}

export const getNearestFutureClassIndex = (meetingTimes: Date[]) => {
  return meetingTimes.findIndex(
    (schedule) => new Date(timestampToDate(schedule)) > new Date(),
  )
}

export function writeToClipboard(text: string): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== 'function'
  ) {
    return Promise.reject(new Error('Clipboard API not supported'))
  }
  const promise = navigator.clipboard.writeText(text)
  if (promise && typeof promise.then === 'function') {
    return promise
  }
  return Promise.resolve()
}

export function copyEmails(emails: Array<string | null | undefined>) {
  const cleanEmails = emails
    .filter(
      (email): email is string =>
        typeof email === 'string' && email.trim() !== '',
    )
    .map((email) => email.trim())
    .sort()
  writeToClipboard(cleanEmails.join(', '))
    .then(() => {
      alert.trigger('success', 'Emails copied to clipboard!')
    })
    .catch(() => {
      alert.trigger('error', 'Failed to copy emails to clipboard!')
    })
}

export function toLocalISOString(date: Date) {
  const pad = (number: number) => (number < 10 ? '0' + number : number)

  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1) // JavaScript months are 0-indexed.
  const day = pad(date.getDate())
  const hour = pad(date.getHours())
  const minute = pad(date.getMinutes())

  return `${year}-${month}-${day}T${hour}:${minute}`.slice(0, 16)
}

export function cleanEnvVar(value: string | undefined): string | undefined {
  if (!value) return ''

  const trimmed = value.trim()
  const firstChar = trimmed[0]
  const lastChar = trimmed[trimmed.length - 1]

  // Check if the string is wrapped in matching single or double quotes
  if (
    (firstChar === '"' && lastChar === '"') ||
    (firstChar === "'" && lastChar === "'")
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

export function escapeCSVCell(val: any): string {
  if (val === null || val === undefined) {
    return ''
  }
  const str = String(val)
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function generateCSV(
  headers: string[],
  rows: any[][] | any[],
  sort: boolean = true,
  sortColumnIndex: number = 0,
): string {
  let rowData: any[][]
  if (rows.length > 0 && !Array.isArray(rows[0])) {
    rowData = []
    const cols = headers.length
    for (let i = 0; i < rows.length; i += cols) {
      rowData.push(rows.slice(i, i + cols))
    }
  } else {
    rowData = [...(rows as any[][])]
  }

  if (sort) {
    rowData.sort((a, b) => {
      const valA =
        a[sortColumnIndex] !== undefined && a[sortColumnIndex] !== null
          ? String(a[sortColumnIndex])
          : ''
      const valB =
        b[sortColumnIndex] !== undefined && b[sortColumnIndex] !== null
          ? String(b[sortColumnIndex])
          : ''
      return valA < valB ? -1 : valA > valB ? 1 : 0
    })
  }

  const headerLine = headers.map(escapeCSVCell).join(',')
  const rowLines = rowData.map((row) => row.map(escapeCSVCell).join(','))
  return [headerLine, ...rowLines].join('\n')
}

/**
 * Safely parses a page number from a string, number, or null/undefined.
 * Falls back to `defaultPage` (default: 1) if invalid, non-numeric, or < 1.
 */
export function parsePage(
  value: string | number | null | undefined,
  defaultPage = 1,
): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 1
      ? Math.floor(value)
      : defaultPage
  }
  const parsed = parseInt(value || '', 10)
  return !isNaN(parsed) && parsed >= 1 ? parsed : defaultPage
}

/**
 * Safely parses a limit/per-page value from a string, number, or null/undefined.
 * Falls back to `defaultLimit` (default: 25) if invalid, non-numeric, or < 1.
 */
export function parseLimit(
  value: string | number | null | undefined,
  defaultLimit = 25,
): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 1
      ? Math.floor(value)
      : defaultLimit
  }
  const parsed = parseInt(value || '', 10)
  return !isNaN(parsed) && parsed >= 1 ? parsed : defaultLimit
}

/**
 * Extracts and safely parses pagination parameters (`page`, `limit`, and calculated `offset`)
 * from a URL, URLSearchParams, or query object.
 */
export function parsePagination(
  urlOrParams:
    | URL
    | URLSearchParams
    | { searchParams: URLSearchParams }
    | string
    | null
    | undefined,
  options?: { defaultPage?: number; defaultLimit?: number },
) {
  const defaultPage = options?.defaultPage ?? 1
  const defaultLimit = options?.defaultLimit ?? 25

  let params: URLSearchParams | undefined
  if (urlOrParams instanceof URLSearchParams) {
    params = urlOrParams
  } else if (urlOrParams instanceof URL) {
    params = urlOrParams.searchParams
  } else if (
    urlOrParams &&
    typeof urlOrParams === 'object' &&
    'searchParams' in urlOrParams
  ) {
    params = urlOrParams.searchParams
  } else if (typeof urlOrParams === 'string') {
    params = new URLSearchParams(
      urlOrParams.startsWith('?') ? urlOrParams.slice(1) : urlOrParams,
    )
  }

  const pageNum = parsePage(params?.get('page'), defaultPage)
  const limitVal = parseLimit(params?.get('limit'), defaultLimit)
  const offsetVal = (pageNum - 1) * limitVal

  return {
    page: pageNum,
    limit: limitVal,
    offset: offsetVal,
    pageNum,
    limitVal,
    offsetVal,
  }
}
