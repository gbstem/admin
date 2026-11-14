<script lang="ts">
  import { Combobox } from 'bits-ui'
  import { cn } from '#lib/utils.js'
  import { kebabCase, uniqueId } from 'lodash-es'
  import { untrack } from 'svelte'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { ChevronUpDown } from '@steeze-ui/heroicons'

  type SelectOptionJson = {
    name: string
    [key: string]: any
  }

  interface Props {
    class?: string
    id?: string
    value?: string
    label?: string
    name?: string
    required?: boolean
    placeholder?: string
    options?: Array<SelectOptionJson>
    onchange?: (value: string) => void
    [key: string]: any
  }

  let {
    class: className = '',
    id = uniqueId('searchable-select-'),
    value = $bindable(''),
    label = '',
    name = kebabCase(label),
    required = false,
    placeholder = undefined,
    options: optionsJson = [],
    onchange,
    ...rest
  }: Props = $props()

  let open = $state(false)
  let inputText = $state(untrack(() => value ?? ''))
  let isFiltering = $state(false)
  let suppressFocusOpen = false
  let prevPropValue = untrack(() => value ?? '')

  let optionNames = $derived(optionsJson.map((item) => item.name))

  let filteredOptions = $derived.by(() => {
    if (!isFiltering || inputText === '') {
      if (!value) return optionNames
      return [value, ...optionNames.filter((opt) => opt !== value)]
    }
    const lowerCaseValue = inputText.toLowerCase()
    return optionNames.filter(
      (opt) => opt && opt.toLowerCase().includes(lowerCaseValue),
    )
  })

  $effect(() => {
    const nextVal = value ?? ''
    if (nextVal !== prevPropValue) {
      prevPropValue = nextVal
      inputText = nextVal
      isFiltering = false
    }
  })

  function commitSelection(nextValue: string) {
    const changed = nextValue !== value
    value = nextValue
    prevPropValue = nextValue
    inputText = nextValue
    isFiltering = false
    open = false
    if (changed) {
      onchange?.(nextValue)
    }
  }

  function handleValueChange(nextValue: string) {
    if (!nextValue) return
    commitSelection(nextValue)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      inputText = value ?? ''
      isFiltering = false
    }
  }

  function handleFocusIn() {
    if (suppressFocusOpen) {
      suppressFocusOpen = false
      return
    }
    isFiltering = false
    open = true
  }

  function handleInputClick() {
    if (!open) {
      isFiltering = false
      open = true
    }
  }

  function handleTriggerPointerDown() {
    suppressFocusOpen = true
    queueMicrotask(() => {
      suppressFocusOpen = false
    })
  }

  function handleInput(
    e: Event & { currentTarget: EventTarget & HTMLInputElement },
  ) {
    if (!open) {
      open = true
    }
    isFiltering = true
    inputText = e.currentTarget.value
  }
</script>

<Combobox.Root
  type="single"
  allowDeselect={false}
  bind:open
  {value}
  inputValue={inputText}
  onValueChange={handleValueChange}
  onOpenChange={handleOpenChange}
>
  <div class={cn('relative mt-2', className)}>
    {#if label}
      <label for={id} class="text-sm font-bold">
        <span>
          {label}<span class={cn('text-red-500', !required && 'hidden')}>*</span
          >
        </span>
      </label>
    {/if}
    <div class="relative">
      <div class="absolute top-0 right-0 flex h-12 items-center pr-2">
        <Combobox.Trigger
          aria-label="Toggle dropdown"
          type="button"
          onpointerdown={handleTriggerPointerDown}
        >
          <Icon src={ChevronUpDown} class="size-6" />
        </Combobox.Trigger>
      </div>
      <Combobox.Input
        class={cn(
          'mt-1 block h-12 w-full appearance-none rounded-md border border-gray-400 pr-9 pl-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400',
          className,
        )}
        type="text"
        data-1p-ignore
        {id}
        {name}
        {required}
        {placeholder}
        {...rest}
        onfocusin={handleFocusIn}
        onclick={handleInputClick}
        oninput={handleInput}
      />
      <Combobox.ContentStatic
        class="absolute top-14 left-0 z-20 max-h-60 w-full overflow-hidden overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-xs"
      >
        <Combobox.Viewport>
          {#if filteredOptions.length === 0}
            <div class="w-full px-6 py-2 text-left">Nothing found.</div>
          {:else}
            {#each filteredOptions as optionName, index (`${index}:${optionName}`)}
              <Combobox.Item value={optionName} label={optionName}>
                {#snippet child({ props, highlighted })}
                  <button
                    {...props}
                    type="button"
                    class={cn(
                      'w-full px-6 py-2 text-left transition-colors duration-300',
                      highlighted && 'bg-gray-100',
                    )}
                    onclick={() => {
                      if (value !== optionName) {
                        commitSelection(optionName)
                      } else if (open) {
                        open = false
                      }
                    }}
                  >
                    {optionName}
                  </button>
                {/snippet}
              </Combobox.Item>
            {/each}
          {/if}
        </Combobox.Viewport>
      </Combobox.ContentStatic>
    </div>
  </div>
</Combobox.Root>
