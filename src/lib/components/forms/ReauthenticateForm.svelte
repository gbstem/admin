<script lang="ts">
  import { superForm, defaults } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import { Field, Control, Label, FieldErrors } from 'formsnap'
  import { user } from '$lib/client/firebase'
  import { alert } from '$lib/stores'
  import {
    EmailAuthProvider,
    reauthenticateWithCredential,
  } from 'firebase/auth'
  interface Props {
    // Returns a promise so `onUpdate` below can await it. See the
    // `invalidateAll: false` comment for why that ordering matters.
    onReauthenticate?: () => void | Promise<void>
    children?: import('svelte').Snippet
  }

  let { onReauthenticate, children }: Props = $props()

  const schema = z.object({
    password: z.string().min(1, 'Password is required'),
  })

  const formResult = superForm(
    defaults({ password: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      // This dialog renders no server-loaded data, so it has nothing to
      // revalidate - and superforms' default (`invalidateAll: true`) actively
      // broke the flows that use it. It fires *after* `onUpdate` resolves,
      // racing whatever mutation `onReauthenticate` kicked off: changing a
      // password bumps Firebase's `tokensValidAfterTime`, which revokes the
      // `__session` cookie that hooks.server.ts checks with `checkRevoked`,
      // so whichever request landed second decided whether you stayed on the
      // page or got bounced to /signin. That coin flip failed
      // profile.cy.ts about half of CI runs, from both sides.
      //
      // The three sibling forms (ChangeName/ChangeEmail/ChangePassword) all
      // already opt out the same way.
      invalidateAll: false,
      applyAction: false,
      async onUpdate({ form: formVal }) {
        if (!formVal.valid) return
        if ($user) {
          try {
            await reauthenticateWithCredential(
              $user.object,
              EmailAuthProvider.credential(
                $user.object.email as string,
                formVal.data.password,
              ),
            )
            // Awaited, so the caller's mutation is complete (and its
            // success/error alert triggered) before this form's submit
            // settles. Firing it loose left two async chains in flight with
            // no defined order.
            await onReauthenticate?.()
          } catch (err: any) {
            alert.trigger('error', err.code, true)
          }
        }
      },
    },
  )

  const { form, enhance, delayed } = formResult
</script>

<form use:enhance class="w-full">
  <fieldset class="space-y-4" disabled={$delayed}>
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

    {@render children?.()}
  </fieldset>
</form>
