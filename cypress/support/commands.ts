// Add all new commands to index.d.ts as well.
import Papa from 'papaparse'

/**
 * Sets a field's value directly and fires the `input` event Svelte's
 * `bind:value` listens for, rather than typing it.
 *
 * Use this for inputs bound to a superforms store - every field inside the
 * edit dialogs and the interview slot form. A multi-keystroke approach
 * (`cy.fillInput`, or `type('{selectall}{backspace}...')`) can be interrupted
 * partway through by a re-render that restores the store's value, which
 * appends instead of replacing and yields a mangled result like
 * "555-011555-0110". That only happens when the new text matches what was
 * already there, so it stays hidden until a test re-applies the same fixture.
 * A single assignment leaves no such window.
 *
 * Prefer `cy.fillInput` elsewhere: it drives the field the way a user does,
 * and its visibility and focus checks catch inputs this one would silently
 * write to.
 */
Cypress.Commands.add('setFieldValue', (selector: string, value: string) => {
  cy.get(selector).then(($el) => {
    const el = $el[0] as HTMLInputElement | HTMLTextAreaElement
    el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  cy.get(selector).should('have.value', value)
})

Cypress.Commands.add('fillInput', (selector: string, text: string) => {
  cy.get(selector)
    .scrollIntoView()
    .should('be.visible')
    .focus()
    .clear()
    .type(text, { delay: 20 })
  // We had buggy inputs in the past, verify the value actually stuck.
  cy.get(selector).should('have.value', text)
})

// Waits until a form's `use:enhance` action has actually run.
//
// Every form in this app is a Superforms SPA form (`<form use:enhance>`), and
// that action sets `method="post"` on the element when it runs - so the
// attribute's presence is a direct signal that the JS submit handler is
// attached. It is worth waiting on precisely because of what happens without
// it: submitting a not-yet-hydrated form does a *native GET*, navigating to
// `?email=...&password=...` instead of running any JS, so no validation, no
// Firebase call, and no error toast ever happen. That is a silent wrong-looking
// pass or a confusing timeout, not an obvious failure.
//
// This replaced fixed `cy.wait(500)` calls that were racing hydration under
// full-suite load.
Cypress.Commands.add('waitForFormHydration', (selector = 'form') => {
  cy.get(selector, { timeout: 15000 })
    .should('have.attr', 'method')
    .and('match', /post/i)
})

// Type a term into a SearchBox and submit it.
//
// Typing here is racy: `Input.svelte` re-renders on every `value` change, so
// Svelte can replace the input element mid-`.type()`. Cypress keeps typing into
// the node it resolved when the command started, the replaced node keeps only
// the final keystroke, and the form submits that. CI caught this submitting
// `query=d` for a typed "David" -- and a single letter matches nearly every
// record, since the local search fallback substring-matches every field, so the
// filter assertions failed in a way that looked like a slow load but never
// resolved no matter how long the timeout.
//
// fillInput already re-types when the value doesn't stick, so reuse it, then
// assert the query reached the URL before any table assertions run.
//
// That URL assertion needs its own generous timeout, not Cypress's 4s
// default: SvelteKit's client router only updates the URL/history *after*
// the destination route's `load()` resolves, and `goto()` here re-runs the
// same page load that pages like applications.cy.ts give 30s of headroom to
// elsewhere (see its TABLE_TIMEOUT comment) -- CI has no Algolia credentials,
// so that load falls back to a full-collection local search. Without this,
// the URL check can time out on a plain slow load and get misread as the
// typing race above, which it isn't.
const SEARCH_URL_TIMEOUT = 30000
Cypress.Commands.add('submitSearch', (term: string) => {
  const selector = 'input[placeholder="Search"]'
  cy.fillInput(selector, term)
  cy.get(selector).type('{enter}')
  // Build the expectation the same way SearchBox does, via URLSearchParams --
  // it encodes a space as "+", which encodeURIComponent would never match for
  // multi-word terms like "Demo Student".
  cy.url({ timeout: SEARCH_URL_TIMEOUT }).should(
    'include',
    new URLSearchParams({ query: term }).toString(),
  )
})

Cypress.Commands.add(
  'signedInSession',
  (
    role: 'admin' | 'instructor' | 'reviewer' | 'student',
    options: {
      email?: string
      initialPage?: string
    } = {},
  ) => {
    const emailToUse =
      options.email ||
      (role === 'admin' ? 'demo@gbstem.org' : `${role}@gbstem.org`)

    cy.session(`signedIn-${emailToUse}`, () => {
      cy.visit('/signin')
      cy.get('input[type="email"]').should('be.visible')
      cy.wait(2500) // Wait for Svelte page and HMR to settle
      const password = 'penguin'

      cy.fillInput('input[type="email"]', emailToUse)
      cy.fillInput('input[type="password"]', password)
      cy.get('button[type="submit"]').click()
      cy.wait(1000) // Wait for Svelte page and HMR to settle
    })

    const initialPage = options.initialPage || '/dashboard'
    cy.visit(initialPage)
    if (initialPage === '/announcements') {
      cy.title().should('contain', 'Announcements')
      cy.get('h1').should('contain', 'Announcements', { timeout: 10000 })
    } else if (initialPage === '/applications') {
      cy.title().should('contain', 'Applications')
    } else if (initialPage === '/classes') {
      cy.title().should('contain', 'Classes')
    } else if (initialPage === '/instructor-feedback') {
      cy.title().should('contain', 'Class Feedback')
    } else if (initialPage === '/interviews') {
      cy.title().should('contain', 'Interview Timeslots')
      cy.get('h1').should('contain', 'Set Interview Timeslots', {
        timeout: 10000,
      })
    } else if (initialPage === '/registrations') {
      cy.title().should('contain', 'Registrations')
    } else if (initialPage === '/student-feedback') {
      cy.title().should('contain', 'Student Feedback')
    } else if (initialPage === '/students') {
      cy.title().should('contain', 'Students')
    } else if (initialPage === '/sub-requests') {
      cy.title().should('contain', 'Sub Requests Log')
    } else if (initialPage === '/dashboard') {
      cy.title().should('contain', 'Dashboard')
      cy.get('h1').should('contain', 'Dashboard', { timeout: 10000 })
    } else if (initialPage === '/profile') {
      cy.title().should('contain', 'Profile')
      cy.get('h1').should('contain', 'Profile', { timeout: 10000 })
    } else if (initialPage === '/tokens') {
      cy.title().should('contain', 'Tokens')
    } else if (initialPage.startsWith('/user/')) {
      cy.title().should('contain', 'Check In')
    }
    cy.wait(1000)
  },
)

Cypress.Commands.add('signOutViaUi', () => {
  cy.get('body').then(($body) => {
    if ($body.find('button[aria-label="Profile menu"]:visible').length > 0) {
      cy.get('button[aria-label="Profile menu"]').click()
    }
  })
  cy.contains('button', 'Sign out').click({ force: true })
  cy.url().should('include', '/signin')
  cy.get('input[type="email"]').should('be.visible')
})

// Picks an option in a Select.svelte combobox.
//
// Two things this has to work around, both learned the hard way:
//
// 1. Clearing first is required for a select that already holds a value.
//    `handleFocusIn` shows the whole option list, but the `filterOptionsBy`
//    effect then narrows it by the text in the input on a 150ms debounce - so
//    a pre-filled select collapses to just its own current value about a frame
//    after the dropdown opens, and every other option disappears before a
//    retrying assertion can land on it. Clearing resets the filter to the full
//    list, and `handleInput` sets `open = true`, so it opens the dropdown too.
//
// 2. The option lookup is scoped to this select's own dropdown, not the page.
//    Other buttons elsewhere may carry the same text - the dashboard's class
//    picker is labelled with its class's course name, so an unscoped
//    `cy.contains('button', 'Mathematics 1a')` matches the picker and silently
//    switches class instead of choosing the option. The input and its option
//    list share a parent, and the only other button under that parent is the
//    dropdown toggle, which has no text and so can never match.
Cypress.Commands.add(
  'selectOption',
  (selector: string, text: string, options?: Partial<Cypress.Timeoutable>) => {
    cy.get(selector, options).clear({ force: true })
    cy.get(selector, options)
      .parent()
      .find('button')
      .contains(text, options)
      .click({ force: true })
    // `contains` matches substrings, so confirm the option that was clicked is
    // the one asked for rather than one merely containing that text.
    cy.get(selector, options).should('have.value', text)
  },
)

Cypress.Commands.add('parseCsv', (csvText: string) => {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
  })
  return cy.wrap(parsed.data)
})

