import { defineEnvVars } from '@sveltejs/kit/env'

/**
 * For a variable that may be unset: the value as given, `undefined` when
 * missing. Without a `schema`, SvelteKit refuses to start unless it's set.
 */
const optional = (value: string | undefined) => value

export const variables = defineEnvVars({
  // Unset, /api/cron/resetIdleVerification refuses every caller.
  CRON_SECRET: { schema: optional },
  SENDGRID_API_TOKEN: { static: true },
  // Set only when running against the Firebase emulators.
  FIREBASE_AUTH_EMULATOR_HOST: { schema: optional },
  FIRESTORE_EMULATOR_HOST: { schema: optional },
  STORAGE_EMULATOR_HOST: { schema: optional },
  FIREBASE_CLIENT_EMAIL: { static: true },
  FIREBASE_PRIVATE_KEY: { static: true },
  FIREBASE_PROJECT_ID: { static: true },
  // 'true' searches Firestore directly instead of Algolia.
  USE_LOCAL_SEARCH: { schema: optional },
  VITE_USE_LOCAL_SEARCH: { schema: optional },
  ALGOLIA_APP_ID: { static: true },
  ALGOLIA_PRIVATE_KEY: { static: true },
  PUBLIC_FIREBASE_API_KEY: { public: true, static: true },
  PUBLIC_FIREBASE_APP_ID: { public: true, static: true },
  PUBLIC_FIREBASE_AUTH_DOMAIN: { public: true, static: true },
  PUBLIC_FIREBASE_MEASUREMENT_ID: { public: true, static: true },
  PUBLIC_FIREBASE_MESSAGE_SENDER_ID: { public: true, static: true },
  PUBLIC_FIREBASE_PROJECT_ID: { public: true, static: true },
  PUBLIC_FIREBASE_STORAGE_BUCKET: { public: true, static: true },
})
