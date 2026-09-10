import http from 'node:http'
import globalSetup, {
  getEmulatorHostAndPort,
  isEmulatorRunning,
} from './rules/globalSetup'

describe('globalSetup - Firestore emulator check for rules tests', () => {
  const originalEnv = process.env.FIRESTORE_EMULATOR_HOST

  afterEach(() => {
    process.env.FIRESTORE_EMULATOR_HOST = originalEnv
    jest.restoreAllMocks()
  })

  describe('getEmulatorHostAndPort', () => {
    it('returns default 127.0.0.1:8080 when env is not set', () => {
      delete process.env.FIRESTORE_EMULATOR_HOST
      expect(getEmulatorHostAndPort()).toEqual({
        host: '127.0.0.1',
        port: 8080,
      })
    })

    it('parses standard host:port string', () => {
      expect(getEmulatorHostAndPort('localhost:8088')).toEqual({
        host: 'localhost',
        port: 8088,
      })
    })

    it('handles IPv6 host with brackets', () => {
      expect(getEmulatorHostAndPort('[::1]:8080')).toEqual({
        host: '::1',
        port: 8080,
      })
    })

    it('handles port-only number string', () => {
      expect(getEmulatorHostAndPort('9090')).toEqual({
        host: '127.0.0.1',
        port: 9090,
      })
    })

    it('handles host-only string without port', () => {
      expect(getEmulatorHostAndPort('firestore-emulator')).toEqual({
        host: 'firestore-emulator',
        port: 8080,
      })
    })

    it('falls back to default 127.0.0.1 when host prefix before colon is empty', () => {
      expect(getEmulatorHostAndPort(':8080')).toEqual({
        host: '127.0.0.1',
        port: 8080,
      })
    })
  })

  describe('isEmulatorRunning', () => {
    it('resolves true when server responds', async () => {
      const server = http.createServer((req, res) => {
        void req
        res.writeHead(200)
        res.end('Ok')
      })

      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve()),
      )
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Failed to get test server port')
      }

      try {
        const running = await isEmulatorRunning('127.0.0.1', address.port)
        expect(running).toBe(true)
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })

    it('resolves false when connection is refused', async () => {
      // Port 59999 is typically unused
      const running = await isEmulatorRunning('127.0.0.1', 59999, 200)
      expect(running).toBe(false)
    })

    it('resolves false on request timeout', async () => {
      const server = http.createServer((req, res) => {
        void req
        void res
        // Intentionally do not respond to trigger timeout
      })

      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve()),
      )
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Failed to get test server port')
      }

      try {
        const running = await isEmulatorRunning('127.0.0.1', address.port, 50)
        expect(running).toBe(false)
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })
  })

  describe('globalSetup', () => {
    it('succeeds without exiting when emulator is reachable', async () => {
      const server = http.createServer((req, res) => {
        void req
        res.writeHead(200)
        res.end('Ok')
      })

      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve()),
      )
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Failed to get test server port')
      }

      process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${address.port}`
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as any)
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      try {
        await globalSetup()
        expect(exitSpy).not.toHaveBeenCalled()
        expect(consoleSpy).not.toHaveBeenCalled()
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })

    it('logs helpful error message and exits with 1 when emulator is not reachable', async () => {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:59998'
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => {}) as any)
      const consoleSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      await globalSetup()

      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('yarn emulators'),
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Firestore emulator is not running'),
      )
    })
  })
})
