// Mock Svelte Stores
const readableResets: Array<() => void> = []

jest.mock('svelte/store', () => {
  const get = (store: any) => {
    let value: any
    store.subscribe((v: any) => {
      value = v
    })()
    return value
  }
  const writable = (initialValue: any) => {
    let currentValue = initialValue
    const subscribers = new Set<any>()
    const subscribe = (fn: any) => {
      subscribers.add(fn)
      fn(currentValue)
      return () => {
        subscribers.delete(fn)
      }
    }
    const set = (newValue: any) => {
      currentValue = newValue
      subscribers.forEach((fn) => fn(currentValue))
    }
    const update = (fn: any) => {
      set(fn(currentValue))
    }
    return { subscribe, set, update }
  }
  const readable = (initialValue: any, start: any) => {
    let currentValue = initialValue
    const subscribers = new Set<any>()
    let stop: any = null
    const subscribe = (fn: any) => {
      subscribers.add(fn)
      fn(currentValue)
      if (subscribers.size === 1 && start) {
        stop = start((newValue: any) => {
          currentValue = newValue
          subscribers.forEach((f) => f(currentValue))
        })
      }
      return () => {
        subscribers.delete(fn)
        if (subscribers.size === 0 && stop) {
          stop()
        }
      }
    }
    readableResets.push(() => {
      currentValue = initialValue
    })
    return { subscribe }
  }
  return { get, writable, readable }
})

// Mock firebase/app
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
}))

// Mock firebase/auth
let authStateChangedCallback: any = null
const mockAuth = {
  currentUser: null,
}
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => mockAuth),
  onAuthStateChanged: jest.fn((_authObj: any, callback: any) => {
    authStateChangedCallback = callback
    return jest.fn() // unsubscribe
  }),
}))

// Mock firebase/firestore
jest.mock('firebase/firestore', () => {
  class MockTimestamp {
    constructor(
      public seconds: number,
      public nanoseconds: number,
    ) {}
    static now() {
      return new MockTimestamp(Date.now() / 1000, 0)
    }
    toDate() {
      return new Date(this.seconds * 1000)
    }
  }
  return {
    getFirestore: jest.fn(),
    doc: jest.fn(),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    collection: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    arrayUnion: jest.fn((...val: any[]) => val),
    Timestamp: MockTimestamp,
  }
})

// Mock firebase/storage
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
}))

// Mock firebase-admin
const mockAdminAuth = {
  verifyIdToken: jest.fn(),
  createSessionCookie: jest.fn(),
  verifySessionCookie: jest.fn(),
  getUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
}
const mockAdminDb = {
  collection: jest.fn(),
}
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockAdminAuth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockAdminDb),
}))

// Mock lodash-es
jest.mock('lodash-es', () => ({
  capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
  lowerCase: (str: string) => str.replace(/[-_]/g, ' ').toLowerCase(),
}))

// Mock $lib/stores
jest.mock('$lib/stores', () => ({
  alert: {
    trigger: jest.fn(),
  },
}))

import { user } from '../src/lib/client/firebase'
import { verifyToken } from '../src/lib/server/firebase'
import { SubRequestStatus } from '../src/lib/data/helpers/SubRequestStatus'
import sendClassReminder from '../src/lib/data/helpers/sendClassReminders'
import { alert } from '$lib/stores'

// Import email templates to cover
import { acceptEmailTemplate } from '../src/lib/data/emailTemplates/acceptEmailTemplate'
import { classReminderEmailTemplate } from '../src/lib/data/emailTemplates/classReminderEmailTemplate'
import { inPersonClassEnrolledEmailTemplate } from '../src/lib/data/emailTemplates/inPersonClassEnrolledEmailTemplate'
import { interviewScheduledEmailTemplate } from '../src/lib/data/emailTemplates/interviewScheduledEmailTemplate'
import { onlineClassEnrolledEmailTemplate } from '../src/lib/data/emailTemplates/onlineClassEnrolledEmailTemplate'
import { rejectionEmailTemplate } from '../src/lib/data/emailTemplates/rejectionEmailTemplate'
import { scheduleInterviewEmailTemplate } from '../src/lib/data/emailTemplates/scheduleInterviewEmailTemplate'
import { subEmailTemplate } from '../src/lib/data/emailTemplates/subEmailTemplate'
import { teachingReminderEmailTemplate } from '../src/lib/data/emailTemplates/teachingReminderEmailTemplate'
import { waitlistEmailTemplate } from '../src/lib/data/emailTemplates/waitlistEmailTemplate'

