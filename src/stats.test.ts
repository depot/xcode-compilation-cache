import assert from 'node:assert/strict'
import {test} from 'node:test'
import {formatBytes, hitRate, summaryRows, type Stats} from './stats.ts'

const empty: Stats = {
  key_hits: 0,
  key_misses: 0,
  key_errors: 0,
  object_hits: 0,
  object_misses: 0,
  object_errors: 0,
  downloaded_bytes: 0,
  uploads: 0,
  uploaded_bytes: 0,
  upload_failures: 0,
}

test('formatBytes', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(999), '999 B')
  assert.equal(formatBytes(1500), '1.5 KB')
  assert.equal(formatBytes(12_345_678), '12.3 MB')
})

test('hitRate', () => {
  assert.equal(hitRate(empty), '-')
  assert.equal(hitRate({...empty, key_hits: 3, key_misses: 1}), '75.0%')
})

test('summaryRows only reports problems when there are some', () => {
  const stats = {...empty, key_hits: 90, key_misses: 10, downloaded_bytes: 2_000_000, uploads: 20, uploaded_bytes: 500}
  assert.deepEqual(summaryRows(stats), [
    ['Hits', '90'],
    ['Misses', '10'],
    ['Hit rate', '90.0%'],
    ['Downloaded', '2.0 MB'],
    ['Uploaded', '20 objects, 500 B'],
  ])
  assert.deepEqual(
    summaryRows({...stats, object_misses: 1, key_errors: 1, object_errors: 2, upload_failures: 3}).slice(5),
    [
      ['Missing outputs', '1'],
      ['Errors', '3'],
      ['Failed uploads', '3'],
    ],
  )
})
