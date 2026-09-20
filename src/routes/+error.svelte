<script lang="ts">
  import { page } from '$app/state'
  import { Icon } from '@steeze-ui/svelte-icon'
  import { ExclamationTriangle } from '@steeze-ui/heroicons'
</script>

<svelte:head>
  <title>Database Error</title>
</svelte:head>

<div
  class="flex grow items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8"
>
  <div
    class="w-full max-w-md space-y-8 rounded-2xl border border-gray-100 bg-white p-8 shadow-xl"
  >
    <div class="text-center">
      <div
        class="mx-auto flex size-16 items-center justify-center rounded-full bg-red-100 text-red-600"
      >
        <Icon src={ExclamationTriangle} class="size-10" />
      </div>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-950">
        Database or Server Error
      </h2>
      <p class="mt-2 text-center text-sm text-gray-500">
        An error occurred while loading this page. Please share the details
        below with the gbSTEM website maintainers.
      </p>
    </div>

    <div class="rounded-xl border border-red-200 bg-red-50/50 p-4">
      <div class="text-xs font-semibold tracking-wider text-red-800 uppercase">
        Error Message
      </div>
      <p class="mt-1 text-sm font-medium wrap-break-word text-red-900">
        {page.error?.message || 'Something went wrong.'}
      </p>

      {#if page.error?.details}
        <div
          class="mt-3 text-xs font-semibold tracking-wider text-red-800 uppercase"
        >
          Technical Details
        </div>
        <pre
          class="mt-1 max-h-40 overflow-y-auto rounded-lg bg-red-900/10 p-2 font-mono text-xs break-all whitespace-pre-wrap text-red-950">{page
            .error.details}</pre>
      {/if}

      {#if page.error?.code}
        <div
          class="mt-3 text-xs font-semibold tracking-wider text-red-800 uppercase"
        >
          Error Code
        </div>
        <code class="mt-1 block font-mono text-xs text-red-900"
          >{page.error.code}</code
        >
      {/if}
    </div>

    <div class="flex gap-4">
      <button
        onclick={() => window.location.reload()}
        class="flex w-full justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 focus-visible:outline-solid"
      >
        Try Again
      </button>
      <a
        href="/"
        class="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-xs transition hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600 focus-visible:outline-solid"
      >
        Go to Home
      </a>
    </div>
  </div>
</div>