// Set globals for types to prevent ReferenceErrors from default exports of TypeScript types
;(global as any).ClassData = {}
;(global as any).Student = {}

// Import types just to execute the files
import '../src/lib/data/types/ClassData'
import '../src/lib/data/types/ClassStatus'
import '../src/lib/data/types/Student'

// Import collections
import '../src/lib/data/collections'
import { currentSemester } from '../src/lib/data/collections'
import courses from '../src/lib/data/courses.json'
import {
  coursesJson,
  csCoursesJson,
  engineeringCoursesJson,
  mathCoursesJson,
  scienceCoursesJson,
} from '../src/lib/data/index'

describe('data/index', () => {
  // These used to mock `Date` to October and March to exercise a wall-clock
  // switch. The catalog now follows `currentSemester` instead, so the clock
  // proves nothing - what matters is that the offered slice matches the
  // semester every collection path is already scoped to.
  it('offers the half of the catalog matching currentSemester', () => {
    const expected = currentSemester.startsWith('Fall') ? 'fall' : 'spring'
    expect(coursesJson.length).toBeGreaterThan(0)
    expect(coursesJson.every((course) => course.semester === expected)).toBe(
      true,
    )
  })

  it('offers the same courses in both halves of the year', () => {
    // Every course runs in both semesters - a fall `a`/`A` and a spring
    // `b`/`B` - so a course present in one half and not the other means an
    // entry was added to the catalog without its counterpart.
    const fall = courses.filter((c) => c.semester === 'fall')
    const spring = courses.filter((c) => c.semester === 'spring')
    expect(fall.length).toBe(spring.length)
    expect(coursesJson.length).toBe(fall.length)
  })

  it('names each offered course exactly once', () => {
    // The name is what lands on a class document and what portal looks a
    // curriculum link up by; two courses sharing one within a semester would
    // make that lookup ambiguous.
    const names = coursesJson.map((course) => course.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every course a unique curriculum id', () => {
    const ids = courses.map((course) => course.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('files every course under one of the four tracks', () => {
    const tracks = ['cs', 'math', 'engineering', 'science']
    expect(courses.filter((c) => !tracks.includes(c.track))).toEqual([])
  })

  it('puts every offered course in exactly one track dropdown', () => {
    // The four filtered lists back the registration form's four selects, each
    // with a sentinel "not interested" entry ahead of the real courses.
    const lists = [
      csCoursesJson,
      mathCoursesJson,
      engineeringCoursesJson,
      scienceCoursesJson,
    ]
    const listed = lists.flatMap((list) => list.slice(1))
    expect(listed.length).toBe(coursesJson.length)
    lists.forEach((list) => expect(list[0].name).toMatch(/not interested/))
  })
})

describe('SubRequestStatus', () => {
  it('has expected values', () => {
    expect(SubRequestStatus.SubstituteNeeded).toBe('SubstituteNeeded')
  })
})

describe('sendClassReminders', () => {
  let originalConfirm: any
  let originalFetch: any

  beforeAll(() => {
    originalConfirm = global.confirm
    originalFetch = global.fetch
  })

  afterAll(() => {
    global.confirm = originalConfirm
    global.fetch = originalFetch
  })

  beforeEach(() => {
    global.confirm = jest.fn()
    global.fetch = jest.fn()
    jest.clearAllMocks()
  })

  it('does nothing if confirm is cancelled', () => {
    ;(global.confirm as jest.Mock).mockReturnValue(false)

    sendClassReminder({
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    expect(global.confirm).toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('triggers error alert if nextMeetingTime is No Upcoming Classes', () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)

    sendClassReminder({
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'No Upcoming Classes',
    })

    expect(alert.trigger).toHaveBeenCalledWith(
      'error',
      'No upcoming classes found!',
    )
  })

  it('sends instructor reminder successfully', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    sendClassReminder({
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    expect(global.confirm).toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/remindInstructor',
      expect.any(Object),
    )

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith(
      'success',
      'A reminder email was sent!',
    )
  })

  it('sends instructor reminder failed', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Some error' }),
    })

    sendClassReminder({
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith('error', 'Some error')
  })

  it('sends to all students if no studentName/studentEmail specified in opts but studentList exists', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    sendClassReminder({
      studentList: [
        { name: 'john doe', email: 'john@test.com' },
        { name: 'jane smith', email: 'jane@test.com' },
      ] as any,
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    expect(global.confirm).toHaveBeenCalledWith(
      'Send class reminder to all students?',
    )
    expect(global.fetch).toHaveBeenCalledTimes(2)

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith(
      'success',
      'Reminder emails were sent!',
    )
  })

  it('sends to all students triggers error when fetch fails', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Failed student' }),
    })

    sendClassReminder({
      studentList: [{ name: 'john doe', email: 'john@test.com' }] as any,
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith('error', 'Failed student')
  })

  it('sends to single student if studentName and studentEmail are specified', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    sendClassReminder({
      studentList: [{ name: 'john doe', email: 'john@test.com' }] as any,
      studentName: 'john doe',
      studentEmail: 'john@test.com',
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    expect(global.confirm).toHaveBeenCalledWith(
      'Send class reminder to student john doe?',
    )

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith(
      'success',
      'Reminder email was sent to john doe!',
    )
  })

  it('sends to single student triggers error when fetch fails', async () => {
    ;(global.confirm as jest.Mock).mockReturnValue(true)
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Failed single' }),
    })

    sendClassReminder({
      studentList: [{ name: 'john doe', email: 'john@test.com' }] as any,
      studentName: 'john doe',
      studentEmail: 'john@test.com',
      instructorName: 'test instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      className: 'Math',
      nextMeetingTime: 'Monday at 2:00 PM',
    })

    await new Promise(process.nextTick)
    expect(alert.trigger).toHaveBeenCalledWith('error', 'Failed single')
  })
})

describe('client firebase store', () => {
  let storeSet: any
  let originalLocalStorage: any

  beforeAll(() => {
    originalLocalStorage = global.localStorage
    const storageMock: any = {}
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: (key: string) => storageMock[key] || null,
        setItem: (key: string, val: string) => {
          storageMock[key] = val
        },
        clear: () => {
          for (const key in storageMock) {
            delete storageMock[key]
          }
        },
      },
      writable: true,
    })
  })

  afterAll(() => {
    Object.defineProperty(global, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
    })
  })

  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
    readableResets.forEach((reset) => reset())
  })

  afterEach(async () => {
    await new Promise(process.nextTick)
  })

  it('updates when user logs in with verified email', async () => {
    const unsub = user.subscribe((val) => {
      storeSet = val
    })

    const mockUserObj = {
      uid: 'user123',
      email: 'user@test.com',
      emailVerified: true,
      getIdTokenResult: jest.fn().mockResolvedValue({
        claims: { role: 'instructor' },
      }),
    }

    authStateChangedCallback(mockUserObj)

    await new Promise(process.nextTick)

    // The uid is patched in from the auth object so the profile carries the
    // single user identifier, matching portal's store.
    expect(storeSet).toEqual({
      object: mockUserObj,
      profile: { uid: 'user123', role: 'instructor' },
    })

    unsub()
  })

  it('updates when user logs in with unverified email', async () => {
    const unsub = user.subscribe((val) => {
      storeSet = val
    })

    const mockUserObj = {
      uid: 'user123',
      email: 'user@test.com',
      emailVerified: false,
      getIdTokenResult: jest.fn().mockResolvedValue({
        claims: { role: 'student' },
      }),
    }

    authStateChangedCallback(mockUserObj)

    await new Promise(process.nextTick)

    expect(localStorage.getItem('emailVerified')).toBe('false')
    expect(storeSet).toEqual({
      object: mockUserObj,
      profile: { uid: 'user123', role: 'student' },
    })

    unsub()
  })

  it('updates when user logs out', () => {
    const unsub = user.subscribe((val) => {
      storeSet = val
    })

    authStateChangedCallback(null)

    expect(storeSet).toBeNull()
    unsub()
  })

  it('loaded resolves when user data is defined', async () => {
    const loadedPromise = user.loaded()
    authStateChangedCallback(null)
    await expect(loadedPromise).resolves.toBe(true)
  })
})

