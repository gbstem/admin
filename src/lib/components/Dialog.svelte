<script lang="ts">
  import { browser } from '$app/environment'
  import { dialogState } from '$lib/stores.svelte'
  import { clickOutside, cn, trapFocus } from '$lib/utils'
  import { uniqueId } from 'lodash-es'
  import { onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { XMark } from '@steeze-ui/heroicons'

  type Size = 'min' | 'full'

  const id = uniqueId('dialog-')
  interface Props {
    size?: Size
    disabled?: boolean
    open?: boolean
    alert?: boolean
    onCancel?: () => void
    title?: import('svelte').Snippet
    description?: import('svelte').Snippet
  }

  let {
    size = 'min',
    disabled = false,
    open = $bindable(false),
    alert = false,
    onCancel,
    title,
    description,
  }: Props = $props()
  let bodyLocked = $state(false)
  $effect(() => {
    if (browser) {
      if (open) {
        dialogState.current = id
        document.body.style.overflowY = 'hidden'
        bodyLocked = true
      } else if (dialogState.current === id) {
        dialogState.current = null
        document.body.style.overflowY = 'auto'
        bodyLocked = false
      }
    }
  })

  onDestroy(() => {
    if (browser) {
      if (dialogState.current === id) {
        dialogState.current = null
      }
      if (bodyLocked) {
        document.body.style.overflowY = 'auto'
      }
    }
  })

  // `open` is bindable, so a parent can flip it directly (open = true or
  // open = false after a successful save, etc). onCancel only fires when
  // the DIALOG itself dismisses via its own chrome (X button, Escape,
  // outside click) - a parent-initiated `open = false` intentionally
  // skips it, since the parent already knows why it closed.
  function handleCancel() {
    if (!disabled) {
      open = false
      onCancel?.()
    }
  }
  function handleEscape(e: KeyboardEvent) {
    if (open && !disabled) {
      if (e.code === 'Escape') {
        handleCancel()
      }
    }
  }
</script>

<svelte:body
  onkeydown={(e) => {
    e.stopPropagation()
    handleEscape(e)
  }}
/>

{#if open}
  <div
    class="fixed inset-0 z-50 h-screen w-screen bg-black opacity-40"
    transition:fade={{ duration: 200 }}
  ></div>
  <div
    class="fixed inset-0 z-50 h-screen w-screen overflow-y-auto"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="relative flex min-h-screen items-center justify-center px-d/2 py-d"
    >
      <div
        class={cn(
          'relative grid w-full gap-3 rounded-lg bg-white p-4 sm:gap-6 sm:p-8',
          size === 'full' && 'h-fit min-h-full',
          size === 'min' && 'max-w-2xl',
        )}
        role="dialog"
        use:trapFocus
        use:clickOutside
        onoutclick={() => {
          if (!alert) {
            handleCancel()
          }
        }}
      >
        <button
          type="button"
          class="absolute top-2 right-2 z-50 cursor-pointer rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none disabled:opacity-50 sm:top-4 sm:right-4"
          onclick={handleCancel}
          {disabled}
          aria-label="Close dialog"
        >
          <Icon src={XMark} class="h-5 w-5" />
        </button>
        <h1
          class="min-w-0 rounded-md bg-gray-200 px-4 py-3 pr-12 text-xl font-bold uppercase"
        >
          {@render title?.()}
        </h1>
        <div class="min-w-0">
          {@render description?.()}
        </div>
      </div>
    </div>
  </div>
{/if}
