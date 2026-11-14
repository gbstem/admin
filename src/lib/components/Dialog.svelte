<script lang="ts">
  import { browser } from '$app/env'
  import { dialogState } from '#lib/stores.svelte.js'
  import { cn } from '#lib/utils.js'
  import { uniqueId } from 'lodash-es'
  import { onDestroy } from 'svelte'
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

  let dialogEl: HTMLDialogElement | undefined = $state()

  $effect(() => {
    if (browser) {
      if (open) {
        dialogState.current = id
      } else if (dialogState.current === id) {
        dialogState.current = null
      }
    }
  })

  $effect(() => {
    if (open && dialogEl && !dialogEl.open) {
      if (typeof dialogEl.showModal === 'function') {
        dialogEl.showModal()
      } else {
        dialogEl.setAttribute('open', '')
      }
    }
  })

  onDestroy(() => {
    if (browser && dialogState.current === id) {
      dialogState.current = null
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
</script>

{#if open}
  <!-- svelte-ignore a11y_no_redundant_roles -->
  <dialog
    bind:this={dialogEl}
    role="dialog"
    aria-modal="true"
    oncancel={(e) => {
      e.preventDefault()
      handleCancel()
    }}
    onkeydown={(e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleCancel()
      }
    }}
    onclick={(e) => {
      if (e.target === dialogEl && !alert) {
        handleCancel()
      }
    }}
    class="fixed inset-0 z-50 m-0 h-screen max-h-none w-screen max-w-none overflow-y-auto border-0 bg-transparent p-0 backdrop:bg-black/40"
  >
    <div
      class="relative flex min-h-screen items-center justify-center px-d/2 py-d"
      onclick={(e) => {
        if (e.target === e.currentTarget && !alert) {
          handleCancel()
        }
      }}
      role="presentation"
    >
      <div
        class={cn(
          'relative grid w-full gap-3 rounded-lg bg-white p-4 sm:gap-6 sm:p-8',
          size === 'full' && 'h-fit min-h-full',
          size === 'min' && 'max-w-2xl',
        )}
      >
        <button
          type="button"
          class="absolute top-2 right-2 z-50 cursor-pointer rounded-full border border-gray-200 bg-white p-1.5 text-gray-500 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none disabled:opacity-50 sm:top-4 sm:right-4"
          onclick={handleCancel}
          {disabled}
          aria-label="Close dialog"
        >
          <Icon src={XMark} class="size-5" />
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
  </dialog>
{/if}
