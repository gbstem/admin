<script lang="ts">
  import { user } from '#lib/client/firebase.js'
  import { userService } from '#lib/services/userService.js'
  import { alert } from '#lib/stores.js'
  import { updateProfile } from 'firebase/auth'
  import { onMount } from 'svelte'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import Loading from '../Loading.svelte'

  const schema = z.object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
  })

  let loading = $state(true)

  const formResult = superForm(
    defaults({ firstName: '', lastName: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      invalidateAll: false,
      applyAction: false,
      resetForm: false,
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          const frozenUser = $user
          const firstName = formVal.data.firstName.trim()
          const lastName = formVal.data.lastName.trim()
          try {
            // `users/{uid}` is canonical, so it goes first: if the derived
            // displayName sync fails afterwards the rename has still taken
            // effect, and reporting outright failure would be a lie.
            await userService.updateUserName(
              frozenUser.object.uid,
              firstName,
              lastName,
            )
          } catch (err: any) {
            console.error('Error updating name:', err)
            alert.trigger('error', 'Failed to update name.')
            return
          }
          try {
            await updateProfile(frozenUser.object, {
              displayName: `${firstName} ${lastName}`,
            })
            alert.trigger('success', 'Name successfully updated.')
          } catch (err: any) {
            console.error('Error syncing display name:', err)
            alert.trigger(
              'error',
              'Name updated, but the display name failed to sync. Try again.',
            )
          }
        }
      },
    },
  )

  const { form, enhance, delayed } = formResult

  onMount(() => {
    let initialized = false
    return user.subscribe(async (u) => {
      if (!u || initialized) return
      try {
        const stored = await userService.fetchUserName(u.object.uid)
        if (stored) {
          $form.firstName = stored.firstName
          $form.lastName = stored.lastName
          return
        }
      } catch (err) {
        console.error('Error loading stored name:', err)
      } finally {
        initialized = true
        loading = false
      }
      // Accounts created before signup wrote a `users` document have only a
      // displayName to go on; split it so the form isn't blank for them.
      const [first = '', ...rest] = (u.object.displayName ?? '').split(' ')
      $form.firstName = first
      $form.lastName = rest.join(' ')
    })
  })
</script>

{#if loading}
  <Loading />
{:else}
  <form novalidate use:enhance class="w-full">
    <fieldset class="space-y-4" disabled={$delayed}>
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="w-full">
          <FormInput
            form={formResult}
            name="firstName"
            label="First name"
            inputName="first-name"
            bind:value={$form.firstName}
          />
        </div>
        <div class="flex items-end gap-2">
          <div class="w-full">
            <FormInput
              form={formResult}
              name="lastName"
              label="Last name"
              inputName="last-name"
              bind:value={$form.lastName}
            />
          </div>
          <Button
            class="h-12 shrink-0"
            color="blue"
            type="submit"
            disabled={$delayed}
          >
            Update
          </Button>
        </div>
      </div>
    </fieldset>
  </form>
{/if}