Cypress.Commands.add('parseCopiedEmails', (clipboardText: string) => {
  const emails = clipboardText.split(',').map((e: string) => e.trim())
  return cy.wrap(emails)
})

Cypress.Commands.add(
  'dropCsvColumn',
  (parsedRows: string[][], columnName: string) => {
    const headers = parsedRows[0]
    const colIndex = headers.indexOf(columnName)
    if (colIndex === -1) {
      throw new Error(
        `Column "${columnName}" not found in CSV headers: ${headers.join(', ')}`,
      )
    }
    const updatedRows = parsedRows.map((row) => {
      return [...row.slice(0, colIndex), ...row.slice(colIndex + 1)]
    })
    return cy.wrap(updatedRows)
  },
)

Cypress.Commands.add(
  'getLatestOobLink',
  (
    email: string,
    requestType: 'VERIFY_EMAIL' | 'PASSWORD_RESET' | 'VERIFY_AND_CHANGE_EMAIL',
  ) => {
    return cy.request('GET', '/api/test/emails').then((response) => {
      const sentEmails = response.body || []
      const match = sentEmails
        .filter((msg: any) => {
          const toMatch = Array.isArray(msg.to)
            ? msg.to.includes(email)
            : msg.to === email
          const subjectMatch =
            (requestType === 'VERIFY_EMAIL' &&
              msg.subject.includes('Verify Email')) ||
            (requestType === 'PASSWORD_RESET' &&
              msg.subject.includes('Reset Password')) ||
            (requestType === 'VERIFY_AND_CHANGE_EMAIL' &&
              msg.subject.includes('Change Email'))
          return toMatch && subjectMatch
        })
        .pop()
      expect(
        match,
        `Expected an email to be sent to ${email} for ${requestType}`,
      ).to.not.equal(undefined)
      const linkMatch = match.html.match(
        /href=["'](https?:\/\/[^"']+\/action?[^"']+&amp;oobCode=[^"']+)["']/,
      )
      expect(
        linkMatch,
        'Expected sent email body to contain an action link URL',
      ).to.not.equal(null)
      const rawLink = linkMatch[1]
      const link = rawLink.replace(/&amp;/g, '&')
      return link
    })
  },
)

Cypress.Commands.add('clearTestEmails', () => {
  return cy.request('DELETE', '/api/test/emails')
})

Cypress.Commands.add(
  'verifyEmailSent',
  (email: string, subjectSubstring: string, timeoutMs: number = 10000) => {
    // The send is triggered server-side by the write that preceded this call
    // (e.g. a decision update), so the email may not have landed in the test
    // inbox yet -- poll for it instead of assuming the caller waited long
    // enough before calling this command.
    const deadline = Date.now() + timeoutMs
    const findMatch = (sentEmails: any[]) =>
      sentEmails
        .filter((msg: any) => {
          const toMatch = Array.isArray(msg.to)
            ? msg.to.includes(email)
            : msg.to === email
          const subjectMatch = msg.subject.includes(subjectSubstring)
          return toMatch && subjectMatch
        })
        .pop()
    const attempt = (): Cypress.Chainable<any> =>
      cy.request('GET', '/api/test/emails').then((response) => {
        const match = findMatch(response.body || [])
        if (match) return cy.wrap(match)
        if (Date.now() >= deadline) {
          expect(
            match,
            `Expected an email sent to ${email} with subject containing "${subjectSubstring}"`,
          ).to.not.equal(undefined)
        }
        return cy.wait(250, { log: false }).then(attempt)
      })
    return attempt()
  },
)

Cypress.Commands.add(
  'waitForNotification',
  (
    text: string,
    colorClass: string = 'bg-green-200',
    timeoutMs: number = 15000,
  ) => {
    return cy
      .get(`.${colorClass}`, { timeout: timeoutMs })
      .should('contain', text)
  },
)

// Writes a `tokens` doc directly via a Firestore Admin SDK task, so a spec
// can exercise an already-expired or already-consumed signup token without
// waiting real time or driving a full signup first to consume one.
Cypress.Commands.add(
  'createTestToken',
  (
    id: string,
    options: {
      role?: string
      consumable?: boolean
      consumers?: string[]
      expiresAt?: string
    } = {},
  ) => {
    return cy.task('setToken', {
      id,
      role: options.role ?? 'admin',
      consumable: options.consumable ?? false,
      consumers: options.consumers ?? [],
      expiresAt:
        options.expiresAt ??
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    })
  },
)

// Writes an interview slot doc directly via a Firestore Admin SDK task, so a
// spec can seed a slot owned by a different interviewer, or one whose
// interviewerEmail is stale relative to interviewerUid (simulating a slot
// created before its owner changed their account's email).
Cypress.Commands.add(
  'setInterviewSlot',
  (slot: {
    collectionPath: string
    id: string
    date: string
    interviewerName: string
    interviewerEmail: string
    interviewerUid?: string
    meetingLink: string
    semester?: string
    intervieweeId?: string
  }) => {
    return cy.task('setInterviewSlot', slot)
  },
)

const getFirebaseAuthBaseUrl = () =>
  `http://${Cypress.expose('FIREBASE_AUTH_EMULATOR_HOST') || '127.0.0.1:9099'}`
const getFirestoreBaseUrl = () =>
  `http://${Cypress.expose('FIRESTORE_EMULATOR_HOST') || '127.0.0.1:8080'}`

Cypress.Commands.add('getFirebaseAuthToken', () => {
  return cy
    .request({
      method: 'POST',
      url: `${getFirebaseAuthBaseUrl()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=does-not-matter`,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        email: 'demo@gbstem.org',
        password: 'penguin',
        returnSecureToken: true,
      },
    })
    .then((response) => {
      return response.body.idToken
    })
})

