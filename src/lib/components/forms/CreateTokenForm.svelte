<script lang="ts">
  import { page } from '$app/state'
  import Button from '../Button.svelte'
  import { alert } from '#lib/stores.js'
  import { invalidate } from '$app/navigation'
  import DialogActions from '../DialogActions.svelte'
  import { writeToClipboard } from '#lib/utils.js'
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import {
    CREATE_TOKEN_FORM_ID,
    getCreateTokenFormDefaults,
    tokenSchema,
  } from './schemas'
  import FormInput from '../FormInput.svelte'
  import FormSelect from '../FormSelect.svelte'
  import FormCheckbox from '../FormCheckbox.svelte'

  interface Props {
    onExit?: () => void
  }

  let { onExit }: Props = $props()

  const schema = tokenSchema

  // Saved by `/tokens?/createToken` - see the same note in
  // EditApplicationForm.svelte.
  const formResult = superForm(
    defaults(getCreateTokenFormDefaults(), zod(schema as any) as any, {
      id: CREATE_TOKEN_FORM_ID,
    }) as any,
    {
      validators: zod(schema as any) as any,
      dataType: 'json',
      // `invalidate('app:tokens')` below is the only load to re-run.
      invalidateAll: false,
      // Also called for a form that fails validation, client or server side.
      async onUpdate({ result }) {
        if (result.type !== 'success') return
        try {
          await writeToClipboard(
            `${page.url.host}/signup?token=${result.data.tokenId}`,
          )
        } catch {
          // ignore clipboard errors
        }
        await invalidate('app:tokens')
        alert.trigger('success', 'Changes were saved successfully.')
        onExit?.()
      },
      onError({ result }) {
        console.error('Token creation error:', result.error)
        alert.trigger(
          'error',
          result.error.message || 'Could not create the token.',
          true,
        )
      },
    },
  )

  const { form, enhance, delayed } = formResult
</script>

<form
  novalidate
  method="POST"
  action="?/createToken"
  use:enhance
  class="w-full"
>
  <fieldset class="space-y-4" disabled={$delayed}>
    <div class="flex w-full justify-center">
      <div class="w-full max-w-lg space-y-4 text-left">
        <div class="flex flex-col gap-1.5">
          <FormSelect
            form={formResult}
            name="role"
            inputName="what-role-should-this-token-grant"
            bind:value={$form.role}
            options={[{ name: 'reviewer' }, { name: 'admin' }]}
            label="What role should this token grant?"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <FormCheckbox
            form={formResult}
            name="consumable"
            inputName="should-this-token-be-one-time-use"
            label="Should this token be one-time use?"
            bind:checked={$form.consumable}
          />
          <p class="mt-1 text-sm leading-tight text-gray-500">
            After one account is created with this token, no one else can use
            the token to sign up.
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <FormInput
            form={formResult}
            name="expires"
            inputName="after-how-many-hours-should-this-token-expire"
            label="After how many hours should this token expire?"
            type="number"
            bind:value={$form.expires}
          />
          <span class="text-xs font-semibold text-gray-500"
            >Maximum is 48 hours.</span
          >
        </div>
      </div>
    </div>
    <DialogActions>
      <Button type="button" onclick={() => onExit?.()}>Cancel</Button>
      <Button type="submit" color="blue" disabled={$delayed}>Create</Button>
    </DialogActions>
  </fieldset>
</form>