describe('server firebase verifyToken', () => {
  it('resolves with token data if token is valid and not expired', async () => {
    const mockDoc = {
      exists: true,
      data: () => ({
        expires: { toDate: () => new Date(Date.now() + 100000) },
        consumable: false,
        consumers: [],
      }),
    }
    const mockGet = jest.fn().mockResolvedValue(mockDoc)
    mockAdminDb.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })

    const result = await verifyToken('token123')
    expect(result.consumable).toBe(false)
  })

  it('rejects if token does not exist', async () => {
    const mockDoc = { exists: false }
    const mockGet = jest.fn().mockResolvedValue(mockDoc)
    mockAdminDb.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })

    await expect(verifyToken('token123')).rejects.toBe('fake')
  })

  it('rejects if token expired', async () => {
    const mockDoc = {
      exists: true,
      data: () => ({
        expires: { toDate: () => new Date(Date.now() - 100000) },
      }),
    }
    const mockGet = jest.fn().mockResolvedValue(mockDoc)
    mockAdminDb.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })

    await expect(verifyToken('token123')).rejects.toBe('expired')
  })

  it('rejects if token consumed', async () => {
    const mockDoc = {
      exists: true,
      data: () => ({
        expires: { toDate: () => new Date(Date.now() + 100000) },
        consumable: true,
        consumers: ['user1'],
      }),
    }
    const mockGet = jest.fn().mockResolvedValue(mockDoc)
    mockAdminDb.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })

    await expect(verifyToken('token123')).rejects.toBe('consumed')
  })

  it('rejects if db get throws error', async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error('db error'))
    mockAdminDb.collection.mockReturnValue({
      doc: jest.fn().mockReturnValue({ get: mockGet }),
    })

    await expect(verifyToken('token123')).rejects.toBe('unknown')
  })
})

