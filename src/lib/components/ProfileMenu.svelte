<script lang="ts">
  import { fade } from 'svelte/transition'
  import { clickOutside, cn } from '$lib/utils'
  import { navigating } from '$app/state'
  import { signOut } from 'firebase/auth'
  import { auth } from '$lib/client/firebase'
  import { goto } from '$app/navigation'
  import { circInOut } from 'svelte/easing'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { User } from '@steeze-ui/heroicons'

  interface Props {
    class?: string
  }

  let { class: className = '' }: Props = $props()

  let open = $state(false)
  $effect(() => {
    if (navigating.to) {
      open = false
    }
  })
  function handleSignOut() {
    fetch('/api/auth', {
      method: 'DELETE',
    })
      .then(() => {
        signOut(auth)
        goto('/signin')
      })
      .catch((err) => console.error('Sign out error:', err))
  }
</script>

<div
  class={cn('relative md:flex md:items-center', className)}
  use:clickOutside
  onoutclick={() => {
    open = false
  }}
>
  <button
    class="hidden size-10 items-center justify-center rounded-full border-2 border-black transition-colors hover:bg-gray-200 sm:flex"
    type="button"
    aria-label="Profile menu"
    onclick={() => {
      open = !open
    }}
  >
    <Icon src={User} class="size-6" stroke-width="2" />
  </button>
  {#if open}
    <div
      class="absolute top-14 right-0 w-40 rounded-md border border-gray-200 bg-white shadow-sm"
      transition:fade={{ duration: 300, easing: circInOut }}
    >
      <a
        class="block w-full px-5 py-[0.65rem] transition-colors duration-300 hover:bg-gray-100"
        href="/profile">Profile</a
      >
      <button
        class="w-full px-5 py-[0.65rem] text-left transition-colors duration-300 hover:bg-gray-100"
        type="button"
        onclick={handleSignOut}
      >
        Sign out
      </button>
    </div>
  {/if}
  <div class="grid grid-cols-2 gap-3 text-center sm:hidden">
    <a
      class="block w-full rounded-md border border-gray-200 px-6 py-2 shadow-xs transition-colors duration-300 hover:bg-gray-100"
      href="/profile">Profile</a
    >
    <button
      class="w-full rounded-md border border-gray-200 px-6 py-2 shadow-xs transition-colors duration-300 hover:bg-gray-100"
      type="button"
      onclick={handleSignOut}
    >
      Sign out
    </button>
  </div>
</div>
