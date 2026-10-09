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
    required?: boolean | undefined
    value: any
    inputName?: string
    children?: import('svelte').Snippet
    [key: string]: any
  }

  let {
    class: className = '',
    form,
    name,
    label = '',
    required = undefined,
    value = $bindable(),
    inputName = '',
    children: selectChildren,
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
        <select
          {...props}
          name={inputName || props.name}
          required={isRequired}
          bind:value
          class={cn(
            'mt-1 block h-12 w-full rounded-md border border-gray-400 bg-white px-3 transition-colors focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400',
            className,
          )}
          {...rest}
        >
          {@render selectChildren?.()}
        </select>
      </div>
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500" />
</Field>
