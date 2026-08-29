import assert from 'node:assert/strict'
import test from 'node:test'
import { censorChatContent } from '../src/lib/content-moderation.ts'

test('censors abusive English and Arabic chat tokens', () => {
  for (const input of ['fuck', 'FUUUCK!', 'f4ck', 'f.u.c.k', 'nigger', 'n1gga', 'n i g g e r', 'شرموطة', 'متناك']) {
    const result = censorChatContent(input)
    assert.equal(result.censored, true, input)
    assert.doesNotMatch(result.text, /[A-Za-z\u0600-\u06FF]{3,}/u)
  }
})

test('preserves normal automotive and conversational text', () => {
  for (const input of ['هل القطعة متاحة؟', 'Need an assembly for Nissan', 'hello seller', 'كاسيت BMW أصلي']) {
    assert.deepEqual(censorChatContent(input), { text: input, censored: false })
  }
})

test('preserves punctuation around a censored word', () => {
  assert.equal(censorChatContent('That is bullshit!').text, 'That is ••••••••!')
})
