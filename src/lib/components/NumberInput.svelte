<script lang="ts">
  import { cn } from '#lib/utils.js'
  import { kebabCase, uniqueId } from 'lodash-es'

  type Validation = [boolean, string]

  interface Props {
    class?:
      | string
      | {
          input?: string
          container?: string
        }
    self?: HTMLInputElement | undefined
    id?: string
    value?: number | string
    label?: string
    name?: string
    required?: boolean
    validations?: Array<Validation>
    placeholder?: string | undefined
    min?: number | string
    max?: number | string
    step?: number | string
    [key: string]: any
  }

  let {
    class: className = '',
    self = $bindable(undefined),
    id = uniqueId('number-input-'),
    value = $bindable(''),
    label = '',
    name = kebabCase(label),
    required = false,
    validations = [],
    placeholder = undefined,
    min = undefined,
    max = undefined,
    step = undefined,
    ...rest
  }: Props = $props()

  let validationMessage = $derived.by(() => {
    if (!self) return ''
    const state = (
      [
        [
          required && (value === '' || value === undefined),
          'Please fill required fields.',
        ],
        ...validations,
      ] as Array<Validation>
    ).find((validation) => validation[0])
    return state === undefined ? '' : state[1]
  })

  $effect(() => {
    self?.setCustomValidity(validationMessage)
  })

  function handleInput(e: Event) {
    if (e.target instanceof HTMLInputElement) {
      const v = e.target.value
      value = v === '' ? '' : +v
    }
  }
</script>

<div
  class={cn(
    'mt-2',
    typeof className === 'object' && className !== null && className.container,
  )}
>
  {#if label}
    <label for={id} class="text-sm font-bold">
      <span>
        {label}<span class={cn('text-red-500', !required && 'hidden')}>*</span>
      </span>
    </label>
  {/if}
  <div class="relative">
    <input
      class={cn(
        'mt-1 block h-12 w-full appearance-none rounded-md border border-gray-400 px-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400 disabled:placeholder:text-gray-400',
        typeof className === 'string' && className,
        typeof className === 'object' && className !== null && className.input,
      )}
      bind:this={self}
      value={value ?? ''}
      oninput={handleInput}
      type="number"
      {id}
      {name}
      {required}
      {placeholder}
      {min}
      {max}
      {step}
      {...rest}
    />
  </div>
</div>