Cypress.Commands.add(
  'getFirestoreUserId',
  (_authToken: string, email: string) => {
    return cy.task('getFirestoreUserId', email).then((uid) => {
      if (!uid) {
        throw new Error(`Could not find user ID for email: ${email}`)
      }
      return uid as string
    })
  },
)

const convertValue = (val: any): any => {
  if (!val) return null
  if ('stringValue' in val) return val.stringValue
  if ('integerValue' in val) return parseInt(val.integerValue, 10)
  if ('doubleValue' in val) return parseFloat(val.doubleValue)
  if ('booleanValue' in val) return val.booleanValue
  if ('arrayValue' in val) {
    const values = val.arrayValue.values || []
    return values.map(convertValue)
  }
  if ('mapValue' in val) {
    const fields = val.mapValue.fields || {}
    const obj: any = {}
    for (const key of Object.keys(fields)) {
      obj[key] = convertValue(fields[key])
    }
    return obj
  }
  if ('nullValue' in val) return null
  return val
}

Cypress.Commands.add(
  'getFirestoreDoc',
  (authToken: string, collection: string, docId: string) => {
    return cy
      .request({
        method: 'GET',
        url: `${getFirestoreBaseUrl()}/v1/projects/demo-gbstem/databases/(default)/documents/${collection}/${docId}`,
        failOnStatusCode: false,
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      })
      .then((response) => {
        if (response.status === 404) {
          return null
        }
        expect(response.status).to.equal(200)

        const fields = response.body.fields || {}
        const data: any = {}
        for (const key of Object.keys(fields)) {
          data[key] = convertValue(fields[key])
        }
        return data
      })
  },
)

