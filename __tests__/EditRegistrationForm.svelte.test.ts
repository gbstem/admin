// These mocks must be declared BEFORE the imports below: `.svelte.test.ts`
// files run through jest-transform-svelte-module.cjs, which does plain
// `ts.transpileModule` compilation with no jest-hoist step, so `jest.mock()`
// here is NOT hoisted the way it is in an ordinary `.test.ts`. See the same
// note in SetInterviewTimesForm.svelte.test.ts.
jest.mock('$lib/client/firebase', () => {
  const { writable } = require('svelte/store')
  return {
    user: writable(undefined),
    auth: {},
    db: {},
    storage: {},
  }
})

import { mount, unmount, flushSync } from 'svelte'
import EditRegistrationForm from '$lib/components/forms/EditRegistrationForm.svelte'
import { createDefaultRegistrationValues } from '$lib/helpers/editRegistrationForm'

function registration(
  overrides: Partial<Data.Registration<'client'>['personal']> = {},
): Data.Registration<'client'> {
  const values = createDefaultRegistrationValues()
  values.personal = {
    ...values.personal,
    studentFirstName: 'Sally',
    studentLastName: 'Brown',
    // Stale on purpose: the form shows the parent account's current address,
    // resolved from the registration id, and never this one.
    email: 'stored@example.com',
    secondaryEmail: 'stored-secondary@example.com',
    ...overrides,
  }
  values.academic = { school: 'Riverdale Charter', grade: '3' }
  return values
}

/**
 * The parent loads the document asynchronously, so `values` is reassigned
 * after the form has already mounted - and previously that reassignment reset
 * the whole superform store, silently discarding whatever an admin had typed
 * in the meantime. Seeding is now driven by `seedVersion` instead.
 */
describe('EditRegistrationForm seeding', () => {
  let target: HTMLElement
  let component: Record<string, any>
  // Declared once, as a $state proxy, so that mutating it after mount reaches
  // the component the way a parent's reassignment would. `$state` is only
  // valid as a declaration initializer, so this cannot move into beforeEach.
  const props = $state({
    id: 'reg-sally',
    values: registration(),
    seedVersion: 0,
    disabled: false,
  })

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ emails: { 'reg-sally': 'current@example.com' } }),
    }) as jest.Mock
    target = document.createElement('div')
    document.body.appendChild(target)
    props.values = registration()
    props.seedVersion = 0
    props.disabled = false
    component = mount(EditRegistrationForm, { target, props })
    flushSync()
  })

  afterEach(() => {
    if (component) unmount(component)
    target.remove()
  })

  const emailInput = () =>
    target.querySelector(
      'input[name="personal.secondaryEmail"]',
    ) as HTMLInputElement

  it('seeds the form from the initial values', () => {
    expect(emailInput().value).toBe('stored-secondary@example.com')
  })

  // The address stored on a registration is only an audit record, so the form
  // neither shows nor edits it.
  it("shows the parent account's current address, read-only", async () => {
    await new Promise(process.nextTick)
    flushSync()

    expect(
      target.querySelector('[data-testid="parent-account-email"]')?.textContent,
    ).toContain('current@example.com')
    expect(target.textContent).not.toContain('stored@example.com')
    expect(target.querySelector('input[name="personal.email"]')).toBeNull()
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(init.body)).toMatchObject({
      intent: 'registrationParents',
      uids: ['reg-sally'],
      context: { registrationIds: ['reg-sally'] },
    })
  })

  it('does not discard edits when values change without a reseed', () => {
    // The admin types...
    emailInput().value = 'typed@example.com'
    emailInput().dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    // ...and the parent's fetch lands a moment later.
    props.values = registration({
      secondaryEmail: 'stored-secondary@example.com',
    })
    flushSync()

    expect(emailInput().value).toBe('typed@example.com')
  })

  it('reseeds when the parent bumps seedVersion', () => {
    emailInput().value = 'typed@example.com'
    emailInput().dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    // What the parent does on load-complete and on "Delete changes".
    props.values = registration({ secondaryEmail: 'reloaded@example.com' })
    props.seedVersion = props.seedVersion + 1
    flushSync()

    expect(emailInput().value).toBe('reloaded@example.com')
  })
})
