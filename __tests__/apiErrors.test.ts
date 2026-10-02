import { errorMessage } from '../src/lib/shared/apiErrors'

const response = (json: () => Promise<unknown>, statusText = 'Bad Request') =>
  ({ ok: false, statusText, json }) as unknown as Response

describe('errorMessage', () => {
  it("gives the route's own message", async () => {
    const res = response(async () => ({ message: 'That class is full.' }))

    await expect(errorMessage(res, 'Could not enroll.')).resolves.toBe(
      'That class is full.',
    )
  })

  it.each([
    ['is not JSON', () => Promise.reject(new SyntaxError('Unexpected <'))],
    ['has no message', async () => ({})],
    ['has an empty message', async () => ({ message: '' })],
    ['has a message that is not text', async () => ({ message: { a: 1 } })],
    ['is null', async () => null],
  ])('gives the fallback when the body %s', async (_, json) => {
    await expect(
      errorMessage(response(json), 'Could not enroll.'),
    ).resolves.toBe('Could not enroll.')
  })

  it('falls back to the status text when given no fallback', async () => {
    const res = response(async () => ({}), 'Bad Gateway')

    await expect(errorMessage(res)).resolves.toBe('Bad Gateway')
  })
})
