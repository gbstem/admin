import { currentSemester } from '$lib/data/collections'
import { editTarget } from '$lib/server/editTarget'

const target = (query: string) =>
  editTarget(new URL(`http://localhost/applications?/saveApplication${query}`))

describe('editTarget', () => {
  it('returns the id and a known semester', () => {
    expect(target(`&id=uid-1&semester=${currentSemester}`)).toEqual({
      id: 'uid-1',
      semesterId: currentSemester,
    })
  })

  it.each(['', '&id=', '&id=a%2Fb', '&id=..', '&id=.'])(
    'refuses a missing or path-like id (%s)',
    (idParam) => {
      expect(() => target(`${idParam}&semester=${currentSemester}`)).toThrow(
        expect.objectContaining({ status: 400 }),
      )
    },
  )

  // resolveSemester would quietly swap in the current semester, sending the
  // write to a different collection than the one being edited.
  it.each(['', '&semester=', '&semester=Nope99'])(
    'refuses a missing or unknown semester (%s)',
    (semesterParam) => {
      expect(() => target(`&id=uid-1${semesterParam}`)).toThrow(
        expect.objectContaining({ status: 400 }),
      )
    },
  )
})
