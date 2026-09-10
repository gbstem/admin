jest.mock(
  'svelte/store',
  () => ({
    writable: (val: any) => ({
      subscribe: (fn: any) => {
        fn(val)
        return () => {}
      },
      set: () => {},
      update: () => {},
    }),
    readable: (val: any) => ({
      subscribe: (fn: any) => {
        fn(val)
        return () => {}
      },
    }),
    get: (store: any) => {
      let val: any
      store.subscribe((v: any) => {
        val = v
      })()
      return val
    },
  }),
  { virtual: true },
)

// Mock SvelteKit
jest.mock(
  '@sveltejs/kit',
  () => ({
    error: (status: number, message: any) => ({
      status,
      message,
      __isSvelteKitError: true,
    }),
    redirect: (status: number, location: string) => ({
      status,
      location,
      __isSvelteKitRedirect: true,
    }),
    json: (body: any, init?: any) => ({ body, init, __isSvelteKitJson: true }),
    fail: (status: number, data: any) => ({
      status,
      data,
      __isSvelteKitFail: true,
    }),
    isHttpError: (err: any) =>
      err && (err.__isSvelteKitError || (err.status && err.body)),
  }),
  { virtual: true },
)

// Mock lodash-es
jest.mock(
  'lodash-es',
  () => ({
    capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
    lowerCase: (str: string) => str.replace(/[-_]/g, ' ').toLowerCase(),
    at: (array: any[], index: number) => array[index],
  }),
  { virtual: true },
)

// Mock algoliasearch
const mockSearchSingleIndex = jest.fn().mockResolvedValue({ hits: [] })
jest.mock('algoliasearch', () => {
  return {
    algoliasearch: jest.fn().mockReturnValue({
      searchSingleIndex: mockSearchSingleIndex,
    }),
  }
})

// Mock firebase-admin
const mockAdminAuth = {
  verifyIdToken: jest.fn(),
  createSessionCookie: jest.fn(),
  verifySessionCookie: jest.fn(),
  getUser: jest.fn(),
  getUsers: jest.fn().mockResolvedValue({ users: [] }),
  createUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
  deleteUser: jest.fn(),
  generateEmailVerificationLink: jest.fn().mockResolvedValue('http://link'),
  generateVerifyAndChangeEmailLink: jest.fn().mockResolvedValue('http://link'),
  generatePasswordResetLink: jest.fn().mockResolvedValue('http://link'),
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
  ;(console.error as any).mockRestore?.()
  ;(console.warn as any).mockRestore?.()
})

const mockDoc = (id = 'id123') => ({
  id,
  exists: true,
  data: () => ({
    html: 'Hello {{action.link}}',
    checkedIn: true,
    checkedInAt: { toDate: () => new Date() },
    food: {},
  }),
  get: jest.fn().mockResolvedValue({
    exists: true,
    data: () => ({
      html: 'Hello {{action.link}}',
      checkedIn: true,
      checkedInAt: { toDate: () => new Date() },
      food: {},
    }),
  }),
  update: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue(undefined),
})

const mockCollection = {
  get: jest.fn().mockResolvedValue({
    docs: [
      {
        id: 'doc1',
        data: () => ({
          expires: { toDate: () => new Date() },
          timestamps: {
            updated: { toDate: () => new Date() },
            created: { toDate: () => new Date() },
          },
          meta: {
            decided: true,
          },
          attendanceList: { '1': { present: true } },
          meetingTimes: [],
          classDay1: 'Monday',
          classDay2: 'Wednesday',
          classTime1: '14:00',
          classTime2: '16:00',
          instructorFirstName: 'First',
          instructorLastName: 'Last',
          instructorEmail: 'inst@test.com',
          course: 'Math I',
          students: [],
          meetingLink: 'http://link',
          classStatuses: [],
        }),
      },
    ],
  }),
  doc: jest.fn().mockImplementation((id) => mockDoc(id)),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  startAfter: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  add: jest.fn().mockResolvedValue({ id: 'new-mail-id' }),
}

const mockAdminDb = {
  collection: jest.fn().mockReturnValue(mockCollection),
  doc: jest.fn().mockImplementation((id) => mockDoc(id)),
}

// Shared helper for exercising the `catch` branch of a +page.server.ts load
// function's Firestore query, which none of the route tests below covered
// before: `mockCollection.get` is swapped for a rejecting mock just for the
// duration of `fn`, then restored, following the same save/restore pattern
// already used by the "loads empty list when course has no classes" test.
async function withRejectedCollectionGet(fn: () => Promise<void>) {
  const original = mockCollection.get
  mockCollection.get = jest.fn().mockRejectedValue(new Error('Firestore boom'))
  try {
    await fn()
  } finally {
    mockCollection.get = original
  }
}

jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => mockAdminAuth),
}))

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => mockAdminDb),
  FieldValue: {
    arrayUnion: jest.fn((...val) => val),
  },
}))

// Mock verifyToken from $lib/server/firebase
jest.mock('$lib/server/firebase', () => ({
  adminAuth: mockAdminAuth,
  adminDb: mockAdminDb,
  verifyToken: jest.fn().mockResolvedValue({ role: 'admin' }),
  toDateSafe: jest.fn((timestamp, docId, field) => {
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate()
    }
    console.error(
      `[Firestore Data Error] doc ${docId} has a null/missing "${field}" timestamp; falling back to epoch.`,
    )
    return new Date(0)
  }),
}))

// Mocks for firebase/app, auth, firestore, storage
jest.mock('firebase/app', () => ({ initializeApp: jest.fn() }))
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  onAuthStateChanged: jest.fn(),
}))
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  collection: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  arrayUnion: jest.fn((...val) => val),
  Timestamp: class {
    constructor(
      public seconds: number,
      public nanoseconds: number,
    ) {}
    toDate() {
      return new Date(this.seconds * 1000)
    }
  },
}))
jest.mock('firebase/storage', () => ({ getStorage: jest.fn() }))

// Import routes
import { verifyToken } from '$lib/server/firebase'
import { handle } from '../src/hooks.server'
import { currentSemester } from '../src/lib/data/collections'
import { load as emailVerifiedLayoutLoad } from '../src/routes/(signedIn)/(emailVerified)/+layout.server'
import { load as announcementsLoad } from '../src/routes/(signedIn)/(emailVerified)/announcements/+page.server'
import { load as applicationsLoad } from '../src/routes/(signedIn)/(emailVerified)/applications/+page.server'
import { load as classesLoad } from '../src/routes/(signedIn)/(emailVerified)/classes/+page.server'
import { load as instructorFeedbackLoad } from '../src/routes/(signedIn)/(emailVerified)/instructor-feedback/+page.server'
import { load as registrationsLoad } from '../src/routes/(signedIn)/(emailVerified)/registrations/+page.server'
import { load as studentFeedbackLoad } from '../src/routes/(signedIn)/(emailVerified)/student-feedback/+page.server'
import { load as studentsLoad } from '../src/routes/(signedIn)/(emailVerified)/students/+page.server'
import { load as subRequestsLoad } from '../src/routes/(signedIn)/(emailVerified)/sub-requests/+page.server'
import { load as tokensLoad } from '../src/routes/(signedIn)/(emailVerified)/tokens/+page.server'
import { load as signedInLayoutLoad } from '../src/routes/(signedIn)/+layout.server'
import { load as signedOutLayoutLoad } from '../src/routes/(signedOut)/+layout.server'
import {
  actions as signupActions,
  load as signupLoad,
} from '../src/routes/(signedOut)/signup/+page.server'
import { load as pageLoad } from '../src/routes/+page'
import {
  DELETE as authDELETE,
  POST as authPOST,
} from '../src/routes/api/auth/+server'

import MailService from '@sendgrid/mail'
import { POST as actionPOST } from '../src/routes/api/action/+server'
import { POST as assignInterviewPOST } from '../src/routes/api/assignInterview/+server'
import { POST as decisionPOST } from '../src/routes/api/decision/+server'
import { POST as enrollPOST } from '../src/routes/api/enroll/+server'
import { POST as remindInstructorPOST } from '../src/routes/api/remindInstructor/+server'
import { POST as remindStudentsPOST } from '../src/routes/api/remindStudents/+server'
import { POST as scheduleInterviewPOST } from '../src/routes/api/scheduleInterview/+server'

describe('routes load tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('+page.ts load throws redirect', () => {
    expect(() => pageLoad()).toThrow(
      expect.objectContaining({ __isSvelteKitRedirect: true }),
    )
  })

  it('signedIn layout load redirects if no user', () => {
    expect(() => signedInLayoutLoad({ locals: { user: null } } as any)).toThrow(
      expect.objectContaining({ __isSvelteKitRedirect: true }),
    )
  })

  it('signedIn layout load returns user if present', () => {
    const res = signedInLayoutLoad({
      locals: { user: { role: 'admin' } },
    } as any)
    expect(res).toEqual({ user: { role: 'admin' } })
  })

  it('emailVerified layout load redirects if user email not verified', async () => {
    const parent = jest.fn().mockResolvedValue({})
    await expect(
      emailVerifiedLayoutLoad({
        parent,
        locals: { user: { emailVerified: false } },
      } as any),
    ).rejects.toEqual(expect.objectContaining({ __isSvelteKitRedirect: true }))
  })

  it('emailVerified layout load resolves if email verified', async () => {
    const parent = jest.fn().mockResolvedValue({})
    await expect(
      emailVerifiedLayoutLoad({
        parent,
        locals: { user: { emailVerified: true } },
      } as any),
    ).resolves.toBeUndefined()
  })

  it('signedOut layout load redirects if user logged in', () => {
    expect(() =>
      signedOutLayoutLoad({ locals: { user: { role: 'admin' } } } as any),
    ).toThrow(expect.objectContaining({ __isSvelteKitRedirect: true }))
  })

  it('signedOut layout load does not redirect if no user', () => {
    expect(
      signedOutLayoutLoad({ locals: { user: null } } as any),
    ).toBeUndefined()
  })
})