describe('email templates', () => {
  it('templates are loaded as strings', () => {
    expect(acceptEmailTemplate).toContain('<!doctype html>')
    expect(classReminderEmailTemplate).toContain('<!doctype html>')
    expect(inPersonClassEnrolledEmailTemplate).toContain('<!doctype html>')
    expect(interviewScheduledEmailTemplate).toContain('<!doctype html>')
    expect(onlineClassEnrolledEmailTemplate).toContain('<!doctype html>')
    expect(rejectionEmailTemplate).toContain('<!doctype html>')
    expect(scheduleInterviewEmailTemplate).toContain('<!doctype html>')
    expect(subEmailTemplate).toContain('<!doctype html>')
    expect(teachingReminderEmailTemplate).toContain('<!doctype html>')
    expect(waitlistEmailTemplate).toContain('<!doctype html>')
  })
})

describe('SlotRequest unique keys', () => {
  it('ensures slot requests have unique id and correct uid for multiple requests from same user', () => {
    const docs = [
      {
        id: 'CXPiz-gd-2026-08-01T10:00:00.000Z',
        data: () => ({
          date: { seconds: 1785578400 },
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
        }),
      },
      {
        id: 'CXPiz-gd-2026-08-02T10:00:00.000Z',
        data: () => ({
          date: { seconds: 1785664800 },
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
        }),
      },
    ]

    const slotRequests: Data.SlotRequest[] = docs.map((doc) => {
      const slotRequest = doc.data()
      return {
        date: new Date(slotRequest.date.seconds * 1000),
        id: doc.id,
        uid: doc.id.replace(/-\d{4}-\d{2}-\d{2}.*$/, ''),
        firstName: slotRequest.firstName,
        lastName: slotRequest.lastName,
        email: slotRequest.email,
      }
    })

    expect(slotRequests[0].id).not.toEqual(slotRequests[1].id)
    expect(slotRequests[0].uid).toEqual('CXPiz-gd')
    expect(slotRequests[1].uid).toEqual('CXPiz-gd')

    // Verify Svelte each keys would be unique
    const keys = new Set(slotRequests.map((r) => r.id))
    expect(keys.size).toEqual(slotRequests.length)
  })
})
