import { serializedInterviewWindow } from '#lib/server/interviewWindow.js'
import type { LayoutServerLoad } from './$types'

/**
 * The interview window both interview pages schedule in, as the server
 * enforces it (with the emulator's e2e override - see
 * #lib/server/interviewWindow), so the grids offer exactly the weeks a save
 * will accept.
 */
export const load = (() => ({
  interviewWindow: serializedInterviewWindow(),
})) satisfies LayoutServerLoad