/**
 * Records every `window.confirm` raised for the rest of the test and answers
 * them with `answer` (default: accept). Yields the recording array, so the
 * idiomatic use is to alias it:
 *
 * ```ts
 * cy.captureConfirms().as('confirms')
 * // ...do the thing...
 * cy.get('@confirms').should('have.length', 1)
 * cy.get('@confirms').its(0).should('contain', 'overwrite')
 * ```
 *
 * Prefer this over a bare `cy.on('window:confirm', () => true)`. Cypress
 * accepts confirms automatically, so that form asserts nothing: a prompt that
 * should never have appeared is accepted in silence and looks exactly like
 * correct behaviour, and a prompt whose wording has drifted still passes.
 * Capturing the text is what makes "no prompt appeared" and "this prompt
 * appeared" both assertable.
 *
 * Pass a function when a single test has to accept some prompts and dismiss
 * others (e.g. cancel-then-confirm loops) - it is re-evaluated per prompt, so
 * flipping a local `let` inside `cy.then()` steers the next answer. A handler
 * cannot be unregistered mid-test, and any handler returning `false` cancels
 * the confirm, so a second `cy.captureConfirms(false)` would not work here.
 *
 * The array is mutated in place, so `cy.get('@confirms')` re-yields live state
 * and Cypress retries length assertions against it.
 */
Cypress.Commands.add(
  'captureConfirms',
  (answer: boolean | (() => boolean) = true) => {
    const seen: string[] = []
    cy.on('window:confirm', (text: string) => {
      seen.push(text)
      return typeof answer === 'function' ? answer() : answer
    })
    return cy.wrap(seen, { log: false })
  },
)
