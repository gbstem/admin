// `beforeNavigate` has to be a spy, and this must be declared BEFORE the
// imports below: `.svelte.test.ts` files run through
// jest-transform-svelte-module.cjs, which does plain `ts.transpileModule`
// compilation with no jest-hoist step, so `jest.mock()` here is NOT hoisted
// above the imports the way it is in an ordinary `.test.ts`. See the same note
// in Select.svelte.test.ts.
jest.mock('$app/navigation', () => ({
  beforeNavigate: jest.fn(),
}))

import { mount, unmount, flushSync } from 'svelte'
import { beforeNavigate } from '$app/navigation'
import { updated } from '$app/state'
import { shouldHardLoad } from '#lib/client/staleClient.js'
import StaleClientBanner from '#lib/components/StaleClientBanner.svelte'

const beforeNavigateMock = beforeNavigate as unknown as jest.Mock

function setUpdated(current: boolean) {
  ;(updated as { current: boolean }).current = current
}

describe('StaleClientBanner', () => {
  let target: HTMLElement
  let component: Record<string, any>

  beforeEach(() => {
    beforeNavigateMock.mockClear()
    setUpdated(false)
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (component) unmount(component)
    target.remove()
    setUpdated(false)
  })

  it('renders nothing while the tab matches the deployed version', () => {
    component = mount(StaleClientBanner, { target })
    flushSync()
    expect(target.textContent).toBe('')
    expect(target.querySelector('button')).toBeNull()
  })

  it('shows the reload prompt once the deployed version moves on', () => {
    setUpdated(true)
    component = mount(StaleClientBanner, { target })
    flushSync()

    const status = target.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status?.textContent).toContain(
      'A new version of gbSTEM is available',
    )
    expect(status?.getAttribute('aria-live')).toBe('polite')
    expect(target.querySelector('button')?.textContent?.trim()).toBe(
      'Reload this page',
    )
  })

  it('registers a navigation guard so a stale tab reloads on its next click', () => {
    component = mount(StaleClientBanner, { target })
    flushSync()
    expect(beforeNavigateMock).toHaveBeenCalledTimes(1)
    expect(typeof beforeNavigateMock.mock.calls[0][0]).toBe('function')
  })
})

// The guard's effect - assigning `location.href` - cannot be observed under
// jsdom, where `window.location` is non-configurable and its `reload` is
// read-only. The decision that precedes it is what can regress, so it lives in
// a helper and is covered directly.
describe('shouldHardLoad', () => {
  const to = { url: new URL('http://localhost/classes') }

  it('hard-loads a normal navigation from a stale tab', () => {
    expect(shouldHardLoad(true, { willUnload: false, to })).toBe(true)
  })

  it('leaves a current tab alone', () => {
    expect(shouldHardLoad(false, { willUnload: false, to })).toBe(false)
  })

  it('stays out of the way when the browser is leaving the app anyway', () => {
    expect(shouldHardLoad(true, { willUnload: true, to })).toBe(false)
  })

  it('does nothing without a destination url', () => {
    expect(shouldHardLoad(true, { willUnload: false, to: null })).toBe(false)
    expect(shouldHardLoad(true, { willUnload: false })).toBe(false)
  })
})
