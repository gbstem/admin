import {
  isAllowedMeetingLink,
  openableMeetingLink,
} from '#lib/helpers/meetingLink.js'

describe('isAllowedMeetingLink', () => {
  // One of each shape found across every stored class link, Fall24-Fall26.
  it.each([
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d',
    'https://teams.live.com/meet/9876543210?p=abc',
    'https://meet.google.com/abc-defg-hij',
    'https://zoom.us/j/123456789',
    'https://mit.zoom.us/j/99593863281',
    'https://bostonu.zoom.us/j/123?pwd=x',
    'https://tufts.zoom.us/j/123',
    'https://us06web.zoom.us/my/someone',
    'https://us04web.zoom.us/j/123',
    'HTTPS://MIT.ZOOM.US/j/1',
    '  https://zoom.us/j/1  ',
  ])('accepts %s', (link) => {
    expect(isAllowedMeetingLink(link)).toBe(true)
  })

  it.each([
    ['a javascript: URL', "javascript://teams.microsoft.com/%0aalert('x')"],
    ['a javascript: URL with no slashes', 'javascript:alert(1)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['plain http', 'http://zoom.us/j/1'],
    ['an unlisted host', 'https://google.com/'],
    ['a lookalike suffix', 'https://zoom.us.evil.example/j/1'],
    ['a lookalike prefix', 'https://evilzoom.us/j/1'],
    ['userinfo pointing elsewhere', 'https://zoom.us@evil.example/j/1'],
    ['a Teams-like host', 'https://teams.microsoft.com.evil.example/l/x'],
    ['no scheme', 'zoom.us/j/1'],
    ['free text', 'sdfsdfdfdfd'],
    ['empty', ''],
  ])('refuses %s', (_, link) => {
    expect(isAllowedMeetingLink(link)).toBe(false)
  })
})

describe('openableMeetingLink', () => {
  it('returns an allowed link, trimmed', () => {
    expect(openableMeetingLink(' https://zoom.us/j/1 ')).toBe(
      'https://zoom.us/j/1',
    )
  })

  it.each([undefined, null, '', 'javascript:alert(1)'])(
    'returns undefined for %p',
    (link) => {
      expect(openableMeetingLink(link)).toBeUndefined()
    },
  )
})
