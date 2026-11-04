<!--
  AvailabilityGrid.svelte - The when2meet-style week grid both sides of
  interview scheduling use (see availabilityGrid.ts). Kept byte-identical in
  admin and portal, and free of `#lib` imports, like the rest of
  `src/lib/shared/`.

  Days run across and rows of one interview's length down, in the viewer's
  time zone. In `paint` mode a drag paints (or, starting on a painted cell,
  un-paints) the rectangle between where it started and where it is, and
  Enter or Space toggles the focused cell. In `pick` mode the cells marked
  `pickable` are buttons that call `onpick`. `view` only shows.
-->
<script lang="ts">
  import {
    cellKey,
    formatMinute,
    type CellInfo,
    type CellKey,
    type CellTone,
    type RowRange,
    type WeekColumn,
  } from './availabilityGrid'

  type GridColumn = Pick<WeekColumn, 'day' | 'label'> & { disabled?: boolean }

  interface Props {
    columns: GridColumn[]
    rows: RowRange
    durationMinutes: number
    mode: 'paint' | 'pick' | 'view'
    /** What the grid is of, for screen readers: "Your weekly availability". */
    label: string
    /** The painted cells. Painting replaces the set rather than mutating it. */
    selected?: Set<CellKey>
    cells?: Record<CellKey, CellInfo>
    /** The cell picked so far, highlighted. */
    picked?: CellKey | null
    onpick?: (key: CellKey) => void
    /** Cells to grey out besides disabled columns, e.g. ones already past. */
    isDisabled?: (key: CellKey) => boolean
    class?: string
  }

  let {
    columns,
    rows,
    durationMinutes,
    mode,
    label,
    selected = $bindable(new Set<CellKey>()),
    cells = {},
    picked = null,
    onpick,
    isDisabled = () => false,
    class: className = '',
  }: Props = $props()

  let minutes = $derived.by(() => {
    const list: number[] = []
    for (let m = rows.start; m < rows.end; m += durationMinutes) list.push(m)
    return list
  })

  function disabled(column: GridColumn, key: CellKey): boolean {
    return Boolean(column.disabled) || isDisabled(key)
  }

  function paintable(columnIndex: number, key: CellKey): boolean {
    return !disabled(columns[columnIndex], key) && !cells[key]?.locked
  }

  // A drag in progress: where it started, whether it paints or un-paints, and
  // the cell under the pointer now. The selection only changes when it ends.
  let drag: {
    from: { column: number; row: number }
    to: { column: number; row: number }
    paint: boolean
  } | null = $state(null)

  let shown = $derived.by(() => {
    if (!drag) return selected
    const next = new Set(selected)
    const [c0, c1] = [drag.from.column, drag.to.column].sort((a, b) => a - b)
    const [r0, r1] = [drag.from.row, drag.to.row].sort((a, b) => a - b)
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const key = cellKey(columns[c].day, minutes[r])
        if (!paintable(c, key)) continue
        if (drag.paint) next.add(key)
        else next.delete(key)
      }
    }
    return next
  })

  /** The grid position of the cell under a pointer, if any. */
  function cellAt(event: PointerEvent): { column: number; row: number } | null {
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-column]')
    if (!target) return null
    return {
      column: Number(target.dataset.column),
      row: Number(target.dataset.row),
    }
  }

  function startDrag(event: PointerEvent, column: number, row: number) {
    // The main button, or a touch or pen (button 0 too).
    if (mode !== 'paint' || event.button > 0) return
    const key = cellKey(columns[column].day, minutes[row])
    if (!paintable(column, key)) return
    event.preventDefault()
    drag = {
      from: { column, row },
      to: { column, row },
      paint: !selected.has(key),
    }
  }

  function moveDrag(event: PointerEvent) {
    if (!drag) return
    const at = cellAt(event)
    if (at && (at.column !== drag.to.column || at.row !== drag.to.row)) {
      drag = { ...drag, to: at }
    }
  }

  function endDrag() {
    if (!drag) return
    selected = shown
    drag = null
  }

  /** Enter or Space on a focused cell: a click with no pointer behind it. */
  function keyToggle(event: MouseEvent, column: number, key: CellKey) {
    if (event.detail !== 0 || !paintable(column, key)) return
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selected = next
  }

  const toneClasses: Record<CellTone, string> = {
    offered: 'bg-blue-200 text-blue-900',
    open: 'bg-green-200 text-green-900',
    booked: 'bg-amber-300 text-amber-950',
    available: 'bg-green-200 text-green-900',
    mine: 'bg-gray-200 text-gray-700',
  }

  function cellClass(key: CellKey, isDisabled: boolean): string {
    const info = cells[key]
    if (isDisabled) return 'bg-gray-100 text-gray-400'
    if (mode === 'pick' && picked === key) {
      return 'bg-blue-600 text-white'
    }
    if (mode === 'paint' && shown.has(key)) {
      return info?.tone === 'offered'
        ? 'bg-green-500 text-white ring-2 ring-inset ring-blue-500'
        : 'bg-green-500 text-white'
    }
    return info ? toneClasses[info.tone] : 'bg-white'
  }

  function cellName(column: GridColumn, minute: number, key: CellKey): string {
    const info = cells[key]
    return [`${column.label} ${formatMinute(minute)}`, info?.title]
      .filter(Boolean)
      .join(', ')
  }
