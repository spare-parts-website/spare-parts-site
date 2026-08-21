import assert from 'node:assert/strict'
import test from 'node:test'
import { IMAGE_PURPOSES, IMAGE_UPLOAD_MAX_INPUT_BYTES, IMAGE_UPLOAD_MAX_OUTPUT_BYTES, isImagePurpose } from '../src/lib/image-policy.ts'

test('keeps image storage limits bounded by purpose', () => {
  assert.equal(IMAGE_UPLOAD_MAX_INPUT_BYTES, 4 * 1024 * 1024)
  assert.equal(IMAGE_UPLOAD_MAX_OUTPUT_BYTES, 1024 * 1024)
  assert.ok(IMAGE_PURPOSES.avatar.width < IMAGE_PURPOSES.part.width)
  assert.ok(IMAGE_PURPOSES.chat.quality < IMAGE_PURPOSES.part.quality)
})

test('accepts only known image purposes', () => {
  for (const purpose of ['avatar', 'store', 'part', 'chat']) assert.equal(isImagePurpose(purpose), true)
  for (const purpose of ['', 'video', null, 1]) assert.equal(isImagePurpose(purpose), false)
})
