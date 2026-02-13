import { describe, expect, it } from 'vitest'
import { tokenize } from './tokenize'

describe('tokenize', () => {
  it('splits basic tokens', () => {
    expect(tokenize('git status -sb')).toEqual(['git', 'status', '-sb'])
  })

  it('keeps quoted segments', () => {
    expect(tokenize('commit -m "hello world"')).toEqual(['commit', '-m', 'hello world'])
    expect(tokenize("commit -m 'hello world'")).toEqual(['commit', '-m', 'hello world'])
  })
})
