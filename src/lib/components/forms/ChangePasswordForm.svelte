<script lang="ts">
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import { passwordSchema } from './schemas'
  import { alert } from '$lib/stores'
  import { signInWithEmailAndPassword, updatePassword } from 'firebase/auth'
  import Dialog from '$lib/components/Dialog.svelte'
  import ReauthenticateForm from '$lib/components/forms/ReauthenticateForm.svelte'
  import { auth, user } from '$lib/client/firebase'
  import DialogActions from '../DialogActions.svelte'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'

  const schema = z
    .object({
      newPassword: passwordSchema,
      confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: 'Passwords do not match.',
      path: ['confirmPassword'],
    })

  let showReauthDialog = $state(false)
  let passwordToUpdate = ''

  const formResult = superForm(
    defaults(
      { newPassword: '', confirmPassword: '' },
      zod(schema as any) as any,
    ) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      invalidateAll: false,
      applyAction: false,
      onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        passwordToUpdate = formVal.data.newPassword
        showReauthDialog = true
      },
    },
  )

  const { form, enhance, delayed, reset } = formResult

  function handleCancel() {
    reset()
    alert.trigger('info', 'Password change canceled.')
  }

  // Changing a password bumps Firebase's `tokensValidAfterTime`, which revokes
  // the `__session` cookie minted at sign-in: hooks.server.ts verifies it with
  // `checkRevoked: true`, so without a replacement the next server-rendered
  // request bounces the user to /signin with no explanation.
  //
  // Signing in again is the only way to mint one. Refreshing the existing
  // token is not enough, however forcefully: `getIdToken(true)` produces a new
  // `iat` but carries the old `auth_time` forward, and `auth_time` is what the
  // revocation check compares against `tokensValidAfterTime` - so the
  // refreshed token is revoked too, and /api/auth answers 500 with
  // `auth/id-token-revoked`. That only appears to work when the
  // reauthenticate and the password change land in the same clock second,
  // which happens often enough to look like a fix and never be one. A real
  // sign-in sets a new `auth_time`, which also satisfies /api/auth's
  // five-minute recency check - and we hold the credential it needs, because
  // it is the password we just set.
  async function resyncSessionCookie(newPassword: string) {
    const credential = await signInWithEmailAndPassword(
      auth,
      $user!.object.email as string,
      newPassword,
    )
    const idToken = await credential.user.getIdToken()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idToken }),
    })
    if (!res.ok) {
      throw new Error(`/api/auth responded ${res.status}`)
    }
  }

  async function handleReauthenticate() {
    if ($user) {
      try {
        await updatePassword($user.object, passwordToUpdate)
        // The password change has already succeeded by this point, so a
        // resync failure must not be reported as a failed password change.
        // Report what actually happened instead - the change stuck, the
        // session did not - rather than swallowing it into a success message
        // and letting the next navigation deliver the news.
        let message = 'Password was successfully changed.'
        try {
          await resyncSessionCookie(passwordToUpdate)
        } catch (resyncErr) {
          console.error(
            '[ChangePasswordForm] Failed to resync session cookie:',
            resyncErr,
          )
          message += ' Please sign in again.'
        }
        alert.trigger('success', message)
      } catch (err: any) {
        alert.trigger('error', err.code, true)
      } finally {
        reset()
        showReauthDialog = false
      }
    }
  }
</script>

<form use:enhance class="w-full">
  <fieldset class="space-y-4" disabled={$delayed}>
    <span class="font-bold">Change password</span>

    <div class="flex items-end gap-2">
      <div class="flex w-full flex-col gap-1.5">
        <FormInput
          form={formResult}
          name="newPassword"
          label="New password"
          type="password"
          inputName="new-password"
          bind:value={$form.newPassword}
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
          name="confirmPassword"
          label="Confirm password"
          type="password"
          inputName="confirm-password"
          bind:value={$form.confirmPassword}
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
