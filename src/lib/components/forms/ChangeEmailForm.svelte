<script lang="ts">
  import type { ActionRequestBody } from '../../../routes/api/action/+server'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import { alert } from '$lib/stores'
  import Dialog from '$lib/components/Dialog.svelte'
  import ReauthenticateForm from '$lib/components/forms/ReauthenticateForm.svelte'
  import { user } from '$lib/client/firebase'
  import DialogActions from '../DialogActions.svelte'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'

  const schema = z.object({
    newEmail: z.string().email('Invalid email address'),
  })

  let showReauthDialog = $state(false)
  let emailToUpdate = ''

  const formResult = superForm(
    defaults({ newEmail: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      invalidateAll: false,
      applyAction: false,
      onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        emailToUpdate = formVal.data.newEmail
        showReauthDialog = true
      },
    },
  )

  const { form, enhance, delayed, reset } = formResult

  function handleCancel() {
    reset()
    alert.trigger('info', 'Email change canceled.')
  }

  async function handleReauthenticate() {
    if ($user) {
      showReauthDialog = false
      const payload: ActionRequestBody = {
        type: 'changeEmail',
        newEmail: emailToUpdate,
      }
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          alert.trigger('info', 'A verification email was sent.')
        } else {
          const { message } = await res.json()
          alert.trigger('error', message)
        }
      } catch (err: any) {
        console.error('Email change error:', err)
        alert.trigger('error', err.message || 'An error occurred.')
      } finally {
        reset()
      }
    }
  }
</script>

<form novalidate use:enhance class="w-full">
  <fieldset class="space-y-4" disabled={$delayed}>
    <span class="font-bold">Change email</span>

    <div class="flex items-end gap-2">
      <div class="flex w-full flex-col gap-1.5">
        <label class="text-sm font-bold" for="current-email"
          >Current email</label
        >
        <input
          id="current-email"
          type="email"
          value={$user && $user.object.email ? $user.object.email : ''}
          readonly
          disabled
          class="block h-12 w-full appearance-none rounded-md border border-gray-300 bg-gray-50 px-3 text-gray-500 outline-hidden"
        />
      </div>
      <Button
        class="invisible h-12 shrink-0 select-none"
        type="button"
        tabindex="-1">Update</Button
      >
    </div>

    <div class="flex items-end gap-2">
      <div class="flex w-full flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="newEmail"
          label="New email"
          type="email"
          inputName="new-email"
          bind:value={$form.newEmail}
        />
      </div>
      <Button
        color="blue"
        class="h-12 shrink-0"
        type="submit"
        disabled={$delayed}
      >
        Update
      </Button>
    </div>
  </fieldset>
</form>

<Dialog bind:open={showReauthDialog} onCancel={handleCancel}>
  {#snippet title()}
    Reauthenticate
  {/snippet}
  {#snippet description()}
    <ReauthenticateForm onReauthenticate={handleReauthenticate}>
      <DialogActions>
        <Button
          onclick={() => {
            handleCancel()
            showReauthDialog = false
          }}>Cancel</Button
        >
        <Button type="submit" color="blue">Reauthenticate</Button>
      </DialogActions>
    </ReauthenticateForm>
  {/snippet}
</Dialog>
