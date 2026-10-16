import assert from 'node:assert/strict'
import test from 'node:test'
import { createBrowserBridge } from '../src/services/browser/browserBridge.js'

test('browser bridge forwards supported native commands and reports availability', () => {
  const calls = []
  const bridge = createBrowserBridge({
    isNative: true,
    cefVersion: '154',
    navigate: (...args) => calls.push(args),
  })

  assert.equal(bridge.isNative, true)
  assert.equal(bridge.cefVersion, '154')
  assert.equal(bridge.navigate('tab-1', 'https://example.com'), true)
  assert.equal(bridge.reload('tab-1'), false)
  assert.deepEqual(calls, [['tab-1', 'https://example.com']])
})

test('browser bridge subscription removes its native event listener', () => {
  const target = new EventTarget()
  const bridge = createBrowserBridge(null, target)
  const events = []
  const unsubscribe = bridge.subscribe((detail) => events.push(detail))
  const event = new Event('nexora-native')
  Object.defineProperty(event, 'detail', { value: { type: 'loaded' } })
  target.dispatchEvent(event)
  unsubscribe()
  target.dispatchEvent(event)

  assert.deepEqual(events, [{ type: 'loaded' }])
})

test('browser bridge without a native host is safe to use in the UI preview', () => {
  const bridge = createBrowserBridge(null, null)

  assert.equal(bridge.isNative, false)
  assert.equal(bridge.cefVersion, '')
  assert.equal(bridge.windowAction('close'), false)
  assert.equal(bridge.subscribe(() => {} ) instanceof Function, true)
})
