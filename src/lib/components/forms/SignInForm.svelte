<script lang="ts">
  import { goto } from '$app/navigation'
  import { auth } from '#lib/client/firebase.js'
  import Brand from '#lib/components/Brand.svelte'
  import { alert } from '#lib/stores.js'
  import { signInWithEmailAndPassword } from 'firebase/auth'
  import { defaults, superForm } from 'sveltekit-superforms'
  import { zod } from 'sveltekit-superforms/adapters'
  import { z } from 'zod'
  import Button from '../Button.svelte'
  import FormInput from '../FormInput.svelte'
  import Link from '../Link.svelte'

  const schema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  })

  const formResult = superForm(
    defaults({ email: '', password: '' }, zod(schema as any) as any) as any,
    {
      SPA: true,
      validators: zod(schema as any) as any,
      async onUpdate({ form: formVal }: { form: any }) {
        if (!formVal.valid) return
        try {
          const credential = await signInWithEmailAndPassword(
            auth,
            formVal.data.email,
            formVal.data.password,
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
          await goto('/dashboard')
        } catch (err: any) {
          console.error('Sign in error:', err)
          const isFirebaseError =
            err.code && typeof err.code === 'string' && err.code.includes('/')
          if (isFirebaseError) {
            alert.trigger('error', err.code, true)
          } else {
            alert.trigger('error', err.message || 'Unauthorized')
          }
        }
      },
    },
  )

  const { form, enhance, submitting } = formResult
</script>

<form novalidate use:enhance class="w-full max-w-lg">
  <fieldset class="space-y-4" disabled={$submitting}>
    <Brand />
    <h1 class="text-2xl font-bold">Sign in</h1>
    <FormInput
      form={formResult}
      name="email"
      label="Email"
      type="email"
      bind:value={$form.email}
    />
    <FormInput
      form={formResult}
      name="password"
      label="Password"
      type="password"
      bind:value={$form.password}
      autocomplete="current-password"
    />
    <div class="flex items-center justify-between">
      <Link href="/reset-password">Forgot password?</Link>
      <Button color="blue" type="submit" disabled={$submitting}>Sign in</Button>
    </div>
  </fieldset>
</form>
