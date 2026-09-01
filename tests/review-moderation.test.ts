import assert from 'node:assert/strict'
import test from 'node:test'
import { isDevelopmentReviewAuthor, normalizeReviewAuthorName } from '../src/lib/review-moderation.ts'

test('recognizes only the explicitly-known development review authors', () => {
  assert.equal(isDevelopmentReviewAuthor('Site Admin'), true)
  assert.equal(isDevelopmentReviewAuthor('  AMR - مطور موقع غيار ماركت '), true)
  assert.equal(isDevelopmentReviewAuthor('عميل حقيقي'), false)
  assert.equal(isDevelopmentReviewAuthor('Amr Parts Customer'), false)
})

test('normalization is punctuation and whitespace tolerant', () => {
  assert.equal(normalizeReviewAuthorName('AMR—مطور موقع غيار ماركت'), 'amr مطور موقع غيار ماركت')
})
