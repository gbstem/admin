<script lang="ts">
  import { constraintAt, constraintsStore } from './fieldConstraints'
  import { fromStore } from 'svelte/store'
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { cn } from '$lib/utils'

  interface Props {
    class?: string
    form: any
    name: string
    label?: string
    required?: boolean | undefined
    type?: string
    placeholder?: string
    value: any
    inputName?: string
    [key: string]: any
  }

  let {
    class: className = '',
    form,
    name,
    label = '',
    required = undefined,
    type = 'text',
    placeholder = '',
    value = $bindable(),
    inputName = '',
    ...rest
  }: Props = $props()

  // A superForm's `constraints` is a store - see `constraintsStore`.
  const constraints = $derived(fromStore(constraintsStore(form)))
  let fieldConstraints = $derived(constraintAt(constraints.current, name))
  let isRequired = $derived(required ?? fieldConstraints?.required ?? false)
</script>

<Field {form} {name}>
  <Control>
    {#snippet children({ props })}
      <div class="relative mt-2">
        {#if label}
          <Label class="text-sm font-bold">
            {label}
            {#if isRequired}<span class="text-red-500">*</span>{/if}
          </Label>
        {/if}
        <input
          {...props}
          name={inputName || props.name}
          {type}
          {placeholder}
          required={isRequired}
          min={rest.min ?? fieldConstraints?.min}
          max={rest.max ?? fieldConstraints?.max}
          minlength={rest.minlength ?? fieldConstraints?.minlength}
          maxlength={rest.maxlength ?? fieldConstraints?.maxlength}
          pattern={rest.pattern ?? fieldConstraints?.pattern}
          step={rest.step ?? fieldConstraints?.step}
          bind:value
          class={cn(
            'mt-1 block h-12 w-full appearance-none rounded-md border border-gray-400 px-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400',
            className,
          )}
          {...rest}
        />
      </div>
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500 empty:hidden" />
</Field>
