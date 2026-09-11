import {
  PUBLIC_FIREBASE_API_KEY,
  PUBLIC_FIREBASE_APP_ID,
  PUBLIC_FIREBASE_AUTH_DOMAIN,
  PUBLIC_FIREBASE_MEASUREMENT_ID,
  PUBLIC_FIREBASE_MESSAGE_SENDER_ID,
  PUBLIC_FIREBASE_PROJECT_ID,
  PUBLIC_FIREBASE_STORAGE_BUCKET,
} from '$env/static/public'

import { browser, dev } from '$app/environment'
import { getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  type Auth,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore'
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from 'firebase/storage'
import { readable } from 'svelte/store'

const config = {
  apiKey: PUBLIC_FIREBASE_API_KEY,
  authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: PUBLIC_FIREBASE_MESSAGE_SENDER_ID,
  appId: PUBLIC_FIREBASE_APP_ID,
  measurementId: PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const isBrowser =
  browser || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test')

const app = isBrowser
  ? typeof getApps === 'function' && getApps().length > 0
    ? getApps()[0]
    : initializeApp(config)
  : undefined

export const auth = app ? getAuth(app) : (undefined as unknown as Auth)
// Connect to Firestore in a way that is compatible with the Cypress e2e test proxy.
export const db = app
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : (undefined as unknown as Firestore)
export const storage = app
  ? getStorage(app)
  : (undefined as unknown as FirebaseStorage)

if (isBrowser && dev && auth && db && storage) {
  if (
    PUBLIC_FIREBASE_PROJECT_ID &&
    (PUBLIC_FIREBASE_PROJECT_ID.startsWith('demo-') ||
      PUBLIC_FIREBASE_API_KEY.includes('AIzaSyA1234567890'))
  ) {
    console.log('Connecting Firebase client SDKs to local emulators...')
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099')
      connectFirestoreEmulator(db, '127.0.0.1', 8080)
      connectStorageEmulator(storage, '127.0.0.1', 9199)

      // Force localStorage persistence for proper Cypress session isolation
      setPersistence(auth, browserLocalPersistence)
    } catch (err) {
      console.warn('Failed to connect to Firebase emulators:', err)
    }
  }
}

function userStore() {
  const { subscribe } = readable<Data.User.Store | null | undefined>(
    undefined,
    (set) => {
      if (!isBrowser) return
      return onAuthStateChanged(auth, (userObject) => {
        if (userObject) {
          if (!userObject.emailVerified) {
            localStorage.setItem('emailVerified', 'false')
          }
          // No role here: pages read the one hooks.server.ts verified, as
          // `page.data.user.role`. This used to decode it again from the ID
          // token, which cost a round trip before the store resolved and, when
          // that failed, reported a signed-in user as signed out.
          set({
            object: userObject,
            profile: { uid: userObject.uid },
          })
        } else {
          set(null)
        }
      })
    },
  )
  async function loaded() {
    if (!isBrowser) return true
    return new Promise((resolve) => {
      const unsubscribe = subscribe((userData) => {
        if (userData !== undefined) {
          unsubscribe()
          resolve(true)
        }
      })
    })
  }
  return {
    subscribe,
    loaded,
  }
}

export const user = userStore()