describe('applications route', () => {
  it('loads applications without search query', async () => {
    const url = new URL('http://localhost/?filter=undecided')
    const res = await applicationsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('applications')
  })

  it('loads applications with search query', async () => {
    const url = new URL('http://localhost/?query=test')
    const res = await applicationsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('applications')
  })

  it('queries the requested past semester when ?semester= is a known id', async () => {
    const url = new URL('http://localhost/?filter=complete&semester=Fall25')
    await applicationsLoad({ url, depends: jest.fn() } as any)
    expect(mockAdminDb.collection).toHaveBeenCalledWith(
      'semesters/Fall25/applications',
    )
  })

  it('falls back to the current semester when ?semester= is unknown', async () => {
    const url = new URL(
      'http://localhost/?filter=complete&semester=NotASemester',
    )
    await applicationsLoad({ url, depends: jest.fn() } as any)
    expect(mockAdminDb.collection).toHaveBeenCalledWith(
      `semesters/${currentSemester}/applications`,
    )
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?filter=undecided')
      await expect(
        applicationsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  // `searchIndex()` (src/lib/server/search.ts) always uses its local
  // Firestore-backed fallback under Jest (NODE_ENV=test), never the real
  // Algolia client - so the search branch's catch block is only reachable
  // by making the local fallback's own `adminDb...get()` call fail, not by
  // rejecting the (unused-in-tests) Algolia mock.
  it('throws a 500 when the local fallback search fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?query=test')
      await expect(
        applicationsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('classes route', () => {
  it('loads classes without search query', async () => {
    const url = new URL('http://localhost/?filter=Python+I')
    const res = await classesLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('classes')
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?filter=Python+I')
      await expect(
        classesLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  // See the applications-route comment above: searchIndex() always runs its
  // local Firestore fallback under Jest, so the search branch's catch is
  // reached via the same adminDb...get() failure, not an Algolia rejection.
  it('throws a 500 when the local fallback search fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?query=test')
      await expect(
        classesLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  it('loads classes with search query', async () => {
    const url = new URL('http://localhost/?query=test')
    const res = await classesLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('classes')
  })
})

describe('instructor-feedback route', () => {
  it('loads instructor feedback', async () => {
    const url = new URL('http://localhost/?filter=Scratch')
    const res = await instructorFeedbackLoad({
      url,
      depends: jest.fn(),
      locals: { user: { role: 'admin' } },
    } as any)
    expect(res).toHaveProperty('feedback')
  })

  it('loads instructor feedback with search query', async () => {
    const url = new URL('http://localhost/?query=test')
    const res = await instructorFeedbackLoad({
      url,
      depends: jest.fn(),
      locals: { user: { role: 'admin' } },
    } as any)
    expect(res).toHaveProperty('feedback')
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?filter=Scratch')
      await expect(
        instructorFeedbackLoad({
          url,
          depends: jest.fn(),
          locals: { user: { role: 'admin' } },
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  it('throws a 500 when the local fallback search fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?query=test')
      await expect(
        instructorFeedbackLoad({
          url,
          depends: jest.fn(),
          locals: { user: { role: 'admin' } },
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('registrations route', () => {
  it('loads registrations without search query', async () => {
    const url = new URL('http://localhost/?filter=enrolled')
    const res = await registrationsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('registrations')
  })

  it('loads registrations with search query', async () => {
    const url = new URL('http://localhost/?query=test')
    const res = await registrationsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('registrations')
  })

  it('queries the requested past semester when ?semester= is a known id', async () => {
    const url = new URL('http://localhost/?filter=enrolled&semester=Fall25')
    await registrationsLoad({ url, depends: jest.fn() } as any)
    expect(mockAdminDb.collection).toHaveBeenCalledWith(
      'semesters/Fall25/registrations',
    )
  })

  it('falls back to the current semester when ?semester= is unknown', async () => {
    const url = new URL(
      'http://localhost/?filter=enrolled&semester=NotASemester',
    )
    await registrationsLoad({ url, depends: jest.fn() } as any)
    expect(mockAdminDb.collection).toHaveBeenCalledWith(
      `semesters/${currentSemester}/registrations`,
    )
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?filter=enrolled')
      await expect(
        registrationsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  it('throws a 500 when the local fallback search fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?query=test')
      await expect(
        registrationsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('students route', () => {
  it('loads students without search query', async () => {
    const url = new URL('http://localhost/?filter=submitted')
    const res = await studentsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('registrations')
  })

  it('loads students with search query', async () => {
    const url = new URL('http://localhost/?query=test')
    const res = await studentsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('registrations')
  })

  it('loads students filtered by course', async () => {
    const url = new URL('http://localhost/?course=Math+I')
    const res = await studentsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('registrations')
  })

  it('loads empty list when course has no classes', async () => {
    const url = new URL('http://localhost/?course=Nonexistent+Course')
    const originalGet = mockCollection.get
    mockCollection.get = jest.fn().mockResolvedValue({ docs: [] })
    try {
      const res = await studentsLoad({ url, depends: jest.fn() } as any)
      expect(res).toHaveProperty('registrations')
      expect(res.registrations).toHaveLength(0)
    } finally {
      mockCollection.get = originalGet
    }
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?filter=submitted')
      await expect(
        studentsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  it('throws a 500 when the local fallback search fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?query=test')
      await expect(
        studentsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('student-feedback route', () => {
  it('loads student feedback without search query', async () => {
    const url = new URL('http://localhost/?filter=Scratch')
    const res = await studentFeedbackLoad({
      url,
      depends: jest.fn(),
      locals: { user: { role: 'admin' } },
    } as any)
    expect(res).toHaveProperty('feedback')
  })

  it('loads student feedback with search query', async () => {
    const url = new URL('http://localhost/?query=test')
    const res = await studentFeedbackLoad({
      url,
      depends: jest.fn(),
      locals: { user: { role: 'admin' } },
    } as any)
    expect(res).toHaveProperty('feedback')
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?filter=Scratch')
      await expect(
        studentFeedbackLoad({
          url,
          depends: jest.fn(),
          locals: { user: { role: 'admin' } },
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  it('throws a 500 when the local fallback search fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?query=test')
      await expect(
        studentFeedbackLoad({
          url,
          depends: jest.fn(),
          locals: { user: { role: 'admin' } },
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('sub-requests route', () => {
  it('loads sub requests without search query', async () => {
    const url = new URL('http://localhost/?filter=Scratch')
    const res = await subRequestsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('subRequests')
  })

  it('loads sub requests with search query', async () => {
    const url = new URL('http://localhost/?query=test')
    const res = await subRequestsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('subRequests')
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?filter=Scratch')
      await expect(
        subRequestsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })

  it('throws a 500 when the local fallback search fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/?query=test')
      await expect(
        subRequestsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('announcements route', () => {
  it('loads announcements', async () => {
    const url = new URL('http://localhost/')
    const res = await announcementsLoad({ url, depends: jest.fn() } as any)
    expect(res).toHaveProperty('announcements')
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      const url = new URL('http://localhost/')
      await expect(
        announcementsLoad({ url, depends: jest.fn() } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('tokens route', () => {
  it('loads tokens for admin user', async () => {
    const res = await tokensLoad({
      depends: jest.fn(),
      locals: { user: { role: 'admin' } },
      url: new URL('http://localhost/'),
    } as any)
    expect(res).toHaveProperty('tokens')
  })

  it('handles invalid or empty limit and page query parameters gracefully', async () => {
    const res = await tokensLoad({
      depends: jest.fn(),
      locals: { user: { role: 'admin' } },
      url: new URL('http://localhost/?page=&limit='),
    } as any)
    expect(res).toHaveProperty('tokens')
    expect(res.page).toBe(1)
    expect(res.limit).toBe(25)
  })

  it('throws error for non-admin user', async () => {
    await expect(
      tokensLoad({
        depends: jest.fn(),
        locals: { user: { role: 'instructor' } },
        url: new URL('http://localhost/'),
      } as any),
    ).rejects.toEqual(expect.objectContaining({ __isSvelteKitError: true }))
  })

  it('throws a 500 when the database query fails', async () => {
    await withRejectedCollectionGet(async () => {
      await expect(
        tokensLoad({
          depends: jest.fn(),
          locals: { user: { role: 'admin' } },
          url: new URL('http://localhost/'),
        } as any),
      ).rejects.toEqual(
        expect.objectContaining({ status: 500, __isSvelteKitError: true }),
      )
    })
  })
})

describe('signup load and actions', () => {
  it('signup load redirects to signin if no token', async () => {
    const url = new URL('http://localhost/')
    await expect(signupLoad({ url } as any)).rejects.toEqual(
      expect.objectContaining({ __isSvelteKitRedirect: true }),
    )
  })

  it('signup load returns token if token is valid', async () => {
    const url = new URL('http://localhost/?token=token123')
    const res = await signupLoad({ url } as any)
    expect(res).toEqual({ token: 'token123', tokenError: null })
  })

  // A stale registration link (expired, or already used) has to render the
  // signup page with a user-visible notification, not the generic error
  // boundary a thrown SvelteKit `error()` would produce - see the comment on
  // `load` in +page.server.ts for the production report this covers.
  it('signup load returns a tokenError for a consumed token', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('consumed')
    const url = new URL('http://localhost/?token=usedToken')
    const res = await signupLoad({ url } as any)
    expect(res).toEqual({
      token: null,
      tokenError: expect.stringContaining('already consumed'),
    })
  })

  it('signup load returns a tokenError for an expired token', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('expired')
    const url = new URL('http://localhost/?token=oldToken')
    const res = await signupLoad({ url } as any)
    expect(res).toEqual({
      token: null,
      tokenError: expect.stringContaining('expired'),
    })
  })

  it('signup load redirects to signin for a fake token', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('fake')
    const url = new URL('http://localhost/?token=fakeToken')
    await expect(signupLoad({ url } as any)).rejects.toEqual(
      expect.objectContaining({ __isSvelteKitRedirect: true }),
    )
  })

  it('signup load returns a tokenError for an unrecognized verification failure', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('unknown')
    const url = new URL('http://localhost/?token=weirdToken')
    const res = await signupLoad({ url } as any)
    expect(res).toEqual({
      token: null,
      tokenError: 'Something went wrong. Please try again.',
    })
  })

  function mockSignupRequest() {
    const mockFormData = new Map<string, any>([
      ['email', 'test@test.com'],
      ['first-name', 'John'],
      ['last-name', 'Doe'],
      ['password', 'pass123'],
      ['confirm-password', 'pass123'],
      ['token', 'token123'],
    ])
    return {
      formData: jest.fn().mockResolvedValue({
        get: (key: string) => mockFormData.get(key),
      }),
    }
  }

  it('signup default action creates user successfully', async () => {
    mockAdminAuth.createUser.mockResolvedValue({ uid: 'newUid123' })

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)
    expect(res).toEqual({ success: true })
    expect(mockAdminAuth.setCustomUserClaims).toHaveBeenCalledWith(
      'newUid123',
      { role: 'admin' },
    )
  })

  it('signup writes the users profile document, matching portal', async () => {
    mockAdminAuth.createUser.mockResolvedValue({ uid: 'newUid123' })
    const usersDoc = mockDoc('newUid123')
    mockAdminDb.collection.mockImplementation((name: string) =>
      name === 'users'
        ? ({ doc: () => usersDoc } as any)
        : (mockCollection as any),
    )

    await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    expect(usersDoc.set).toHaveBeenCalledWith({
      role: 'admin',
      firstName: 'John',
      lastName: 'Doe',
    })
    mockAdminDb.collection.mockReturnValue(mockCollection)
  })

  it('signup rolls the auth user back when a downstream step fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminAuth.createUser.mockResolvedValue({ uid: 'newUid123' })
    mockAdminAuth.setCustomUserClaims.mockRejectedValueOnce(
      new Error('claim failed'),
    )
    mockAdminAuth.deleteUser.mockResolvedValue(undefined)

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    expect(mockAdminAuth.deleteUser).toHaveBeenCalledWith('newUid123')
    expect(res).toEqual(
      expect.objectContaining({
        data: { error: 'Account setup failed. Please try again.' },
      }),
    )
    errorSpy.mockRestore()
  })

  it('signup still succeeds when the verification email fails to send', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockAdminAuth.createUser.mockResolvedValue({ uid: 'newUid123' })
    mockAdminAuth.deleteUser.mockClear()
    mockAdminAuth.generateEmailVerificationLink.mockRejectedValueOnce(
      new Error('mail down'),
    )

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    // A mail hiccup must not destroy an otherwise good account, but the
    // client needs to know the email never went out.
    expect(res).toEqual({ success: true, emailWarning: true })
    expect(mockAdminAuth.deleteUser).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('signup default action fails without creating an account when Auth user creation itself fails', async () => {
    mockAdminAuth.createUser.mockRejectedValueOnce({
      message: 'The email address is already in use.',
    })
    mockAdminAuth.deleteUser.mockClear()

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    expect(res).toEqual(
      expect.objectContaining({
        data: { error: 'The email address is already in use.' },
      }),
    )
    // No account was created, so there's nothing to roll back.
    expect(mockAdminAuth.deleteUser).not.toHaveBeenCalled()
  })

  it('signup default action fails gracefully for a consumed token', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('consumed')

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    expect(res).toEqual(
      expect.objectContaining({
        data: {
          error:
            'Token already consumed. If this token was meant specifically for your account, immediately contact an admin with this message.',
        },
      }),
    )
  })

  it('signup default action fails gracefully for an expired token', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('expired')

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    expect(res).toEqual(
      expect.objectContaining({
        data: {
          error:
            'Token has expired. If you need a new token, contact an admin.',
        },
      }),
    )
  })

  it('signup default action fails gracefully for a fake token', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('fake')

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    expect(res).toEqual(
      expect.objectContaining({
        data: { error: 'Something went wrong. Please try again.' },
      }),
    )
  })

  it('signup default action fails gracefully for an unrecognized verification failure', async () => {
    ;(verifyToken as jest.Mock).mockRejectedValueOnce('unknown')

    const res = await signupActions.default({
      request: mockSignupRequest() as any,
    } as any)

    expect(res).toEqual(
      expect.objectContaining({
        data: { error: 'Something went wrong. Please try again.' },
      }),
    )
  })
})

describe('API routes POST endpoints', () => {
  let mockRequest: any

  beforeEach(() => {
    mockRequest = {
      json: jest.fn(),
    }
  })

  it('actionPOST verifyEmail successfully', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'verifyEmail',
      email: 'test@test.com',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'test@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('actionPOST changeEmail successfully', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'changeEmail',
      newEmail: 'new@test.com',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'old@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('actionPOST resetPassword successfully', async () => {
    mockRequest.json.mockResolvedValue({
      type: 'resetPassword',
      email: 'test@test.com',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: null },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.generatePasswordResetLink).toHaveBeenCalledWith(
      'test@test.com',
    )
  })

  it('actionPOST resetPassword ignores a signed-in caller-supplied email and uses their own', async () => {
    // A signed-in caller can only reset their own password - otherwise a
    // logged-in attacker could target any other account by supplying its
    // email here, the same hole changeEmail/verifyEmail don't have because
    // they read the email off the session rather than the request body.
    mockRequest.json.mockResolvedValue({
      type: 'resetPassword',
      email: 'victim@test.com',
    })
    const res = await actionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'attacker@test.com', role: 'student' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.generatePasswordResetLink).toHaveBeenCalledWith(
      'attacker@test.com',
    )
  })

  it('assignInterviewPOST successfully with legacy payload (intervieweeEmail without intervieweeUid)', async () => {
    mockRequest.json.mockResolvedValue({
      email: 'interviewer@test.com',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Interviewee',
      intervieweeEmail: 'interviewee@test.com',
    })
    const res = await assignInterviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['interviewee@test.com'],
      }),
    )
  })

  it('assignInterviewPOST resolves interviewee email via intervieweeUid', async () => {
    mockAdminAuth.getUser.mockImplementation(async (uid: string) => {
      if (uid === 'interviewer-uid-1') {
        return { uid, email: 'interviewer@test.com' }
      }
      if (uid === 'interviewee-uid-1') {
        return { uid, email: 'updated-interviewee@test.com' }
      }
      return { uid }
    })
    mockRequest.json.mockResolvedValue({
      email: 'fallback-interviewer@test.com',
      interviewerUid: 'interviewer-uid-1',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Interviewee',
      intervieweeUid: 'interviewee-uid-1',
      intervieweeEmail: 'stale@test.com',
    })
    const res = await assignInterviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('interviewee-uid-1')
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['updated-interviewee@test.com'],
      }),
    )
  })

  it('assignInterviewPOST accepts a uid-only payload with no email fields', async () => {
    // The shape the current client sends after the uid migration.
    mockAdminAuth.getUser.mockImplementation(async (uid: string) => {
      if (uid === 'interviewer-uid-1') {
        return { uid, email: 'interviewer@test.com' }
      }
      return { uid, email: 'interviewee@test.com' }
    })
    mockRequest.json.mockResolvedValue({
      interviewerUid: 'interviewer-uid-1',
      intervieweeUid: 'interviewee-uid-1',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Interviewee',
    })
    const res = await assignInterviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['interviewee@test.com'],
        cc: ['interviewer@test.com'],
      }),
    )
  })

  it('assignInterviewPOST rejects a payload with neither interviewerUid nor email', async () => {
    mockRequest.json.mockResolvedValue({
      intervieweeUid: 'interviewee-uid-1',
      date: '2026-06-01',
      link: 'http://zoom',
      interviewer: 'Interviewer',
      firstName: 'Interviewee',
    })
    await expect(
      assignInterviewPOST({
        request: mockRequest as any,
        locals: { user: { email: 'admin@test.com', role: 'admin' } },
      } as any),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('decisionPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      applicationId: 'app123',
      likelyDecision: 'likely',
      decision: 'accepted',
      name: 'Applicant',
      email: 'app@test.com',
      notes: 'notes',
    })
    const res = await decisionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('decisionPOST resolves the recipient from applicantUid, ignoring any stale address', async () => {
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'applicant-uid-1',
      email: 'current@test.com',
    })
    mockRequest.json.mockResolvedValue({
      applicantUid: 'applicant-uid-1',
      decision: 'accepted',
      name: 'Applicant',
    })
    const res = await decisionPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('applicant-uid-1')
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['current@test.com'] }),
    )
  })

  it('decisionPOST rejects a payload with neither applicantUid nor email', async () => {
    mockRequest.json.mockResolvedValue({
      decision: 'accepted',
      name: 'Applicant',
    })
    await expect(
      decisionPOST({
        request: mockRequest as any,
        locals: { user: { email: 'admin@test.com', role: 'admin' } },
      } as any),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('scheduleInterviewPOST resolves the recipient from applicantUid', async () => {
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'applicant-uid-2',
      email: 'current-applicant@test.com',
    })
    mockRequest.json.mockResolvedValue({
      applicantUid: 'applicant-uid-2',
      name: 'Applicant',
      deadline: 'Sep 8',
    })
    const res = await scheduleInterviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('applicant-uid-2')
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['current-applicant@test.com'] }),
    )
  })

  it('scheduleInterviewPOST rejects a payload with neither applicantUid nor email', async () => {
    mockRequest.json.mockResolvedValue({ name: 'Applicant', deadline: 'Sep 8' })
    await expect(
      scheduleInterviewPOST({
        request: mockRequest as any,
        locals: { user: { email: 'admin@test.com', role: 'admin' } },
      } as any),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('enrollPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      email: 'student@test.com',
      firstName: 'StudentFirst',
      instructor: 'InstructorName',
      instructorEmail: 'inst@test.com',
      classTimes: ['14:00', '16:00'],
      classDays: ['Monday', 'Wednesday'],
      course: 'Math',
      studentName: 'StudentFull',
      online: true,
    })
    const res = await enrollPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('enrollPOST successfully resolves instructor email via instructorUid', async () => {
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'inst-uid-1',
      email: 'inst-from-uid@test.com',
    })
    mockRequest.json.mockResolvedValue({
      email: 'student@test.com',
      firstName: 'StudentFirst',
      instructor: 'InstructorName',
      instructorUid: 'inst-uid-1',
      classTimes: ['14:00', '16:00'],
      classDays: ['Monday', 'Wednesday'],
      course: 'Math',
      studentName: 'StudentFull',
      online: true,
    })
    const res = await enrollPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('inst-uid-1')
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ['inst-from-uid@test.com'] }),
    )
  })

  it('remindInstructorPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      name: 'Instructor',
      email: 'inst@test.com',
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
      otherInstructorUids: [],
    })
    const res = await remindInstructorPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('remindInstructorPOST resolves primary instructor email via instructorUid', async () => {
    mockAdminAuth.getUser.mockResolvedValueOnce({
      uid: 'inst-uid-1',
      email: 'resolved-inst@test.com',
    })
    mockRequest.json.mockResolvedValue({
      name: 'Instructor',
      instructorUid: 'inst-uid-1',
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
      otherInstructorUids: [],
    })
    const res = await remindInstructorPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.getUser).toHaveBeenCalledWith('inst-uid-1')
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['resolved-inst@test.com'] }),
    )
  })

  it('remindStudentsPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      name: 'Student',
      email: 'student@test.com',
      instructorName: 'Instructor',
      instructorEmail: 'inst@test.com',
      otherInstructorUids: [],
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
    })
    const res = await remindStudentsPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('remindInstructorPOST resolves otherInstructorUids to current emails, dropping a uid with no account', async () => {
    mockAdminAuth.getUsers.mockResolvedValueOnce({
      users: [{ uid: 'cohost-uid', email: 'cohost@test.com' }],
    })
    mockRequest.json.mockResolvedValue({
      name: 'Instructor',
      email: 'inst@test.com',
      class: 'Math',
      classTime: 'Monday at 2:00 PM',
      otherInstructorUids: ['cohost-uid', 'deleted-uid'],
    })
    const res = await remindInstructorPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
    expect(mockAdminAuth.getUsers).toHaveBeenCalledWith([
      { uid: 'cohost-uid' },
      { uid: 'deleted-uid' },
    ])
    expect(MailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ['cohost@test.com'] }),
    )
  })

  it('scheduleInterviewPOST successfully', async () => {
    mockRequest.json.mockResolvedValue({
      email: 'app@test.com',
      link: 'http://schedule',
      name: 'Applicant',
    })
    const res = await scheduleInterviewPOST({
      request: mockRequest as any,
      locals: { user: { email: 'admin@test.com', role: 'admin' } },
    } as any)
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })
})

describe('hooks.server.ts handle', () => {
  let event: any
  let resolve: any

  beforeEach(() => {
    event = {
      cookies: {
        get: jest.fn(),
      },
      locals: {},
    }
    resolve = jest.fn().mockResolvedValue('resolved-response')
  })

  it('resolves handle successfully for admin', async () => {
    event.cookies.get.mockReturnValue('sessionCookie123')
    mockAdminAuth.verifySessionCookie.mockResolvedValue({ uid: 'uid123' })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      email: 'admin@test.com',
      emailVerified: true,
      customClaims: { role: 'admin' },
    })

    const res = await handle({ event, resolve } as any)
    expect(res).toBe('resolved-response')
    expect(event.locals.user).toEqual({
      uid: 'uid123',
      email: 'admin@test.com',
      emailVerified: true,
      role: 'admin',
    })
  })

  it('redirects user if role is instructor', async () => {
    event.cookies.get.mockReturnValue('sessionCookie123')
    mockAdminAuth.verifySessionCookie.mockResolvedValue({ uid: 'uid123' })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      email: 'inst@test.com',
      emailVerified: true,
      customClaims: { role: 'instructor' },
    })

    await expect(handle({ event, resolve } as any)).rejects.toEqual(
      expect.objectContaining({
        __isSvelteKitRedirect: true,
        location: 'https://portal.gbstem.org',
      }),
    )
  })

  it('sets user to null on verification error', async () => {
    event.cookies.get.mockReturnValue('sessionCookie123')
    mockAdminAuth.verifySessionCookie.mockRejectedValue(
      new Error('verification failed'),
    )

    const res = await handle({ event, resolve } as any)
    expect(res).toBe('resolved-response')
    expect(event.locals.user).toBeNull()
  })
})

describe('api/auth', () => {
  let mockCookies: any
  let mockRequest: any

  beforeEach(() => {
    mockCookies = {
      set: jest.fn(),
      delete: jest.fn(),
    }
    mockRequest = {
      json: jest.fn(),
    }
  })

  it('POST authenticates user and sets session cookie', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'admin' },
    })
    mockAdminAuth.createSessionCookie.mockResolvedValue('sessionCookieVal')

    const res = await authPOST({
      request: mockRequest,
      cookies: mockCookies,
    } as any)
    expect(mockCookies.set).toHaveBeenCalledWith(
      '__session',
      'sessionCookieVal',
      // cookies.set()'s option is maxAge in *seconds*, not expiresIn in ms -
      // passing expiresIn silently did nothing, so the cookie was never
      // persisted for the intended 7 days.
      {
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: true,
        path: '/',
      },
    )
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })

  it('POST throws 403 if user is a student', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'student' },
    })

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message:
          'Unauthorized: You do not have permission to access the admin site.',
      }),
    )
  })

  it('POST throws 403 if user is an instructor', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'instructor' },
    })

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message:
          'Unauthorized: You do not have permission to access the admin site.',
      }),
    )
  })

  it('POST throws 403 if user has no role claim', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 10,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: {},
    })

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message:
          'Unauthorized: You do not have permission to access the admin site.',
      }),
    )
  })

  it('POST throws error if sign in is not recent', async () => {
    mockRequest.json.mockResolvedValue({ idToken: 'idToken123' })
    mockAdminAuth.verifyIdToken.mockResolvedValue({
      uid: 'uid123',
      auth_time: new Date().getTime() / 1000 - 1000,
    })
    mockAdminAuth.getUser.mockResolvedValue({
      uid: 'uid123',
      customClaims: { role: 'admin' },
    })

    await expect(
      authPOST({ request: mockRequest, cookies: mockCookies } as any),
    ).rejects.toEqual(expect.objectContaining({ __isSvelteKitError: true }))
  })

  it('DELETE logs out user and deletes cookie', async () => {
    const res = await authDELETE({ cookies: mockCookies } as any)
    expect(mockCookies.delete).toHaveBeenCalledWith(
      '__session',
      expect.any(Object),
    )
    expect(res).toEqual(expect.objectContaining({ __isSvelteKitJson: true }))
  })
})
