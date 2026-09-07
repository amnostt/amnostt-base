import { describe, expect, it } from 'vitest'
import { getLoginRedirect, getSafeReturnPath } from './routing'

describe('protected route return paths', () => {
  it.each(['/tasks', '/tasks?search=report', '/'])('keeps a same-origin path: %s', (path) => {
    expect(getSafeReturnPath(path)).toBe(path)
  })

  it.each(['//evil.example/tasks', 'https://evil.example/tasks', ''])('rejects an unsafe return path: %s', (path) => {
    expect(getSafeReturnPath(path)).toBe('/')
  })

  it('encodes the requested local path in the login redirect', () => {
    expect(getLoginRedirect('/tasks?search=report')).toBe('/login?returnTo=%2Ftasks%3Fsearch%3Dreport')
  })
})
