import assert from 'node:assert/strict'
import test from 'node:test'
import { NEW_TAB_URL } from '../src/services/browser/addressService.js'
import { createSessionSnapshot, restoreSession } from '../src/services/browser/sessionService.js'

const workspaces = [{ id: 'personal' }, { id: 'work' }]

test('session snapshots keep restorable tab data and discard unsafe URLs', () => {
  const snapshot = createSessionSnapshot([
    { id: 'one', title: 'Example', url: 'https://example.com/', workspaceId: 'personal', pinned: true },
    { id: 'two', title: 'Unsafe', url: 'javascript:alert(1)' },
  ], 'one', 'personal')

  assert.deepEqual(snapshot, {
    version: 1,
    tabs: [{ id: 'one', title: 'Example', url: 'https://example.com/', workspaceId: 'personal', pinned: true }],
    activeTabId: 'one',
    workspaceId: 'personal',
  })
})

test('restores web and new-tab pages, active tab and pin state', () => {
  const restored = restoreSession({
    version: 1,
    tabs: [
      { id: 'one', title: 'Example', url: 'https://example.com', workspaceId: 'personal', pinned: true },
      { id: 'two', url: NEW_TAB_URL, workspaceId: 'work' },
    ],
    activeTabId: 'two',
    workspaceId: 'work',
  }, workspaces)

  assert.equal(restored.activeTabId, 'two')
  assert.equal(restored.workspaceId, 'work')
  assert.equal(restored.tabs[0].pinned, true)
  assert.deepEqual(restored.tabs[1].back, [])
})

test('rejects malformed session versions and duplicate or unsafe entries', () => {
  assert.equal(restoreSession({ version: 2, tabs: [] }, workspaces), null)
  const restored = restoreSession({
    version: 1,
    tabs: [
      { id: 'same', url: 'https://example.com' },
      { id: 'same', url: 'https://duplicate.example' },
      { id: 'unsafe', url: 'file:///C:/secret' },
      { id: 'safe', url: 'https://example.com' },
    ],
    activeTabId: 'missing',
    workspaceId: 'removed',
  }, workspaces)

  assert.deepEqual(restored.tabs.map((tab) => tab.id), ['same', 'safe'])
  assert.equal(restored.activeTabId, 'same')
  assert.equal(restored.workspaceId, 'personal')
})
