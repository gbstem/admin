<script lang="ts">
  import { constraintAt, constraintsStore } from './fieldConstraints'
  import { fromStore } from 'svelte/store'
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { cn } from '#lib/utils.js'

  interface Props {
    class?: string
    form: any
    name: string
    label?: string
    checked: boolean
    required?: boolean | undefined
    inputName?: string
    [key: string]: any
  }

  let {
    class: className = '',
    form,
    name,
    label = '',
    checked = $bindable(),
    required = undefined,
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
      <div class="flex items-center">
        <input
          {...props}
          name={inputName || props.name}
          type="checkbox"
          bind:checked
          required={isRequired}
          class={cn(
            'peer size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-gray-400 checked:border-gray-600 checked:bg-gray-600 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 focus:ring-offset-1 focus:outline-hidden disabled:cursor-default disabled:checked:border-gray-400 disabled:checked:bg-gray-400',
            className,
          )}
          {...rest}
        />
        {#if label}
          <Label
            class="ml-2 cursor-pointer text-sm font-bold peer-disabled:cursor-default peer-disabled:text-gray-400"
          >
            {label}
            {#if isRequired}<span class="text-red-500">*</span>{/if}
          </Label>
        {/if}
      </div>
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500" />
</Field>
