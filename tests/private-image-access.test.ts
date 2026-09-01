import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccessPrivateImage } from '../src/lib/private-image-access.ts'
import { isPrivateImageOwnedBy, privateImagePath } from '../src/lib/private-image.ts'

test('allows both participants to view a known private resource', () => {
  const resource = { participantIds: ['buyer-1', 'seller-1'] }
  assert.equal(canAccessPrivateImage({ id: 'buyer-1', role: 'BUYER' }, resource), true)
  assert.equal(canAccessPrivateImage({ id: 'seller-1', role: 'SHOP_OWNER' }, resource), true)
})

test('blocks unrelated accounts and unknown resources', () => {
  const resource = { participantIds: ['buyer-1', 'seller-1'] }
  assert.equal(canAccessPrivateImage({ id: 'other-1', role: 'BUYER' }, resource), false)
  assert.equal(canAccessPrivateImage({ id: 'other-1', role: 'BUYER' }, null), false)
})

test('allows an admin to inspect only a resource that was resolved', () => {
  assert.equal(canAccessPrivateImage({ id: 'admin-1', role: 'ADMIN' }, { participantIds: ['buyer-1'] }), true)
  assert.equal(canAccessPrivateImage({ id: 'admin-1', role: 'ADMIN' }, null), false)
})

test('binds newly uploaded private attachments to their purpose and uploader', () => {
  const url = '/api/private-image?path=chat-buyer-1-12345678901234567890.webp'
  assert.equal(privateImagePath(url), 'chat-buyer-1-12345678901234567890.webp')
  assert.equal(isPrivateImageOwnedBy(url, 'chat', 'buyer-1'), true)
  assert.equal(isPrivateImageOwnedBy(url, 'chat', 'seller-1'), false)
  assert.equal(isPrivateImageOwnedBy(url, 'evidence', 'buyer-1'), false)
  assert.equal(privateImagePath('/api/private-image?path=../../secret'), null)
})
