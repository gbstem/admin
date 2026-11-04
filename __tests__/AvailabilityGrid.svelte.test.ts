import { flushSync, mount, unmount } from 'svelte'
import { fireEvent, within } from '@testing-library/dom'
import AvailabilityGrid from '../src/lib/shared/AvailabilityGrid.svelte'
import {
  patternColumns,
  type CellInfo,
  type CellKey,
} from '../src/lib/shared/availabilityGrid'

// jsdom has no layout, so the drag's elementFromPoint is pointed at whichever
// cell the test says the pointer is over.
let pointerOver: Element | null = null
document.elementFromPoint = () => pointerOver

const ROWS = { start: 9 * 60, end: 10 * 60 }

describe('AvailabilityGrid', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
    pointerOver = null
  })

  // Cells are addressed by their grid key, the coordinate the component
  // draws them by, and the one its pointer handling reads back.
  const cell = (key: CellKey) =>
    // eslint-disable-next-line testing-library/no-node-access
    container.querySelector<HTMLElement>(`[data-cell="${key}"]`)!

  function paintGrid(
    props: {
      selected?: Set<CellKey>
      cells?: Record<CellKey, CellInfo>
      isDisabled?: (key: CellKey) => boolean
    } = {},
  ) {
    const state = { selected: props.selected ?? new Set<CellKey>() }
    const app = mount(AvailabilityGrid, {
      target: container,
      props: {
        label: 'Your weekly availability',
        mode: 'paint',
        columns: patternColumns(),
        rows: ROWS,
        durationMinutes: 15,
        cells: props.cells,
        isDisabled: props.isDisabled,
        get selected() {
          return state.selected
        },
        set selected(next: Set<CellKey>) {
          state.selected = next
        },
      },
    })
    flushSync()
    return { app, state }
  }

  function drag(from: CellKey, to: CellKey) {
    fireEvent.pointerDown(cell(from), { button: 0 })
    pointerOver = cell(to)
    fireEvent.pointerMove(within(container).getByRole('group'))
    flushSync()
    fireEvent.pointerUp(window)
    flushSync()
  }

  it('draws a row per interview and a column per day', () => {
    const { app } = paintGrid()

    expect(within(container).getAllByRole('button')).toHaveLength(4 * 7)
    expect(container.textContent).toContain('9:00 AM')
    expect(cell('1:540').getAttribute('aria-label')).toBe('Mon 9:00 AM')

    unmount(app)
  })

  it('paints the rectangle a drag covers', () => {
    const { app, state } = paintGrid()

    drag('1:540', '3:570')

    expect([...state.selected].sort()).toEqual(
      [
        '1:540',
        '1:555',
        '1:570',
        '2:540',
        '2:555',
        '2:570',
        '3:540',
        '3:555',
        '3:570',
      ].sort(),
    )
    expect(cell('2:555').getAttribute('aria-pressed')).toBe('true')

    unmount(app)
  })

  it('un-paints when the drag starts on a painted cell', () => {
    const { app, state } = paintGrid({
      selected: new Set(['1:540', '1:555', '2:540']),
    })

    drag('1:540', '1:555')

    expect([...state.selected]).toEqual(['2:540'])

    unmount(app)
  })

  it('toggles one cell on a click', () => {
    const { app, state } = paintGrid()

    fireEvent.pointerDown(cell('4:585'), { button: 0 })
    fireEvent.pointerUp(window)
    flushSync()
    expect([...state.selected]).toEqual(['4:585'])

    unmount(app)
  })

  it('toggles the focused cell from the keyboard', () => {
    const { app, state } = paintGrid()

    // A keyboard-activated click carries no pointer: detail is 0.
    fireEvent.click(cell('4:585'), { detail: 0 })
    flushSync()
    expect([...state.selected]).toEqual(['4:585'])

    unmount(app)
  })

  it('never paints over a locked or disabled cell', () => {
    const { app, state } = paintGrid({
      selected: new Set(['2:555']),
      cells: { '2:555': { tone: 'booked', label: 'Ada', locked: true } },
      isDisabled: (key) => key.startsWith('3:'),
    })

    drag('1:540', '3:570')
    expect(state.selected.has('2:555')).toBe(true)
    expect(state.selected.has('3:540')).toBe(false)
    expect(state.selected.has('1:570')).toBe(true)

    // Nor un-paints one: a drag can't start on it, or sweep it away.
    drag('2:540', '2:570')
    expect(state.selected.has('2:555')).toBe(true)
    expect(cell('2:555').textContent).toBe('Ada')

    unmount(app)
  })

  it('offers only pickable cells as buttons in pick mode, and reports the pick', () => {
    const onpick = jest.fn()
    const app = mount(AvailabilityGrid, {
      target: container,
      props: {
        label: 'Open interview times',
        mode: 'pick',
        columns: patternColumns(),
        rows: ROWS,
        durationMinutes: 15,
        cells: {
          '1:540': { tone: 'offered', pickable: true, title: 'Open' },
          '1:555': { tone: 'booked', title: 'Taken' },
        },
        onpick,
      },
    })
    flushSync()

    expect(cell('1:540').tagName).toBe('BUTTON')
    expect(cell('1:555').tagName).toBe('DIV')
    expect(cell('1:570').tagName).toBe('DIV')
    fireEvent.click(cell('1:540'))
    expect(onpick).toHaveBeenCalledWith('1:540')

    unmount(app)
  })
})
