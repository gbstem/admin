<script lang="ts">
  import { alert } from '$lib/stores'
  import { cn } from '$lib/utils'
  import { navigating } from '$app/state'
  import { fade } from 'svelte/transition'
  import { onDestroy, onMount } from 'svelte'
  import { browser } from '$app/environment'
  import { Icon } from '@steeze-ui/svelte-icon'
  import {
    CheckCircle,
    ExclamationCircle,
    InformationCircle,
  } from '@steeze-ui/heroicons'

  let timer: number | undefined
  let visible = $state(false)
  onMount(() => {
    return alert.subscribe((alert) => {
      if (alert.type !== null) {
        if (visible) {
          clearTimeout(timer)
        } else {
          visible = true
        }
        setCloseTimeout()
      }
    })
  })
  onDestroy(() => {
    clearTimeout(timer)
  })
  function setCloseTimeout() {
    timer = window.setTimeout(() => {
      close()
    }, 3000)
  }
  function close() {
    visible = false
    clearTimeout(timer)
    timer = undefined
    alert.clear()
  }
  function handleEscape(e: KeyboardEvent) {
    if (e.code === 'Escape') {
      close()
    }
  }
  $effect(() => {
    if (browser && navigating.to) {
      if (visible) {
        close()
      }
    }
  })
</script>

<svelte:document onkeydown={visible ? handleEscape : undefined} />
{#if visible}
  <div
    class="fixed bottom-3 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 px-3"
  >
    <button class="w-full" type="button" onclick={close} transition:fade>
      <div
        class={cn(
          'flex w-full items-center gap-2 rounded-md p-3 shadow-sm',
          $alert.type === 'success' && 'bg-green-200',
          $alert.type === 'info' && 'bg-gray-200',
          $alert.type === 'error' && 'bg-red-200',
        )}
      >
        <div class="shrink-0">
          {#if $alert.type === 'success'}
            <Icon src={CheckCircle} class="size-6" />
          {:else if $alert.type === 'info'}
            <Icon src={InformationCircle} class="size-6" />
          {:else if $alert.type === 'error'}
            <Icon src={ExclamationCircle} class="size-6 shrink-0" />
          {/if}
        </div>
        <p class="grow text-left">{$alert.message}</p>
      </div>
    </button>
  </div>
{/if}
