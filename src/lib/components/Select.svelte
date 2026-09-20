<script module lang="ts">
  type SelectData = {
    id: string
    setOpen: (newState: boolean) => void
  }
  let current: SelectData

  function registerOpenSelect(
    id: string,
    setOpen: (newState: boolean) => void,
  ) {
    if (current && current.id !== id) {
      current.setOpen(false)
    }
    current = { id, setOpen }
  }
</script>

<script lang="ts">
  import { clickOutside, cn } from '$lib/utils'
  import { debounce, kebabCase, uniqueId } from 'lodash-es'
  import { fade } from 'svelte/transition'
  import { untrack } from 'svelte'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { ChevronUpDown } from '@steeze-ui/heroicons'

  type SelectOption = string
  type SelectOptionJson = {
    name: string
    [key: string]: any
  }
  interface Props {
    class?: string
    self?: HTMLInputElement | undefined
    id?: any
    value: string
    label?: string
    name?: any
    required?: boolean
    placeholder?: string | undefined
    options?: Array<SelectOptionJson>
    onchange?: (value: string) => void
    [key: string]: any
  }

  let {
    class: className = '',
    self = $bindable(undefined),
    id = uniqueId('select-'),
    value = $bindable(),
    label = '',
    name = kebabCase(label),
    required = false,
    placeholder = undefined,
    options: optionsJson = [],
    onchange,
    ...rest
  }: Props = $props()

  let open = $state(false)
  let selectedOptionIndex = $state(0)

  let filteredOptions: Array<SelectOption> = $state([])
  const filterOptionsBy = debounce((givenValue) => {
    const val = givenValue ?? ''
    if (val === '') {
      filteredOptions = options
    } else {
      const lowerCaseValue = val.toLowerCase()
      filteredOptions = options.filter(
        (name) => name && name.toLowerCase().indexOf(lowerCaseValue) !== -1,
      )
    }
  }, 150)

  // Guards the effect below against re-validating on every remount before
  // a freshly-mounted field's real value (from async parent data) settles -
  // not an infinite-loop guard, but a genuine fix: without it, a fresh
  // instance briefly sees its placeholder empty value, calls
  // setCustomValidity with an error, and native constraint validation then
  // blocks form submission even after the real value arrives, because
  // nothing else ever clears that message. See git history for the Cypress
  // failure this was caught by.
  let previousValue = value
  filterOptionsBy(value)

  // TODO: `value` does double duty here - it is both the committed selection
  // and the text currently in the box - and that is the root of a race this
  // component still has. Consumers feed `value` from a $derived source (the
  // URL, in StatusFilter/CourseFilter/CollectionFilter/PerPageControl), so any
  // navigation rewrites the prop while the user is mid-interaction: the
  // $effect below re-runs `filterOptionsBy` with the new value and the open
  // dropdown collapses to just that one option, so whatever the user was
  // reaching for is unmounted out from under the pointer. The same coupling
  // means a partially typed value that matches nothing is blanked on close
  // (see the `open` $effect), leaving an empty box beside a still-active
  // filter.
  //
  // Not committing typed text (below) closes the window that made this
  // reproducible - a Cypress flake in registrations.cy.ts Test Case 15, whose
  // `Expected to find content: 'all' within the element: <button.bg-gray-100>`
  // was the dropdown re-filtering down to one option mid-click - but it does
  // not close it entirely: an unrelated navigation on the same page can still
  // do it. The real fix is to split the two roles - keep a local `inputText`
  // $state for what is typed, filter on that, leave `value` as the committed
  // selection only, and on close reset `inputText` to `value` rather than
  // blanking `value`. If this class of bug resurfaces, start here.
  //
  // Typing filters the option list; it does not commit a selection. `onchange`
  // fires only from the commit paths - option click, Enter, and Tab - so
  // consumers never see a half-typed value. Before this, every keystroke in a
  // URL-backed filter pushed a history entry and refetched the table with a
  // junk param ("i", "in", "inc"), and clearing the box committed the empty
  // string as a real selection.
  function handleInput(
    e: Event & { currentTarget: EventTarget & HTMLInputElement },
  ) {
    if (!open) {
      open = true
    }
    selectedOptionIndex = 0
    value = (e.target as HTMLInputElement).value
  }
  function handleKeyDown(e: KeyboardEvent) {
    switch (e.code) {
      case 'Escape':
        open = false
        break
      case 'Enter':
        e.preventDefault()
        open = false
        value = filteredOptions[selectedOptionIndex]
        onchange?.(value)
        break
      case 'Tab':
        if (open) {
          e.preventDefault()
          open = false
          value = filteredOptions[selectedOptionIndex]
          onchange?.(value)
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (selectedOptionIndex !== 0) {
          --selectedOptionIndex
        }
        break
      case 'ArrowDown':
        e.preventDefault()
        if (selectedOptionIndex !== filteredOptions.length - 1) {
          ++selectedOptionIndex
        }
        break
    }
  }
  function handleFocusIn() {
    selectedOptionIndex = 0
    if (value === '') {
      filteredOptions = options
    } else {
      filteredOptions = [value, ...options.filter((name) => name !== value)]
    }
    open = true
  }
  let options = $derived(optionsJson.map((item) => item.name))

  function findOptionMatch(val: string): string | undefined {
    if (!val || !options || options.length === 0) return undefined
    if (options.includes(val)) return val
    const lower = val.toLowerCase()
    return options.find((o) => o.toLowerCase() === lower)
  }

  // Tracks only `open` - the register/validate branches read `value` and
  // `options` but shouldn't re-run just because those change while the
  // dropdown state itself hasn't, so those reads are untracked.
  $effect(() => {
    if (open) {
      registerOpenSelect(id, (newValue) => {
        if (newValue !== open) {
          open = newValue
        }
      })
    } else {
      untrack(() => {
        if (value) {
          const match = findOptionMatch(value)
          if (match) {
            if (value !== match) {
              value = match
            }
          } else {
            value = ''
          }
        }
      })
    }
  })

  $effect(() => {
    if (options) {
      filterOptionsBy(value)
    }
  })

  $effect(() => {
    if (value !== previousValue) {
      previousValue = value
      filterOptionsBy(value)
      if (self) {
        if (value === '') {
          if (required) {
            self.setCustomValidity('Please fill required fields.')
          } else {
            self.setCustomValidity('')
          }
        } else {
          const match = findOptionMatch(value)
          if (match) {
            self.setCustomValidity('')
          } else {
            self.setCustomValidity('Please select valid options.')
          }
        }
      }
    }
  })
</script>

<div
  class={cn('relative mt-2', className)}
  use:clickOutside
  onoutclick={() => {
    open = false
  }}
>
  {#if label}
    <label for={id} class="text-sm font-bold">
      <span>
        {label}<span class={cn('text-red-500', !required && 'hidden')}>*</span>
      </span>
    </label>
  {/if}
  <div class="relative">
    <div class="absolute top-0 right-0 flex h-12 items-center pr-2">
      <button
        type="button"
        aria-label="Toggle dropdown"
        onclick={() => {
          open = !open
          if (open && self) {
            self.focus()
          }
        }}
      >
        <Icon src={ChevronUpDown} class="size-6" />
      </button>
    </div>
    <input
      class={cn(
        'mt-1 block h-12 w-full appearance-none rounded-md border border-gray-400 pr-9 pl-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400',
        className,
      )}
      type="text"
      data-1p-ignore
      bind:this={self}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      onfocusin={handleFocusIn}
      {value}
      {id}
      {name}
      {required}
      {placeholder}
      {...rest}
    />
    {#if open}
      <div
        class="absolute top-14 left-0 z-20 max-h-60 w-full overflow-hidden overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-xs"
        transition:fade={{ duration: 100 }}
      >
        {#if filteredOptions.length === 0}
          <div class="w-full px-6 py-2 text-left">Nothing found.</div>
        {:else if filteredOptions.length === 1}
          <button
            class="w-full bg-gray-100 px-6 py-2 text-left transition-colors duration-300"
            type="button"
            onclick={() => {
              value = filteredOptions[0]
              open = false
              onchange?.(value)
            }}
          >
            {filteredOptions[0]}
          </button>
        {:else}
          {#each filteredOptions as name, index (name)}
            <button
              class={cn(
                'w-full px-6 py-2 text-left transition-colors duration-300',
                index === selectedOptionIndex && 'bg-gray-100',
              )}
              type="button"
              onclick={() => {
                value = name
                open = false
                onchange?.(value)
              }}
              onmouseenter={() => {
                selectedOptionIndex = index
              }}
            >
              {name}
            </button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
</div>
