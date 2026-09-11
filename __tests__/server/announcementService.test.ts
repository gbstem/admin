const mockGet = jest.fn()
const mockQuery = {
  orderBy: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  get: (...args: any[]) => mockGet(...args),
}
const mockCollection = jest.fn()

jest.mock('$lib/server/firebase', () => ({
  adminDb: {
    collection: (...args: any[]) => mockCollection(...args),
  },
}))

import { announcementService } from '$lib/server/announcementService'

describe('announcementService (server Data Access Layer)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCollection.mockReturnValue(mockQuery)
    mockQuery.orderBy.mockReturnValue(mockQuery)
    mockQuery.limit.mockReturnValue(mockQuery)
    mockQuery.offset.mockReturnValue(mockQuery)
    mockGet.mockResolvedValue({ docs: [] })
  })

  describe('fetchAnnouncements', () => {
    it('reads the announcements collection', async () => {
      await announcementService.fetchAnnouncements({ limit: 25, offset: 0 })

      expect(mockCollection).toHaveBeenCalledWith('announcements')
    })

    it('orders most recent first and applies the page window', async () => {
      await announcementService.fetchAnnouncements({ limit: 10, offset: 20 })

      expect(mockQuery.orderBy).toHaveBeenCalledWith('timestamp', 'desc')
      expect(mockQuery.limit).toHaveBeenCalledWith(10)
      expect(mockQuery.offset).toHaveBeenCalledWith(20)
    })

    it('converts the stored timestamp to a Date', async () => {
      mockGet.mockResolvedValue({
        docs: [
          {
            id: 'ann-1',
            data: () => ({
              title: 'Retreat this weekend',
              content: 'Bring sunscreen.',
              timestamp: { toDate: () => new Date('2026-09-01T00:00:00Z') },
            }),
          },
        ],
      })

      const [row] = await announcementService.fetchAnnouncements({
        limit: 25,
        offset: 0,
      })

      expect(row).toEqual({
        title: 'Retreat this weekend',
        content: 'Bring sunscreen.',
        timestamp: new Date('2026-09-01T00:00:00Z'),
      })
    })

    it('falls back to now when the timestamp is missing', async () => {
      const before = Date.now()
      mockGet.mockResolvedValue({
        docs: [
          {
            id: 'ann-2',
            data: () => ({
              title: 'Legacy announcement',
              content: 'No timestamp on this one.',
              timestamp: null,
            }),
          },
        ],
      })

      const [row] = await announcementService.fetchAnnouncements({
        limit: 25,
        offset: 0,
      })

      expect(row.timestamp.getTime()).toBeGreaterThanOrEqual(before)
    })

    it('propagates a failed query so the page can report it', async () => {
      mockGet.mockRejectedValue(new Error('Firestore boom'))

      await expect(
        announcementService.fetchAnnouncements({ limit: 25, offset: 0 }),
      ).rejects.toThrow('Firestore boom')
    })
  })
})
