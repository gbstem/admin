<script lang="ts">
  import { cn } from '$lib/utils'
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
    value?: boolean
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
    id = uniqueId('checkbox-input-'),
    value = $bindable(false),
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
        [required && !value, 'Please fill required fields.'],
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
      value = e.target.checked
    }
  }
</script>

<div
  class={cn(
    'mt-2 flex',
    typeof className === 'object' && className !== null && className.container,
  )}
>
  <input
    class={cn(
      'peer mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400',
      typeof className === 'string' && className,
      typeof className === 'object' && className !== null && className.input,
    )}
    type="checkbox"
    checked={Boolean(value)}
    bind:this={self}
    oninput={handleInput}
    {id}
    {name}
    {required}
    {placeholder}
    {...rest}
  />
  {#if label}
    <label
      for={id}
      class="ml-2 cursor-pointer peer-disabled:cursor-default peer-disabled:text-gray-400"
    >
      <span>
        {label}{#if required}<span class="text-red-500">*</span>{/if}
      </span>
    </label>
  {/if}
</div>

<style>
  input:checked {
    background-image: url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e");
    background-size: 100% 100%;
    background-repeat: no-repeat;
    background-position: center;
  }
</style>
