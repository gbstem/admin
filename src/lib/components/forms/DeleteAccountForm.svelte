<script lang="ts">
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { alert } from '$lib/stores'
  import {
    EmailAuthProvider,
    reauthenticateWithCredential,
  } from 'firebase/auth'
  import Dialog from '$lib/components/Dialog.svelte'
  import { auth, user } from '$lib/client/firebase'
  import { userService } from '$lib/services/userService'
  import Button from '../Button.svelte'
  import DialogActions from '../DialogActions.svelte'

  const schema = z.object({
    password: z.string().min(1, 'Password is required'),
  })

  let showDeleteDialog = $state(false)
  let showBlockedDialog = $state(false)
  let blockedReason = $state('')
  let checkingEligibility = $state(false)

  /**
   * Runs the same eligibility check the DELETE route re-checks before
   * actually deleting anything, so a blocked account never even sees the
   * password prompt.
   */
  async function handleDeleteClick() {
    checkingEligibility = true
    try {
      const result = await userService.checkAccountDeletionEligibility()
      if (result.canDelete) {
        showDeleteDialog = true
      } else {
        blockedReason = result.reason ?? 'Your account cannot be deleted.'
        showBlockedDialog = true
      }
    } catch (err: any) {
      alert.trigger(
        'error',
        err.message ?? 'Failed to check account status.',
        true,
      )
    } finally {
      checkingEligibility = false
    }
  }

  const formResult = superForm(
    defaults({ password: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
          try {
            await reauthenticateWithCredential(
              frozenUser.object,
              EmailAuthProvider.credential(
                frozenUser.object.email as string,
                formVal.data.password,
              ),
            )
            await userService.deleteAccountViaApi()
            // The client SDK isn't told the account is gone (deletion ran
            // server-side, with the Admin SDK) - sign it out locally so
            // `user`/`auth.currentUser` don't keep stale state until the
            // next token refresh fails.
            await auth.signOut()
            alert.trigger('success', 'Account was successfully deleted.')
            window.setTimeout(() => {
              location.reload()
            }, 2000)
          } catch (err: any) {
            alert.trigger('error', err.message ?? err.code, true)
          }
        }
      },
    },
  )

  const { form, enhance, delayed, reset } = formResult

  function handleCancel() {
    reset()
    alert.trigger('info', 'Account deletion canceled.')
  }
</script>

<div class="w-full">
  <span class="font-bold">Delete account</span>
  <div class="mt-2">
    <button
      type="button"
      onclick={handleDeleteClick}
      disabled={checkingEligibility}
      class="rounded-md bg-red-100 px-4 py-2 text-red-900 shadow-xs transition-colors duration-300 hover:bg-red-200 disabled:bg-red-200 disabled:text-red-700"
      >Delete account</button
    >
  </div>
</div>

<Dialog bind:open={showBlockedDialog} alert>
  {#snippet title()}
    Can't delete account
  {/snippet}
  {#snippet description()}
    <div class="flex w-full flex-col items-center gap-4">
      <p class="text-center">{blockedReason}</p>
      <DialogActions>
        <Button type="button" onclick={() => (showBlockedDialog = false)}
          >Close</Button
        >
      </DialogActions>
    </div>
  {/snippet}
</Dialog>

<Dialog
  bind:open={showDeleteDialog}
  onCancel={handleCancel}
  disabled={$delayed}
  alert
>
  {#snippet title()}
    Delete account
  {/snippet}
  {#snippet description()}
    <div class="flex w-full justify-center">
      <form use:enhance class="w-full max-w-lg">
        <fieldset class="space-y-4" disabled={$delayed}>
          <div class="flex justify-center">
            <div class="w-full space-y-4">
              <div class="flex flex-col gap-1.5">
                <Field form={formResult} name="password">
                  <Control>
                    {#snippet children({ props })}
                      <Label class="text-sm font-bold">Password</Label>
                      <input
                        {...props}
                        type="password"
                        bind:value={$form.password}
                        placeholder="Password"
                        required
                        autocomplete="current-password"
                        class="block h-12 w-full appearance-none rounded-md border border-gray-400 px-3 transition-colors placeholder:text-gray-500 focus:border-gray-600 focus:outline-hidden disabled:bg-white disabled:text-gray-400"
                      />
                    {/snippet}
                  </Control>
                  <FieldErrors class="text-xs font-semibold text-red-500" />
                </Field>
              </div>
              <div class="text-center font-bold text-red-600">
                Warning! This is irreversible.
              </div>
            </div>
          </div>
          <DialogActions>
            <Button
              type="button"
              onclick={() => {
                handleCancel()
                showDeleteDialog = false
              }}>Cancel</Button
            >
            <Button color="red" type="submit" disabled={$delayed}>Delete</Button
            >
          </DialogActions>
        </fieldset>
      </form>
    </div>
  {/snippet}
</Dialog>
