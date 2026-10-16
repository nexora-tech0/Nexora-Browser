import { NEW_TAB_URL } from './addressService.js'

const MAX_SESSION_TABS = 100

function isRestorableUrl(value) {
  if (value === NEW_TAB_URL) return true
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

export function createSessionSnapshot(tabs, activeTabId, workspaceId) {
  const safeTabs = tabs.slice(-MAX_SESSION_TABS)
    .filter((tab) => tab && typeof tab.id === 'string' && isRestorableUrl(tab.url))
    .map((tab) => ({
      id: tab.id,
      title: typeof tab.title === 'string' ? tab.title.slice(0, 300) : 'New tab',
      url: tab.url,
      workspaceId: typeof tab.workspaceId === 'string' ? tab.workspaceId : workspaceId,
      pinned: Boolean(tab.pinned),
    }))
  const active = safeTabs.find((tab) => tab.id === activeTabId) ?? safeTabs[0]
  return {
    version: 1,
    tabs: safeTabs,
    activeTabId: active?.id ?? '',
    workspaceId: typeof workspaceId === 'string' ? workspaceId : active?.workspaceId ?? '',
  }
}

export function restoreSession(value, workspaces) {
  if (!value || value.version !== 1 || !Array.isArray(value.tabs) || !value.tabs.length) return null
  if (!Array.isArray(workspaces) || !workspaces.length) return null

  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id))
  const defaultWorkspaceId = workspaces[0].id
  const seenIds = new Set()
  const tabs = value.tabs.slice(0, MAX_SESSION_TABS).filter((tab) => {
    if (!tab || typeof tab.id !== 'string' || !tab.id || seenIds.has(tab.id) || !isRestorableUrl(tab.url)) return false
    seenIds.add(tab.id)
    return true
  }).map((tab) => ({
    id: tab.id,
    title: typeof tab.title === 'string' ? tab.title.slice(0, 300) : 'New tab',
    url: tab.url,
    workspaceId: workspaceIds.has(tab.workspaceId) ? tab.workspaceId : defaultWorkspaceId,
    pinned: Boolean(tab.pinned),
    back: [],
    forward: [],
  }))

  if (!tabs.length) return null
  const activeTab = tabs.find((tab) => tab.id === value.activeTabId) ?? tabs[0]
  const workspaceId = workspaceIds.has(value.workspaceId)
    ? value.workspaceId
    : activeTab.workspaceId
  return { tabs, activeTabId: activeTab.id, workspaceId }
}
