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
    value?: string
    label?: string
    name?: string
    required?: boolean
    validations?: Array<Validation>
    placeholder?: string | undefined
    [key: string]: any
  }

  let {
    class: className = '',
    self = $bindable(undefined),
    id = uniqueId('datetime-input-'),
    value = $bindable(''),
    label = '',
    name = kebabCase(label),
    required = false,
    validations = [],
    placeholder = undefined,
    ...rest
  }: Props = $props()

  let validationMessage = $derived.by(() => {
    if (!self) return ''
    const state = (
      [
        [required && value === '', 'Please fill required fields.'],
        ...validations,
      ] as Array<Validation>
    ).find((validation) => validation[0])
    return state === undefined ? '' : state[1]
  })

  $effect(() => {
    self?.setCustomValidity(validationMessage)
  })
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
      bind:value
      type="datetime-local"
      {id}
      {name}
      {required}
      {placeholder}
      {...rest}
    />
  </div>
</div>
