<script lang="ts">
  import Card from '#lib/components/Card.svelte'
  import { registrationsCollection } from '#lib/data/collections.js'
  import { registrationService } from '#lib/services/registrationService.js'
  import { alert } from '#lib/stores.js'
  import { cloneDeep } from 'lodash-es'
  import Button from './Button.svelte'
  import Dialog from './Dialog.svelte'
  import EditRegistrationForm from './forms/EditRegistrationForm.svelte'
  import { createDefaultRegistrationValues } from '#lib/helpers/editRegistrationForm.js'

  interface Props {
    open?: boolean
    id: string | undefined
    collection?: string
  }

  let {
    open = $bindable(false),
    id,
    collection = registrationsCollection,
  }: Props = $props()

  let disabled = $state(true)
  let dbValues: Data.Registration<'client'> | undefined = $state()
  // Gates the Edit button: this dialog keeps the previous registration's
  // `values` when it reopens, so without this an admin could start editing
  // stale data and have the fetch below overwrite the edits when it lands.
  let loaded = $state(false)
  // Bumped only when the form should be reseeded from `values` - see the note
  // on the $effect in EditRegistrationForm.svelte.
  let seedVersion = $state(0)

  let values: Data.Registration<'client'> = $state(
    createDefaultRegistrationValues(),
  )
  let formEl: HTMLFormElement | undefined = $state()

  $effect(() => {
    const currentId = id
    if (!open || currentId === undefined) return
    let cancelled = false
    ;(async () => {
      disabled = true
      loaded = false
      try {
        const data = await registrationService.fetchRegistration(
          collection,
          currentId,
        )
        if (cancelled) return
        if (data) {
          values = cloneDeep(data)
          dbValues = cloneDeep(data)
          seedVersion++
          loaded = true
        } else {
          alert.trigger('error', 'Registration not found.')
        }
      } catch (err: any) {
        console.error('Failed to load registration:', err)
        alert.trigger('error', 'Failed to load registration.')
      }
    })()
    return () => {
      cancelled = true
    }
  })

  function handleEdit() {
    disabled = false
  }
  function handleSaveChanges() {
    if (formEl) {
      formEl.requestSubmit()
    }
  }
  function handleDeleteChanges() {
    disabled = true
    // Reset to loaded database values
    if (dbValues) values = cloneDeep(dbValues)
    seedVersion++
  }
</script>

<Dialog bind:open size="full" alert>
  {#snippet title()}
    Registration
  {/snippet}
  {#snippet description()}
    <div class="w-full min-w-0">
      <Card
        class="sticky top-2 z-50 flex flex-wrap items-center justify-between gap-3 p-3"
      >
        {#if !disabled}
          <div class="flex flex-wrap gap-2">
            <Button color="green" onclick={handleSaveChanges}
              >Save changes</Button
            >
            <Button color="red" onclick={handleDeleteChanges}
              >Delete changes</Button
            >
          </div>
        {/if}
        <div class="flex flex-wrap gap-2">
          <Button onclick={handleEdit} disabled={!loaded}>Edit</Button>
          <Button onclick={() => (open = false)}>Close</Button>
        </div>
      </Card>
      <div class="mt-4 flex justify-center">
        <EditRegistrationForm
          bind:formEl
          bind:disabled
          bind:values
          bind:dbValues
          {id}
          {collection}
          {seedVersion}
          {loaded}
        />
      </div>
    </div>
  {/snippet}
</Dialog>
