/**
 * Which class meeting links the app accepts and will open.
 *
 * A class's `meetingLink` is typed by its instructor or an admin and then
 * opened by everyone else on the class: co-instructors and substitutes through
 * `window.open`, parents through a "Join" link, and admins in the directory.
 * A `javascript:` URL there ran as whoever clicked it, so a link must be
 * `https:` on a host gbSTEM classes actually meet on. The list comes from every
 * class link stored across Fall24-Fall26: Teams (work and personal), Google Meet,
 * and Zoom under any subdomain - institution-branded (mit.zoom.us, tufts.zoom.us,
 * ...) and regional (us06web.zoom.us) alike.
 */
const EXACT_HOSTS = new Set([
  'zoom.us',
  'teams.microsoft.com',
  'teams.live.com',
  'meet.google.com',
])

export const MEETING_LINK_ERROR =
  'Meeting link must be an https:// Zoom, Microsoft Teams or Google Meet link.'

/** Whether `link` is a meeting link the app may store and open. */
export function isAllowedMeetingLink(link: string): boolean {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  // `hostname`, not a string match on `link`: it is what the browser will
  // actually connect to, so `https://zoom.us@evil.example` and
  // `https://zoom.us.evil.example` are both refused here.
  const host = url.hostname.toLowerCase()
  return EXACT_HOSTS.has(host) || host.endsWith('.zoom.us')
}

/**
 * `link` if it is safe to open, otherwise undefined - for the places a stored
 * link is opened, since a link can reach Firestore without passing through
 * the save-time check (e.g. data older than it).
 */
export function openableMeetingLink(
  link: string | null | undefined,
): string | undefined {
  return link && isAllowedMeetingLink(link) ? link.trim() : undefined
}