</script>

<svelte:window onpointerup={endDrag} onpointercancel={endDrag} />

<div
  role="group"
  aria-label={label}
  class="w-full overflow-x-auto {className}"
  onpointermove={moveDrag}
>
  <div
    class="grid min-w-88 gap-px rounded-md border border-gray-300 bg-gray-300 text-xs select-none"
    style="grid-template-columns: 4rem repeat({columns.length}, minmax(0, 1fr)); touch-action: {mode ===
    'paint'
      ? 'none'
      : 'auto'};"
  >
    <div class="bg-gray-50"></div>
    {#each columns as column (column.day)}
      <div
        class="bg-gray-50 p-1 text-center font-semibold {column.disabled
          ? 'text-gray-400'
          : 'text-gray-700'}"
      >
        {column.label}
      </div>
    {/each}

    {#each minutes as minute, row (minute)}
      <div
        class="bg-gray-50 pr-1 text-right leading-5 text-gray-500 {minute %
          60 ===
        0
          ? ''
          : 'text-transparent'}"
        aria-hidden={minute % 60 !== 0}
      >
        {formatMinute(minute)}
      </div>
      {#each columns as column, columnIndex (column.day)}
        {@const key = cellKey(column.day, minute)}
        {@const info = cells[key]}
        {@const off = disabled(column, key)}
        {#if mode === 'paint'}
          <button
            type="button"
            data-cell={key}
            data-column={columnIndex}
            data-row={row}
            class="h-5 truncate px-0.5 text-[10px] leading-5 {cellClass(
              key,
              off,
            )} {off || info?.locked ? 'cursor-not-allowed' : 'cursor-pointer'}"
            aria-label={cellName(column, minute, key)}
            aria-pressed={shown.has(key)}
            aria-disabled={off || info?.locked}
            title={info?.title}
            onpointerdown={(event) => startDrag(event, columnIndex, row)}
            onclick={(event) => keyToggle(event, columnIndex, key)}
            >{info?.label ?? ''}</button
          >
        {:else if mode === 'pick' && info?.pickable && !off}
          <button
            type="button"
            data-cell={key}
            data-column={columnIndex}
            data-row={row}
            class="h-5 cursor-pointer truncate px-0.5 text-[10px] leading-5 hover:brightness-95 {cellClass(
              key,
              off,
            )}"
            aria-label={cellName(column, minute, key)}
            aria-pressed={picked === key}
            title={info.title}
            onclick={() => onpick?.(key)}>{info.label ?? ''}</button
          >
        {:else}
          <div
            data-cell={key}
            data-column={columnIndex}
            data-row={row}
            class="h-5 truncate px-0.5 text-[10px] leading-5 {cellClass(
              key,
              off,
            )}"
            title={info?.title}
          >
            {#if info}<span class="sr-only"
                >{cellName(column, minute, key)}</span
              >{info.label ?? ''}{/if}
          </div>
        {/if}
      {/each}
    {/each}
  </div>
</div>
