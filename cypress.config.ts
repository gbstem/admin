import { defineConfig } from 'cypress'
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { seedEmulator } from './scripts/seedLib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv() {
  const env: Record<string, string> = {}
  for (const filename of ['.env', '.env.local']) {
    const filePath = path.resolve(__dirname, filename)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const match = trimmed.match(/^([^=]+)=(.*)$/)
        if (match) {
          const key = match[1].trim()
          let val = match[2].trim()
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1)
          }
          env[key] = val
        }
      }
    }
  }
  return { ...env, ...process.env }
}

const combinedEnv = loadEnv()

// Ensure emulator and project env variables are set for firebase-admin and other tools
if (combinedEnv.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    combinedEnv.FIREBASE_AUTH_EMULATOR_HOST
}
if (combinedEnv.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = combinedEnv.FIRESTORE_EMULATOR_HOST
}
if (combinedEnv.FIREBASE_PROJECT_ID) {
  process.env.FIREBASE_PROJECT_ID = combinedEnv.FIREBASE_PROJECT_ID
  process.env.GCLOUD_PROJECT = combinedEnv.FIREBASE_PROJECT_ID
}

export default defineConfig({
  // Cypress 16 deprecated bundled Electron as the implicit default browser.
  defaultBrowser: 'chrome',
  // Public, non-sensitive configuration values
  expose: {
    FIRESTORE_EMULATOR_HOST: combinedEnv.FIRESTORE_EMULATOR_HOST,
  },
  // Sensitive values like API keys, passwords, tokens, or credentials
  env: {},
  e2e: {
    baseUrl: 'http://localhost:5173',
    scrollBehavior: 'center',
    viewportWidth: 1920,
    viewportHeight: 1080,
    // TODO: this papers over a residual dialog open/close timing race
    // (Application.svelte and others) that surfaces as different assertion
    // failures under CI-level load - a stuck-open/closed [role="dialog"], a
    // field not yet repopulated after a reopen, or a hung cy.screenshot() on
    // failure. This is on top of (not instead of) the existing waits/flake
    // fixes from PRs #49 and #54 - retrying here only keeps CI a useful merge
    // gate for whatever's left; it isn't a substitute for root-causing it.
    retries: { runMode: 1, openMode: 0 },
    setupNodeEvents(on, config) {
      installLogsPrinter(on, {
        printLogsToConsole: 'onFail',
        printLogsToFile: 'always',
        includeSuccessfulHookLogs: false,
        outputRoot: config.projectRoot + '/cypress/logs/',
        outputTarget: {
          'out.json': 'json',
        },
      })
      on('task', {
        log(message) {
          console.log(message) // Print to the terminal
          return null
        },
        // Restores the emulator to the seed state in-process, rather than
        // shelling out to `yarn seed` - cy.exec() was removed in Cypress 16.
        async seed() {
          await seedEmulator()
          return null
        },
        async getFirestoreUserId(email: string) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          try {
            const userRecord = await getAuth().getUserByEmail(email)
            return userRecord.uid
          } catch (error) {
            console.error('Error in getFirestoreUserId task:', error)
            return null
          }
        },
        // Writes an interview slot doc directly, bypassing the app's own
        // create flow, so a spec can seed a slot with an arbitrary
        // interviewerEmail/interviewerUid combination - e.g. one belonging to
        // a different interviewer, or one simulating a slot created before
        // its owner changed their account's email.
        async setInterviewSlot(slot: {
          collectionPath: string
          id: string
          date: string
          interviewerName: string
          interviewerEmail: string
          interviewerUid?: string
          meetingLink: string
          semester?: string
          intervieweeId?: string
        }) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          await getFirestore()
            .collection(slot.collectionPath)
            .doc(slot.id)
            .set({
              id: slot.id,
              date: Timestamp.fromDate(new Date(slot.date)),
              interviewerName: slot.interviewerName,
              interviewerEmail: slot.interviewerEmail,
              interviewerUid: slot.interviewerUid ?? '',
              intervieweeFirstName: '',
              intervieweeLastName: '',
              intervieweeEmail: '',
              intervieweeId: slot.intervieweeId ?? '',
              interviewSlotStatus: slot.intervieweeId ? 'pending' : 'available',
              meetingLink: slot.meetingLink,
              semester: slot.semester ?? '',
            })
          return null
        },
        // Writes a `tokens` doc directly, bypassing the app's own token
        // creation flow, so a spec can set up an already-expired or
        // already-consumed token without waiting real time or driving a
        // full signup first.
        async setToken(token: {
          id: string
          role: string
          consumable: boolean
          consumers: string[]
          expiresAt: string
        }) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          await getFirestore()
            .collection('tokens')
            .doc(token.id)
            .set({
              role: token.role,
              consumable: token.consumable,
              consumers: token.consumers,
              expires: Timestamp.fromDate(new Date(token.expiresAt)),
            })
          return null
        },
        // Admin SDK access bypasses firestore.rules (unlike a plain cy.request() against the
        // Firestore REST API, which enforces them and 403s for an unauthenticated caller) -
        // needed for tests asserting server-side document state directly, such as confirming a
        // doc was actually deleted rather than just reflected in optimistic UI state.
        async checkFirestoreDocExists(docPath: string) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          const doc = await getFirestore().doc(docPath).get()
          return doc.exists
        },
        // Admin SDK read, bypassing firestore.rules - for asserting on a
        // server-only collection that no client token can read at all.
        async readFirestoreDoc(docPath: string) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          const doc = await getFirestore().doc(docPath).get()
          return doc.exists ? doc.data() : null
        },
        // Admin SDK delete, bypassing firestore.rules - for clearing a document
        // an earlier test in the same spec left where the next one needs
        // nothing.
        async deleteFirestoreDoc(docPath: string) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          await getFirestore().doc(docPath).delete()
          return null
        },
        // Admin SDK merge-write, bypassing firestore.rules - lets a spec put a
        // seeded doc into a state the app itself would never write (e.g. a
        // class or registration owned by the account under test), to
        // exercise a blocked-deletion path directly.
        async mergeFirestoreDoc({
          docPath,
          data,
        }: {
          docPath: string
          data: Record<string, unknown>
        }) {
          if (getApps().length === 0) {
            initializeApp({
              projectId: process.env.FIREBASE_PROJECT_ID || 'demo-gbstem',
            })
          }
          await getFirestore().doc(docPath).set(data, { merge: true })
          return null
        },
      })
      return config
    },
  },
})
