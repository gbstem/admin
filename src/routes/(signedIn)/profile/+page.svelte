<script lang="ts">
  import type { ActionRequestBody } from '../../api/action/+server'
  import ChangeEmailForm from '#lib/components/forms/ChangeEmailForm.svelte'
  import ChangePasswordForm from '#lib/components/forms/ChangePasswordForm.svelte'
  import DeleteAccountForm from '#lib/components/forms/DeleteAccountForm.svelte'
  import { fade } from 'svelte/transition'
  import { alert } from '#lib/stores.js'
  import ChangeNameForm from '#lib/components/forms/ChangeNameForm.svelte'
  import Card from '#lib/components/Card.svelte'
  import type { PageData } from './$types'
  import { user } from '#lib/client/firebase.js'
  import Field from '#lib/components/Field.svelte'
  import Dialog from '#lib/components/Dialog.svelte'
  import Button from '#lib/components/Button.svelte'
  import DialogActions from '#lib/components/DialogActions.svelte'
  import { writeToClipboard } from '#lib/utils.js'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { DocumentDuplicate, ExclamationCircle } from '@steeze-ui/heroicons'

  interface Props {
    data: PageData
  }

  let { data }: Props = $props()

  // svelte-ignore state_referenced_locally
  let showVerifyDialog = $state(!data.user.emailVerified)
  let disabled = $state(false)

  async function handleVerificationEmail() {
    if ($user) {
      disabled = true
      const payload: ActionRequestBody = {
        type: 'verifyEmail',
      }
      fetch('/api/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (res.ok) {
          alert.trigger('info', 'Verification email was sent.')
        } else {
          const { message } = await res.json()
          alert.trigger('error', message)
        }
        disabled = false
      })
    }
  }
</script>

<svelte:head>
  <title>Profile</title>
</svelte:head>

<Dialog bind:open={showVerifyDialog} size="min">
  {#snippet title()}
    Please verify your email
  {/snippet}
  {#snippet description()}
    <div class="space-y-4">
      <p>
        Your email is not verified, so most of the site is locked until it is.
        Close this message, press "Send verification email" on the red banner,
        then open the link in the message we send you. If you've just signed up,
        an email is already on its way; check your spam folder too.
      </p>
      <p>
        We also reset email verification on accounts that haven't been used in a
        long while, to keep personal information safe. Can't get the email?
        Contact us at
        <a href="mailto:contact@gbstem.org" class="link">contact@gbstem.org</a>.
      </p>
      <DialogActions>
        <Button onclick={() => (showVerifyDialog = false)}>Close</Button>
      </DialogActions>
    </div>
  {/snippet}
</Dialog>

<h1 class="mb-8 text-5xl font-bold md:text-6xl">Profile</h1>

<div class="flex flex-col items-center">
  <div class="grid w-full max-w-2xl gap-6">
    {#if !data.user.emailVerified}
      <div
        data-testid="email-unverified-banner"
        class="mt-2 flex w-full items-center gap-4 rounded-md bg-red-200 px-5 py-4 shadow-sm"
        transition:fade
      >
        <Icon src={ExclamationCircle} class="size-6 shrink-0" />
        <div class="grow">
          Email is not verified. Press <button
            class="inline-block border-b border-black text-black transition-colors duration-300 hover:border-gray-600 hover:text-gray-600 disabled:border-gray-600 disabled:text-gray-600"
            type="button"
            onclick={handleVerificationEmail}
            {disabled}>Send verification email</button
          >, then open the link in the message we send you (check your spam
          folder too). If you've just signed up, an email is already on its way.
          After opening the link, reload this page.
        </div>
      </div>
    {/if}
    <Card class="space-y-3">
      <div class="relative">
        <Field class="pr-9">
          <div class="relative h-6 overflow-x-auto">
            <div class="absolute top-0 left-0 whitespace-nowrap">
              {`UID: ${data.user.uid}`}
            </div>
          </div>
        </Field>
        <div class="absolute top-2.5 right-2">
          <button
            class="text-black transition-colors duration-300 hover:text-gray-700"
            type="button"
            aria-label="Copy user ID to clipboard"
            onclick={() => {
              writeToClipboard(data.user.uid)
            }}
          >
            <Icon src={DocumentDuplicate} class="size-5" />
          </button>
        </div>
      </div>
      <Field>
        {`Role: ${data.user.role}`}
      </Field>
      <div class="text-sm">
        Any problems with changing your profile? Contact us at <a
          href="mailto:contact@gbstem.org"
          target="_blank"
          rel="noopener"
          class="link">contact@gbstem.org</a
        >.
      </div>
    </Card>
    <ChangeNameForm />
    <ChangeEmailForm />
    <ChangePasswordForm />
    <DeleteAccountForm />
  </div>
</div>
