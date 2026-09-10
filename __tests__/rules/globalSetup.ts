import http from 'node:http'

/**
 * Parses the Firestore emulator host and port from an environment string,
 * or returns default 127.0.0.1:8080.
 */
export function getEmulatorHostAndPort(
  envHost = process.env.FIRESTORE_EMULATOR_HOST,
): {
  host: string
  port: number
} {
  if (envHost) {
    const lastColon = envHost.lastIndexOf(':')
    if (lastColon !== -1) {
      const host =
        envHost.slice(0, lastColon).replace(/^\[|\]$/g, '') || '127.0.0.1'
      const port = Number(envHost.slice(lastColon + 1)) || 8080
      return { host, port }
    }
    const asNumber = Number(envHost)
    if (!Number.isNaN(asNumber)) {
      return { host: '127.0.0.1', port: asNumber }
    }
    return { host: envHost, port: 8080 }
  }
  return { host: '127.0.0.1', port: 8080 }
}

/**
 * Checks if the Firestore emulator is responding on the given host and port.
 */
export function isEmulatorRunning(
  host: string,
  port: number,
  timeoutMs = 1500,
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host,
        port,
        path: '/',
        timeout: timeoutMs,
      },
      (res) => {
        res.resume()
        resolve(res.statusCode !== undefined)
      },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

/**
 * Jest globalSetup hook for security rules testing (`yarn test:rules`).
 *
 * Verifies that the Firestore emulator is reachable before Jest starts
 * evaluating tests. If not running, fails immediately at startup with an
 * informative message instructing the user to start the emulator.
 */
export default async function globalSetup(): Promise<void> {
  const { host, port } = getEmulatorHostAndPort()
  const running = await isEmulatorRunning(host, port)

  if (!running) {
    console.error(
      `\nError: Firestore emulator is not running on ${host}:${port}.\n` +
        'Please run "yarn emulators" to start the Firestore emulators that are required for that test.\n',
    )
    process.exit(1)
  }
}
