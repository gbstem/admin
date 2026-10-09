<script lang="ts">
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import { auth } from '#lib/client/firebase.js'
  import Brand from '#lib/components/Brand.svelte'
  import Button from '#lib/components/Button.svelte'
  import Dialog from '#lib/components/Dialog.svelte'
  import DialogActions from '#lib/components/DialogActions.svelte'
  import EmailInput from '#lib/components/EmailInput.svelte'
  import Link from '#lib/components/Link.svelte'
  import Loading from '#lib/components/Loading.svelte'
  import PasswordInput from '#lib/components/PasswordInput.svelte'
  import TextInput from '#lib/components/TextInput.svelte'
  import { alert } from '#lib/stores.js'
  import { signInWithEmailAndPassword } from 'firebase/auth'
  import { onMount } from 'svelte'
  import type { ActionData, PageData } from './$types'

  interface Props {
    data: PageData
    form: ActionData
  }

  let { data, form }: Props = $props()

  let showErrorDialog = $state(true)

  let disabled = $state(false)
  let values = $state({
    email: '',
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  })

  // A stale registration link (expired, or already used to create an
  // account) hits `load` before the form below ever mounts, so its failure
  // has to surface as a notification here rather than the generic error
  // boundary - see the comment in +page.server.ts's `load`.
  onMount(() => {
    if (data.tokenError) {
      alert.trigger('error', data.tokenError)
    }
  })
</script>

<svelte:head>
  <title>Sign up</title>
</svelte:head>

{#if !data.token}
  <div class="w-full max-w-lg space-y-4">
    <Brand />
    <h1 class="text-2xl font-bold">Sign up</h1>
    <p>You can't sign up with this link.</p>
    <Link href="/signin">Need to sign in?</Link>
  </div>
{:else}
  <form
    class="w-full max-w-lg"
    method="POST"
    action="/signup"
    use:enhance={() => {
      disabled = true
      return async ({ result, update }) => {
        switch (result.type) {
          case 'success': {
            try {
              const credential = await signInWithEmailAndPassword(
                auth,
                values.email,
                values.password,
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
                const data = await res.json().catch(() => ({}))
                throw new Error(data.message || 'Unauthorized')
              }
              if (result.data?.emailWarning) {
                alert.trigger(
                  'error',
                  'Account created, but the verification email failed to send. You can request another from your profile page.',
                )
              }
              return goto('/profile')
            } catch (err: any) {
              disabled = false
              console.error('Sign in error after signup:', err)
              const isFirebaseError =
                err.code &&
                typeof err.code === 'string' &&
                err.code.includes('/')
              if (isFirebaseError) {
                alert.trigger('error', err.code, true)
              } else {
                alert.trigger('error', err.message || 'Unauthorized')
              }
            }
            break
          }
          default: {
            disabled = false
            // Re-arm the error dialog. `showErrorDialog` is only ever flipped
            // false by its own Close button, and nothing else resets it - so
            // without this, a second failed submit on the same page render (the
            // common case: fix a typo, submit again) renders the dialog with
            // open=false and the user sees nothing but the password fields
            // blanking below. That was a real production report.
            showErrorDialog = true
            values = {
              ...values,
              password: '',
              confirmPassword: '',
            }
            break
          }
        }
        // navigate: false - the result's location is the action URL, plain
        // `/signup`, and following it would drop the `?token=` this page was
        // opened with, so `load` would bounce to /signin instead of showing
        // the error dialog armed above.
        update({ navigate: false })
      }
    }}
  >
    <fieldset class="space-y-4" {disabled}>
      <Brand />
      <h1 class="text-2xl font-bold">Sign up</h1>
      <input name="token" type="hidden" value={data.token} />
      <div class="relative space-y-4">
        <div class="grid gap-2 sm:grid-cols-2 sm:gap-4">
          <TextInput
            bind:value={values.firstName}
            label="First name"
            required
          />
          <TextInput bind:value={values.lastName} label="Last name" required />
        </div>
        <EmailInput bind:value={values.email} label="Email" required />
        <PasswordInput
          bind:value={values.password}
          label="Password"
          required
          autocomplete="new-password"
        />
        <PasswordInput
          bind:value={values.confirmPassword}
          label="Confirm password"
          required
          autocomplete="new-password"
          validations={[
            [
              values.password !== values.confirmPassword,
              'Passwords do not match.',
            ],
          ]}
        />
        {#if disabled}
          <Loading class="absolute -inset-2 -top-4 z-50" />
        {/if}
      </div>
      <div class="mt-2 flex items-center justify-between">
        <div>
          <Link href="/signin">Need to sign in?</Link>
        </div>
        <Button color="blue" type="submit">Sign up</Button>
      </div>
    </fieldset>
  </form>

  {#if form?.error}
    <Dialog bind:open={showErrorDialog} alert>
      {#snippet title()}
        Error
      {/snippet}
      {#snippet description()}
        <div>
          <p>
            {#if form?.error}{form.error}{/if}
          </p>
          <DialogActions>
            <Button color="gray" onclick={() => (showErrorDialog = false)}
              >Close</Button
            >
          </DialogActions>
        </div>
      {/snippet}
    </Dialog>
  {/if}
{/if}
