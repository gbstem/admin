// See https://kit.svelte.dev/docs/types#app

// for information about these interfaces
declare global {
  namespace App {
    interface Error {
      message: string
      code?: string
      details?: string
    }
    interface Locals {
      user: Data.User.Peek | null
    }
    interface PageData {
      /**
       * The signed-in user, role included, as `hooks.server.ts` verified them:
       * the session cookie plus the Auth record's role claim. Set by
       * `(signedIn)/+layout.server.ts`, so it is there on the first render of
       * every signed-in page. Branch on this `role`. Absent on signed-out
       * pages.
       */
      user?: Data.User.Peek
    }
    // interface Platform {}
  }
}

declare module 'svelte/elements' {
  interface HTMLAttributes<T> {
    onoutclick?: (event: CustomEvent<any>) => void
  }
}

export {}
