import { accountEmailService } from '$lib/services/accountEmailService'

/** Answers each request with an address for every uid it names. */
function everyUidHasAnAccount() {
  ;(global.fetch as jest.Mock).mockImplementation(
    async (_url: string, init: any) => {
      const { uids } = JSON.parse(init.body)
      return {
        ok: true,
        json: async () => ({
          emails: Object.fromEntries(
            uids.map((uid: string) => [uid, `${uid}@example.com`]),
          ),
        }),
      }
    },
  )
}

const request = ({ ids, uids }: { ids: string[]; uids: string[] }) =>
  ({
    intent: 'test',
    uids,
    context: { ids },
  }) as any

describe('accountEmailService.resolveEmailsByDocument', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as jest.Mock
  })

  test('keys each account address by document, looking each uid up once', async () => {
    everyUidHasAnAccount()

    await expect(
      accountEmailService.resolveEmailsByDocument(
        [
          { id: 'doc-1', uid: 'uid-a' },
          { id: 'doc-2', uid: 'uid-a' },
          { id: 'doc-3', uid: 'uid-b' },
        ],
        request,
      ),
    ).resolves.toEqual({
      'doc-1': 'uid-a@example.com',
      'doc-2': 'uid-a@example.com',
      'doc-3': 'uid-b@example.com',
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      intent: 'test',
      uids: ['uid-a', 'uid-b'],
      context: { ids: ['doc-1', 'doc-2', 'doc-3'] },
    })
  })

  test('leaves out a document with no uid, or whose account is gone', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ emails: { 'uid-gone': null } }),
    })

    await expect(
      accountEmailService.resolveEmailsByDocument(
        [
          { id: 'doc-1', uid: 'uid-gone' },
          { id: 'doc-2', uid: '' },
        ],
        request,
      ),
    ).resolves.toEqual({})
  })

  test('makes no request for a list with no uids', async () => {
    await expect(
      accountEmailService.resolveEmailsByDocument(
        [{ id: 'doc-1', uid: '' }],
        request,
      ),
    ).resolves.toEqual({})
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // The endpoint accepts at most 500 documents per request.
  test('splits a long list into requests of at most 500 documents', async () => {
    everyUidHasAnAccount()
    const documents = Array.from({ length: 1200 }, (_, i) => ({
      id: `doc-${i}`,
      uid: `uid-${i}`,
    }))

    const emails = await accountEmailService.resolveEmailsByDocument(
      documents,
      request,
    )

    const sizes = (global.fetch as jest.Mock).mock.calls.map(
      ([, init]) => JSON.parse(init.body).context.ids.length,
    )
    expect(sizes).toEqual([500, 500, 200])
    expect(Object.keys(emails)).toHaveLength(1200)
  })

  test('throws when a request fails, rather than returning partial results', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Not allowed' }),
    })

    await expect(
      accountEmailService.resolveEmailsByDocument(
        [{ id: 'doc-1', uid: 'uid-a' }],
        request,
      ),
    ).rejects.toThrow('Not allowed')
  })
})
