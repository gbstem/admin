// `goto` has to be a spy, and this must be declared BEFORE the imports below:
// `.svelte.test.ts` files run through jest-transform-svelte-module.cjs, which
// does plain `ts.transpileModule` compilation with no jest-hoist step, so
// `jest.mock()` here is NOT hoisted above the imports the way it is in an
// ordinary `.test.ts`. See the same note in SetInterviewTimesForm.svelte.test.ts.
jest.mock('$app/navigation', () => ({
  goto: jest.fn(),
}))

import { mount, unmount, flushSync, tick } from 'svelte'
import { fireEvent, within } from '@testing-library/dom'
import { goto } from '$app/navigation'
import { page } from '$app/state'
import SearchableSelect from '#lib/components/SearchableSelect.svelte'
import StatusFilter from '#lib/components/StatusFilter.svelte'

const gotoMock = goto as unknown as jest.Mock

// `filterOptionsBy` is debounced by 150ms, so the option list only reflects a
// newly typed value after that window.
const DEBOUNCE_MS = 150
const afterDebounce = () =>
  new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS + 50))

function setUrl(url: string) {
  ;(page as unknown as { url: URL }).url = new URL(url)
}

function optionButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll('button')).filter(
    (b) => b.getAttribute('aria-label') !== 'Toggle dropdown',
  )
}

describe('SearchableSelect', () => {
  let target: HTMLElement
  let component: Record<string, any>

  beforeEach(() => {
    gotoMock.mockClear()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (component) unmount(component)
    target.remove()
  })

  function mountSelect(props: {
    value: string
    onchange: (value: string) => void
  }) {
    component = mount(SearchableSelect, {
      target,
      props: {
        label: 'Status',
        options: [
          { name: 'all' },
          { name: 'submitted' },
          { name: 'incomplete' },
        ],
        ...props,
      },
    })
    flushSync()
    return within(target).getByLabelText(/Status/) as HTMLInputElement
  }

  it('does not commit a selection while the user is typing', async () => {
    const onchange = jest.fn()
    const input = mountSelect({ value: 'all', onchange })

    fireEvent.focusIn(input)
    flushSync()
    fireEvent.input(input, { target: { value: 'sub' } })
    flushSync()
    await afterDebounce()

    // Typing narrows the option list only. Committing here is what pushed a
    // history entry and refetched the table per keystroke.
    expect(onchange).not.toHaveBeenCalled()
  })

  it('does not commit a selection when the box is cleared', async () => {
    const onchange = jest.fn()
    const input = mountSelect({ value: 'incomplete', onchange })

    fireEvent.focusIn(input)
    flushSync()
    fireEvent.input(input, { target: { value: '' } })
    flushSync()
    await afterDebounce()

    expect(onchange).not.toHaveBeenCalled()
  })

  it('commits when an option is clicked', async () => {
    const onchange = jest.fn()
    const input = mountSelect({ value: 'incomplete', onchange })

    fireEvent.focusIn(input)
    flushSync()
    const submitted = optionButtons(target).find(
      (b) => b.textContent?.trim() === 'submitted',
    )
    fireEvent.click(submitted as HTMLButtonElement)
    flushSync()

    expect(onchange).toHaveBeenCalledWith('submitted')
  })

  it('commits the highlighted option on Enter', async () => {
    const onchange = jest.fn()
    const input = mountSelect({ value: '', onchange })

    fireEvent.focusIn(input)
    flushSync()
    await tick()
    flushSync()
    fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' })
    flushSync()
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    flushSync()

    expect(onchange).toHaveBeenCalledWith('submitted')
  })
})

describe('StatusFilter', () => {
  let target: HTMLElement
  let component: Record<string, any>

  beforeEach(() => {
    gotoMock.mockClear()
    setUrl('http://localhost/registrations?filter=incomplete')
    target = document.createElement('div')
    document.body.appendChild(target)
    component = mount(StatusFilter, {
      target,
      props: { type: 'registrations' },
    })
    flushSync()
  })

  afterEach(() => {
    if (component) unmount(component)
    target.remove()
    setUrl('http://localhost/')
  })

  it('navigates when a real option is chosen', () => {
    const select = within(target).getByLabelText(/Status/) as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'all' } })
    flushSync()

    expect(gotoMock).toHaveBeenCalledWith('?filter=all', {
      reset: false,
    })
  })

  it('does not navigate when the current option is re-selected', () => {
    const select = within(target).getByLabelText(/Status/) as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'incomplete' } })
    flushSync()

    expect(gotoMock).not.toHaveBeenCalled()
  })
})
