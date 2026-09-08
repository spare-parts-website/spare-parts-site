import assert from 'node:assert/strict'
import test from 'node:test'
import { comparisonIds, toggleComparison } from '../src/lib/comparison.ts'

test('comparison limits unique valid product IDs to four', () => {
  assert.deepEqual(comparisonIds('one,one,../bad,two,three,four,five'), ['one', 'two', 'three', 'four'])
})
test('selection toggles and never silently replaces the fourth item', () => {
  const ids = ['one', 'two', 'three', 'four']
  assert.deepEqual(toggleComparison(ids, 'five'), ids)
  assert.deepEqual(toggleComparison(ids, 'two'), ['one', 'three', 'four'])
  assert.deepEqual(toggleComparison(['one'], 'two'), ['one', 'two'])
})
