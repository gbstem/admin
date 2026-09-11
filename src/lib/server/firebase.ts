import { building } from '$app/environment'
import { env } from '$env/dynamic/private'
import {
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_PROJECT_ID,
} from '$env/static/private'
import { tokenRejection } from '$lib/helpers/signupTokens'
import { cleanEnvVar } from '$lib/utils'

// Copy and clean emulator environment variables to process.env so firebase-admin can detect them
const authHost = cleanEnvVar(
  env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST,
)
const firestoreHost = cleanEnvVar(
  env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST,
)
const storageHost = cleanEnvVar(
  env.STORAGE_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST,
)

if (authHost) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost
}
if (firestoreHost) {
  process.env.FIRESTORE_EMULATOR_HOST = firestoreHost
}
if (storageHost) {
  process.env.STORAGE_EMULATOR_HOST = storageHost
}

import firebase from 'firebase-admin'
import { getAuth, type Auth } from 'firebase-admin/auth'
import {
  CollectionReference,
  DocumentReference,
  getFirestore,
  Query,
  type Firestore,
  type Timestamp,
} from 'firebase-admin/firestore'

// Wrap prototype methods with a timeout and error logger
function wrapPrototypePromise(
  Class: any,
  methodName: string,
  className: string,
) {
  if (!Class || !Class.prototype) return
  const original = Class.prototype[methodName]
  if (typeof original !== 'function') return

  Class.prototype[methodName] = function (...args: any[]) {
    const promise = original.apply(this, args)
    if (!(promise instanceof Promise)) {
      return promise
    }

    const timeoutMs = 10000
    let timer: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Firestore operation timed out on ${className}.${methodName}`,
          ),
        )
      }, timeoutMs)
    })

    return Promise.race([promise, timeoutPromise])
      .then((val) => {
        clearTimeout(timer)
        return val
      })
      .catch((err) => {
        clearTimeout(timer)
        console.error(`[Firestore Error] ${className}.${methodName}:`, err)
        throw err
      })
  }
}

// Apply wraps
wrapPrototypePromise(DocumentReference, 'get', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'set', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'update', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'delete', 'DocumentReference')
wrapPrototypePromise(DocumentReference, 'create', 'DocumentReference')
wrapPrototypePromise(Query, 'get', 'Query')
wrapPrototypePromise(CollectionReference, 'add', 'CollectionReference')

export let adminAuth: Auth
export let adminDb: Firestore

if (!building) {
  try {
    if ((firebase.apps || []).length === 0) {
      if (
        FIREBASE_PRIVATE_KEY &&
        FIREBASE_PRIVATE_KEY.includes('-----BEGIN PRIVATE KEY-----') &&
        !FIREBASE_PRIVATE_KEY.includes('...')
      ) {
        firebase.initializeApp({
          credential: firebase.credential.cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY,
          }),
        })
      } else {
        firebase.initializeApp({
          projectId: FIREBASE_PROJECT_ID || 'demo-gbstem',
        })
      }
    }
  } catch (err: any) {
    if (!/already exists/u.test(err.message)) {
      console.error('Firebase Admin init error:', err)
    }
  }
  adminAuth = getAuth()
  adminDb = getFirestore()
} else {
  adminAuth = {} as Auth
  adminDb = {} as Firestore
}

/**
 * Converts a Firestore Timestamp to a Date, tolerating documents with a
 * null/missing timestamp field (seen in some legacy production records).
 * Logs which doc/field was bad instead of crashing the whole page load.
 */
export function toDateSafe(
  timestamp: Timestamp | null | undefined,
  docId: string,
  field: string,
): Date {
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate()
  }
  console.error(
    `[Firestore Data Error] doc ${docId} has a null/missing "${field}" timestamp; falling back to epoch.`,
  )
  return new Date(0)
}

export async function verifyToken(
  token: string,
): Promise<Data.Token<'server'>> {
  try {
    const tokenDoc = await adminDb.collection('tokens').doc(token).get()
    if (!tokenDoc.exists) {
      throw 'fake'
    }
    const tokenData = tokenDoc.data() as Data.Token<'server'>
    // An early check, for the signup page to reject a stale link up front.
    // Two signups can both pass it; accountService's recordNewAccount checks
    // again inside the transaction that consumes the token.
    const rejection = tokenRejection(tokenData, new Date())
    if (rejection) {
      throw rejection
    }
    return tokenData
  } catch (err) {
    if (err === 'fake' || err === 'expired' || err === 'consumed') {
      throw err
    }
    throw 'unknown'
  }
}
