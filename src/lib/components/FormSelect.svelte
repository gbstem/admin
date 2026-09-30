<script lang="ts">
  import { constraintAt, constraintsStore } from './fieldConstraints'
  import { fromStore } from 'svelte/store'
  import Select from '$lib/components/Select.svelte'
  import { Control, Field, FieldErrors } from 'formsnap'

  interface Props {
    class?: string
    form: any
    name: string
    label?: string
    required?: boolean | undefined
    value: string
    options: any[]
    inputName?: string
    [key: string]: any
  }

  let {
    class: className = '',
    form,
    name,
    label = '',
    required = undefined,
    value = $bindable(),
    options,
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
      <Select
        {...props}
        name={inputName || props.name}
        class={className}
        {label}
        {options}
        required={isRequired}
        bind:value
        {...rest}
      />
    {/snippet}
  </Control>
  <FieldErrors class="text-xs font-semibold text-red-500" />
</Field>
