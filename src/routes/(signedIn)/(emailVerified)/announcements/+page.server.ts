import { announcementService } from '$lib/server/announcementService'
import { parsePagination } from '$lib/utils'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async ({ url, depends }) => {
  depends('app:announcements')
  const { pageNum, limitVal, offsetVal } = parsePagination(url)

  try {
    return {
      announcements: await announcementService.fetchAnnouncements({
        limit: limitVal,
        offset: offsetVal,
      }),
      page: pageNum,
      limit: limitVal,
    }
  } catch (err: any) {
    console.error('[Load Error] announcements page load:', err)
    throw error(500, {
      message:
        'Something went wrong while fetching announcements. Please try again later.',
      details: err.message || err.toString(),
      code: err.code || 'UNKNOWN',
    })
  }
}) satisfies PageServerLoad
