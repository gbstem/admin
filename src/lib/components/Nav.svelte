<script lang="ts">
  import ProfileMenu from './ProfileMenu.svelte'
  import { cn } from '$lib/utils'
  import { page, navigating } from '$app/state'
  import { onMount } from 'svelte'
  import Brand from './Brand.svelte'
  import { fade } from 'svelte/transition'
  import { cubicInOut } from 'svelte/easing'
  import { actionsState } from '$lib/stores.svelte'
  import Button from './Button.svelte'
  import progress from '$lib/client/progress'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { Bars2, XMark } from '@steeze-ui/heroicons'

  interface Props {
    user: Data.User.Peek
  }

  let { user }: Props = $props()

  let shadow = $state(false)
  let open = $state(false)
  let disabled = $state(false)
  onMount(() => {
    updateShadow()
  })
  $effect(() => {
    if (navigating.to) {
      open = false
    }
  })
  let pathname = $derived(page.url.pathname)
  let pages = $derived([
    ...(user.role === 'admin' ? [{ name: 'Tokens', href: '/tokens' }] : []),
    {
      name: 'Dashboard',
      href: '/dashboard',
    },
    {
      name: 'Classes',
      href: '/classes',
    },
    {
      name: 'Students',
      href: '/students',
    },
    {
      name: 'Interviews',
      href: '/interviews',
    },
    {
      name: 'Applications',
      href: '/applications',
    },
    {
      name: 'Registrations',
      href: '/registrations',
    },
    ...(user.role === 'admin'
      ? [
          {
            name: 'Student Feedback',
            href: '/student-feedback',
          },
          {
            name: 'Instructor Feedback',
            href: '/instructor-feedback',
          },
        ]
      : []),
    {
      name: 'Sub Requests Log',
      href: '/sub-requests',
    },
  ])
  function updateShadow() {
    shadow = window.scrollY !== 0
  }
</script>

<svelte:window onscroll={updateShadow} />
<nav
  class={cn(
    'fixed top-0 left-0 z-40 flex h-20 w-full items-center justify-between gap-2 border-b bg-white px-4 transition-all md:gap-4 md:px-6 lg:gap-6 lg:px-8',
    shadow && !open ? 'shadow-b border-gray-200' : 'border-white',
  )}
>
  <!-- Left Brand logo -->
  <Brand />

  <!-- Middle Pages Links (visible on sm and larger, scales down spacing/text size) -->
  {#if user.emailVerified && actionsState.current === null}
    <div
      class="no-scrollbar hidden min-w-0 flex-1 items-center justify-start gap-0.5 overflow-x-auto px-2 py-1 sm:flex md:gap-1 lg:justify-center lg:gap-1.5 xl:gap-2"
    >
      {#each pages as page (page.href)}
        <a
          class={cn(
            'flex min-h-10 max-w-25 shrink-0 items-center justify-center rounded-md px-1.5 py-1 text-center text-[11px] leading-tight transition-colors md:px-2 md:py-1 md:text-xs lg:px-2.5 lg:py-1.5 lg:text-[13px] xl:text-[14px]',
            pathname === page.href ? 'bg-gray-200' : 'hover:bg-gray-100',
          )}
          href={page.href}
        >
          {page.name}
        </a>
      {/each}
    </div>
  {/if}

  <!-- Middle Active Actions (visible on sm and larger, takes up remaining middle space) -->
  {#if user.emailVerified && actionsState.current !== null}
    <div
      class="hidden min-w-0 flex-1 items-center justify-between gap-3 overflow-x-auto sm:flex"
    >
      <fieldset class="flex items-center gap-3" {disabled}>
        {#each actionsState.current as action, i (i)}
          <Button
            class="rounded-sm px-3 py-1 whitespace-nowrap"
            color={action.color}
            onclick={() => {
              progress.start()
              disabled = true
              action.callback().finally(() => {
                progress.done()
                disabled = false
              })
            }}
          >
            {action.name}
          </Button>
        {/each}
      </fieldset>
      <Button onclick={() => (actionsState.current = null)}>Close</Button>
    </div>
  {/if}

  <!-- Right Profile and Mobile Menu button -->
  <div class="flex shrink-0 items-center gap-1 sm:gap-3 md:gap-4">
    {#if actionsState.current === null}
      <ProfileMenu class="hidden sm:block" />
    {/if}
    <button
      class="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-gray-200 sm:hidden"
      type="button"
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      onclick={() => {
        open = !open
      }}
    >
      {#if open}
        <Icon src={XMark} class="size-8" />
      {:else}
        <Icon src={Bars2} class="size-8" />
      {/if}
    </button>
  </div>
</nav>
{#if open}
  <div
    class="fixed top-20 left-0 z-50 flex h-[calc(100vh-5rem)] w-screen flex-col gap-2 bg-white p-d sm:hidden"
    transition:fade={{
      easing: cubicInOut,
      duration: 200,
    }}
  >
    {#if user.emailVerified}
      {#each pages as page (page.href)}
        <a
          class={cn(
            'rounded-md px-3 py-2 transition-colors',
            pathname === page.href ? 'bg-gray-200' : 'hover:bg-gray-100',
          )}
          href={page.href}
        >
          {page.name}
        </a>
      {/each}
    {/if}
    <div class={cn(user.emailVerified && 'mt-d')}>
      <ProfileMenu />
    </div>
  </div>
{/if}

<style>
  .shadow-b {
    box-shadow: 0 1px 2px -1px rgb(0 0 0 / 0.1);
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
