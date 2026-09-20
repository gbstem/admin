<script lang="ts">
  import { Icon } from '@steeze-ui/svelte-icon'
  import { Bell } from '@steeze-ui/heroicons'
</script>

<a
  class="flex size-10 items-center justify-center rounded-full transition-colors hover:bg-gray-200 sm:border-2 sm:border-black"
  href="/announcements"
  aria-label="Announcements"
>
  <Icon src={Bell} class="size-6" stroke-width="2" />
</a>
