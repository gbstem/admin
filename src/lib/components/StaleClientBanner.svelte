<!--
  Tells a browser session that it is running older code than the server.

  SvelteKit polls `_app/version.json` (interval set by kit.version.pollInterval
  in svelte.config.js) and flips `updated.current` once the deployed build no
  longer matches the one this tab loaded. Without that signal a tab left open
  across a deploy keeps posting the old request shapes indefinitely, which is
  exactly what forces a migration that changes an API payload to sit behind a
  multi-week compatibility window.

  Two things happen once the tab is stale. `beforeNavigate` turns the next
  client-side navigation into a full page load, which quietly picks up the new
  bundle for anyone who keeps using the app; the banner covers the tab that is
  sitting idle on one page and would otherwise never navigate.
-->
<script lang="ts">
  import { beforeNavigate } from '$app/navigation'
  import { updated } from '$app/state'
  import { shouldHardLoad } from '$lib/client/staleClient'

  beforeNavigate((nav) => {
    if (shouldHardLoad(updated.current, nav)) {
      location.href = nav.to!.url.href
    }
  })
</script>

{#if updated.current}
  <div
    class="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-3 py-2 text-sm text-amber-900 shadow-sm"
    role="status"
    aria-live="polite"
  >
    <span>A new version of gbSTEM is available.</span>
    <button
      class="cursor-pointer font-semibold underline underline-offset-2 hover:no-underline"
      type="button"
      onclick={() => location.reload()}
    >
      Reload this page
    </button>
  </div>
{/if}
