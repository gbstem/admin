import { afterAll, beforeAll, jest } from '@jest/globals'
import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'

// jsdom omits these Web APIs. `sveltekit-superforms/adapters` loads every
// adapter it ships, including the Effect one, whose base64 helper reaches for
// `TextEncoder` at import time - so any test that touches a superforms-based
// component needs them present, not just tests that encode anything.
// Also absent from jsdom, and superforms clones its initial form data with it
// on every `superForm(...)` call - so without this the component renders its
// error boundary instead of the form.
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = ((value: unknown) =>
    value === undefined
      ? undefined
      : JSON.parse(JSON.stringify(value))) as typeof globalThis.structuredClone
}

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder =
    TextEncoder as unknown as typeof globalThis.TextEncoder
  globalThis.TextDecoder =
    TextDecoder as unknown as typeof globalThis.TextDecoder
}

// Spy on console.log to suppress "Email sent" messages
const originalConsoleLog = console.log
let consoleLogSpy: any

// Route handlers and components intentionally log via console.error/warn
// before re-throwing or falling back (e.g. "[Load Error] ... page load:",
// "[API ... Error]:", signup's rollback logging) - that's how a real user
// would see it in prod logs, but it's noise in test output: it makes
// `yarn test` look like something is broken to someone new to the codebase
// even when every test passes. Jest's own PASS/FAIL reporting is the actual
// signal, so mute both globally rather than chasing every message prefix.
let consoleErrorSpy: any
let consoleWarnSpy: any

beforeAll(() => {
  consoleLogSpy = jest
    .spyOn(console, 'log')
    .mockImplementation((message, ...args) => {
      if (
        typeof message === 'string' &&
        (message.includes('Email sent') || message.includes('[Search]'))
      ) {
        return
      }
      originalConsoleLog(message, ...args)
    })
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterAll(() => {
  if (consoleLogSpy) {
    consoleLogSpy.mockRestore()
  }
  if (consoleErrorSpy) {
    consoleErrorSpy.mockRestore()
  }
  if (consoleWarnSpy) {
    consoleWarnSpy.mockRestore()
  }
})

// Global mock for SvelteKit's public env (src/env.ts)
jest.mock(
  '$app/env/public',
  () => ({
    PUBLIC_FIREBASE_API_KEY: 'apiKey',
    PUBLIC_FIREBASE_AUTH_DOMAIN: 'authDomain',
    PUBLIC_FIREBASE_PROJECT_ID: 'projectId',
    PUBLIC_FIREBASE_STORAGE_BUCKET: 'storageBucket',
    PUBLIC_FIREBASE_MESSAGE_SENDER_ID: 'senderId',
    PUBLIC_FIREBASE_APP_ID: 'appId',
    PUBLIC_FIREBASE_MEASUREMENT_ID: 'measurementId',
  }),
  { virtual: true },
)

// Global mock for SvelteKit's private env (src/env.ts)
jest.mock(
  '$app/env/private',
  () => ({
    FIREBASE_PROJECT_ID: 'projectIdPrivate',
    FIREBASE_CLIENT_EMAIL: 'clientEmail',
    FIREBASE_PRIVATE_KEY: 'privateKey',
    SENDGRID_API_TOKEN: 'sgToken',
    ALGOLIA_APP_ID: 'algoliaApp',
    ALGOLIA_PRIVATE_KEY: 'algoliaKey',
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    STORAGE_EMULATOR_HOST: process.env.STORAGE_EMULATOR_HOST,
  }),
  { virtual: true },
)

// Global mock for SvelteKit Environment Module
jest.mock(
  '$app/env',
  () => ({
    building: false,
    browser: false,
    dev: true,
    version: '1.0.0',
  }),
  { virtual: true },
)

// Global mock for @sendgrid/mail
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn(() => Promise.resolve()),
}))

// Global mock for firebase/app
jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}))

// Global mock for firebase/auth
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({ currentUser: null })),
  onAuthStateChanged: jest.fn((authObj: any, callback: any) => {
    return jest.fn() // unsubscribe
  }),
}))

// Global mock for firebase/firestore
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
    serverTimestamp: jest.fn(() => ({ seconds: 0, nanoseconds: 0 })),
    Timestamp: MockTimestamp,
  }
})

// Global mock for firebase/storage
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn(),
}))

// Global mock for firebase-admin
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
}))

// Global mock for firebase-admin/auth
jest.mock('firebase-admin/auth', () => ({
  getAuth: jest.fn(() => ({
    verifyIdToken: jest.fn(),
    createSessionCookie: jest.fn(),
    verifySessionCookie: jest.fn(),
    getUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
  })),
}))

// Global mock for firebase-admin/firestore
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(),
  })),
  FieldValue: {
    arrayUnion: jest.fn((...val: any[]) => val),
  },
}))

// Global mock for @sveltejs/kit
// `error`/`redirect` THROW rather than return, matching the real package -
// code must write `throw error(...)`/`throw redirect(...)` exactly as it
// would against the real @sveltejs/kit, since relying on these to return a
// value instead of throwing masks real behavior (see hooks.server.ts, which
// had a bug where a non-thrown redirect() was silently swallowed by a
// surrounding try/catch under the old, non-throwing version of this mock).
jest.mock(
  '@sveltejs/kit',
  () => {
    class HttpError extends Error {
      status: number
      body: any
      constructor(status: number, message: any) {
        super(
          typeof message === 'string' ? message : message?.message || 'Error',
        )
        this.status = status
        this.body = typeof message === 'string' ? { message } : message
      }
    }
    class Redirect {
      status: number
      location: string
      constructor(status: number, location: string) {
        this.status = status
        this.location = location
      }
    }
    return {
      error: (status: number, message: any): never => {
        throw new HttpError(status, message)
      },
      isHttpError: (err: any): boolean => err instanceof HttpError,
      redirect: (status: number, location: string): never => {
        throw new Redirect(status, location)
      },
      isRedirect: (err: any): boolean => err instanceof Redirect,
      fail: (status: number, data: any) => ({
        status,
        data,
        __isSvelteKitFail: true,
      }),
    }
  },
  { virtual: true },
)

if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function () {
    return {
      finished: Promise.resolve(),
      cancel: () => {},
      onfinish: null,
    } as any
  }
}
