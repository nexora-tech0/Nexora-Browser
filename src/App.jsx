import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Briefcase, Check, Code,
  ChevronRight, CircleHelp, CircleUserRound, Clock3, Copy, Download, FileDown, FileSearch, FolderOpen,
  Globe2, History, Home, Keyboard, LayoutGrid, Languages, LockKeyhole,
  ListFilter, LoaderCircle, Menu, Monitor, MoreHorizontal, Palette, Pin, Plus, Puzzle, RotateCw, Search, Settings,
  PanelLeftClose, PanelLeftOpen, ShieldCheck, SlidersHorizontal, SplitSquareHorizontal, X, XCircle,
} from 'lucide-react'
import { displayTitle, ENGINE_URLS, NEW_TAB_URL, normalizeAddress } from './services/browser/addressService.js'
import { browserBridge } from './services/browser/browserBridge.js'
import { createSessionSnapshot, restoreSession } from './services/browser/sessionService.js'
import { readStored, writeStored } from './storage.js'

const defaultSettings = {
  searchEngine: 'Google',
  theme: 'dark',
  accent: 'silver',
  density: 'comfortable',
  textSize: 'normal',
  searchSuggestions: true,
  showBookmarksBar: true,
  sidebarCollapsed: false,
  sidebarWidth: 236,
  compactMode: false,
  startup: 'newtab',
  restoreSession: false,
  homePage: 'https://www.google.com',
  downloadDirectory: '',
}
const newTab = () => ({
  id: crypto.randomUUID(),
  title: 'New tab',
  url: NEW_TAB_URL,
  back: [],
  forward: [],
  pinned: false,
})
const DEFAULT_WORKSPACE_ID = 'workspace-default'
const defaultWorkspace = { id: DEFAULT_WORKSPACE_ID, name: 'Personal', icon: 'home' }
const WorkspaceIcon = ({ name }) => {
  const Icon = name === 'briefcase' ? Briefcase : name === 'code' ? Code : name === 'home' ? Home : Globe2
  return <Icon size={15} />
}

function safeRead(key, fallback, validate) {
  const value = readStored(key, fallback)
  return validate(value) ? value : fallback
}
const readWorkspaces = () => safeRead('workspaces', [defaultWorkspace], (value) =>
  Array.isArray(value) && value.length > 0 && value.every((item) =>
    typeof item?.id === 'string' && typeof item?.name === 'string'))

function MenuOption({ icon: Icon, label, shortcut, detail, onClick, disabled = false }) {
  return (
    <button className="menu-option" type="button" role="menuitem" onClick={onClick} disabled={disabled}>
      {Icon && <Icon size={15} />}
      <span>{label}{detail && <small>{detail}</small>}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  )
}

function AddressSuggestions({ value, onChange, onSubmitValue, onEscape, bookmarks, historyItems, searchEngine, ariaLabel, inputRef, enabled = true }) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase()
    if (!query || !enabled) return []
    const seen = new Set()
    const local = [
      ...bookmarks.map((item) => ({ ...item, kind: 'bookmark' })),
      ...historyItems.map((item) => ({ ...item, kind: 'history' })),
    ].filter((item) => {
      if (seen.has(item.url) || !`${item.title} ${item.url}`.toLowerCase().includes(query)) return false
      seen.add(item.url)
      return true
    }).slice(0, 5)
    return [
      { id: 'search', kind: 'search', title: `Search for “${value.trim()}”`, url: searchEngine },
      ...local,
    ]
  }, [bookmarks, enabled, historyItems, searchEngine, value])
  const choose = (suggestion) => {
    setOpen(false)
    setSelectedIndex(-1)
    onSubmitValue(suggestion.kind === 'search' ? value.trim() : suggestion.url)
  }
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      setSelectedIndex(-1)
      onEscape()
    } else if (open && suggestions.length && event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((current) => (current + 1) % suggestions.length)
    } else if (open && suggestions.length && event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (open && selectedIndex >= 0 && suggestions[selectedIndex]) {
        choose(suggestions[selectedIndex])
      } else {
        onSubmitValue(value)
      }
    }
  }
  return (
    <div className="autocomplete-wrap">
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined}
        placeholder="Search or enter an address"
        autoComplete="off"
        value={value}
        onFocus={() => setOpen(Boolean(value.trim()))}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        onChange={(event) => { onChange(event.target.value); setSelectedIndex(-1); setOpen(Boolean(event.target.value.trim())) }}
      />
      {open && suggestions.length > 0 && (
        <div className="autocomplete-panel" id={listId} role="listbox" aria-label="Local pages and search">
          <div className="autocomplete-label">Local pages and search</div>
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.kind === 'bookmark' ? Bookmark : suggestion.kind === 'history' ? Clock3 : Search
            const detail = suggestion.kind === 'bookmark' ? 'Saved bookmark'
              : suggestion.kind === 'history' ? 'Prototype activity'
                : `${searchEngine} · search`
            return (
              <button
                key={`${suggestion.kind}-${suggestion.url}-${suggestion.id ?? ''}`}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={selectedIndex === index}
                className={selectedIndex === index ? 'selected' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => choose(suggestion)}
              >
                <Icon size={15} />
                <span><strong>{suggestion.title}</strong><small>{detail}{suggestion.kind !== 'search' ? ` · ${suggestion.url}` : ''}</small></span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AppIcon() {
  return <span className="brand-mark" aria-hidden="true"><span /></span>
}

function IconButton({ label, onClick, disabled = false, active = false, children, className = '' }) {
  return (
    <button
      className={`icon-button ${active ? 'is-active' : ''} ${className}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function PanelHeading({ eyebrow, title, description, action }) {
  return (
    <div className="panel-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={22} strokeWidth={1.7} /></span>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  )
}

function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <span className="empty-icon"><ShieldCheck size={21} /></span>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{description}</p>
        <div><button className="subtle-button" type="button" autoFocus onClick={onCancel}>Cancel</button><button className="subtle-button danger-button" type="button" onClick={onConfirm}>{confirmLabel}</button></div>
      </section>
    </div>
  )
}

function NewTabPage({ bookmarks, onNavigate, onOpenPanel, onContextMenu }) {
  return (
    <main className="newtab-content">
      <div className="newtab-center">
        <div className="hero-brand"><AppIcon /><span>Nexora Browser</span></div>
        <div className="shortcut-grid" aria-label="Bookmarked sites">
          {bookmarks.slice(0, 8).map((bookmark) => (
            <button className="shortcut" type="button" key={bookmark.id} title={bookmark.title} onClick={() => onNavigate(bookmark.url)} onContextMenu={(event) => onContextMenu(event, 'bookmark', bookmark.id)}>
              <span className="shortcut-icon"><Globe2 size={17} /></span>
              <span>{bookmark.title}</span>
            </button>
          ))}
          <button className="shortcut add-shortcut" type="button" onClick={() => onOpenPanel('bookmarks')}>
            <span className="shortcut-icon"><Plus size={17} /></span><span>Add shortcut</span>
          </button>
        </div>
      </div>
    </main>
  )
}

function SitePlaceholder({ tab, onGoHome }) {
  return (
    <main className="site-placeholder">
      <div className="placeholder-card">
        <span className="placeholder-icon"><Globe2 size={22} /></span>
        <div className="eyebrow">Browser engine not connected</div>
        <h1>This page can’t be displayed yet.</h1>
        <p>
          <strong>{tab.url}</strong> is in this prototype’s address bar, but Nexora does not have
          Chromium rendering or network navigation connected yet.
        </p>
        <button className="primary-button" type="button" onClick={onGoHome}><Home size={15} /> Back to new tab</button>
        <div className="placeholder-foot"><LockKeyhole size={13} /> No website content was loaded or embedded.</div>
      </div>
    </main>
  )
}

function BookmarksPanel({ bookmarks, setBookmarks, onContextMenu }) {
  const [editing, setEditing] = useState(null)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState('')
  const importRef = useRef(null)
  const filteredBookmarks = bookmarks.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(filter.toLowerCase()))
  const startEdit = (item) => {
    setEditing(item.id)
    setTitle(item.title)
    setUrl(item.url)
    setMessage('')
  }
  const saveEdit = (event) => {
    event.preventDefault()
    const normalized = normalizeAddress(url, 'Google')
    if (!title.trim() || !normalized || normalized === NEW_TAB_URL) {
      setMessage('Enter a title and a valid website address.')
      return
    }
    if (bookmarks.some((item) => item.id !== editing && item.url === normalized)) {
    setMessage('That website is already bookmarked.')
    return
    }
    setBookmarks((current) => editing === 'new'
    ? [...current, { id: crypto.randomUUID(), title: title.trim(), url: normalized }]
    : current.map((item) => item.id === editing ? { ...item, title: title.trim(), url: normalized } : item))
    setEditing(null)
  }
  const exportItems = () => {
    const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    const objectUrl = URL.createObjectURL(blob)
    link.href = objectUrl
    link.download = 'nexora-bookmarks.json'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
  const importItems = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item?.title !== 'string' || typeof item?.url !== 'string')) {
        throw new Error('Expected a JSON array of bookmark titles and URLs.')
      }
      const valid = parsed.map((item) => {
        const normalized = normalizeAddress(item.url, 'Google')
        if (!item.title.trim() || !normalized || normalized === NEW_TAB_URL) throw new Error('A bookmark contains an invalid title or address.')
        return { id: crypto.randomUUID(), title: item.title.trim(), url: normalized }
      })
      const existingUrls = new Set(bookmarks.map((item) => item.url))
      const unique = valid.filter((item) => {
        if (existingUrls.has(item.url)) return false
        existingUrls.add(item.url)
        return true
      })
      setBookmarks((current) => {
        const seen = new Set(current.map((item) => item.url))
        return [...current, ...unique.filter((item) => !seen.has(item.url) && seen.add(item.url))]
      })
      setMessage(`${unique.length} bookmark${unique.length === 1 ? '' : 's'} imported; duplicates were skipped.`)
    } catch (error) {
      setMessage(`Could not import bookmarks: ${error.message}`)
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className="manager-page">
      <PanelHeading
        eyebrow="YOUR LIBRARY"
        title="Bookmarks"
        description="Your saved places, stored on this device."
        action={<div className="panel-actions"><button className="subtle-button" onClick={() => startEdit({ id: 'new', title: '', url: '' })}><Plus size={15} /> Add</button><button className="subtle-button" onClick={() => importRef.current?.click()}><ArrowDownToLine size={15} /> Import</button><button className="subtle-button" onClick={exportItems}><FileDown size={15} /> Export</button></div>}
      />
      <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importItems} />
      {message && <div className="inline-message" role="status">{message}</div>}
      {bookmarks.length === 0 ? (
        editing === 'new' ? (
          <form className="edit-bookmark new-bookmark-form" onSubmit={saveEdit}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Bookmark title" placeholder="Title" autoFocus />
            <input value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Bookmark URL" placeholder="https://example.com" />
            <button className="icon-button" aria-label="Save bookmark"><Check size={16} /></button>
            <IconButton label="Cancel adding bookmark" onClick={() => setEditing(null)}><X size={16} /></IconButton>
          </form>
        ) : (
          <EmptyState icon={Bookmark} title="Nothing saved just yet" text="Add a bookmark from the address bar, or use this space to keep your favorite sites close.">
            <button className="subtle-button" onClick={() => startEdit({ id: 'new', title: '', url: '' })}><Plus size={15} /> Add a bookmark</button>
          </EmptyState>
        )
      ) : (
        <>
          <label className="filter-field bookmark-filter"><Search size={16} /><input aria-label="Search bookmarks" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search bookmarks" /></label>
          {editing === 'new' && (
            <form className="edit-bookmark new-bookmark-form" onSubmit={saveEdit}>
              <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Bookmark title" placeholder="Title" autoFocus />
              <input value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Bookmark URL" placeholder="https://example.com" />
              <button className="icon-button" aria-label="Save bookmark"><Check size={16} /></button>
              <IconButton label="Cancel adding bookmark" onClick={() => setEditing(null)}><X size={16} /></IconButton>
            </form>
          )}
          {filteredBookmarks.length === 0 ? (
            <EmptyState icon={Search} title="No matching bookmarks" text="Try a different title or address." />
          ) : (
            <section className="bookmark-list">
              <div className="list-label">{filteredBookmarks.length} SAVED {filteredBookmarks.length === 1 ? 'SITE' : 'SITES'}</div>
              {filteredBookmarks.map((item) => editing === item.id ? (
                <form className="edit-bookmark" key={item.id} onSubmit={saveEdit}>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Bookmark title" />
                  <input value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Bookmark URL" />
                  <button className="icon-button" aria-label="Save bookmark"><Check size={16} /></button>
                  <IconButton label="Cancel editing" onClick={() => setEditing(null)}><X size={16} /></IconButton>
                </form>
              ) : (
                <div className="bookmark-row" key={item.id} onContextMenu={(event) => onContextMenu(event, 'bookmark', item.id)}>
                  <span className="row-icon"><Globe2 size={17} /></span>
                  <div className="row-copy"><strong>{item.title}</strong><span>{item.url}</span></div>
                  <button className="row-action" onClick={() => startEdit(item)}>Edit</button>
                  <IconButton label={`Remove ${item.title}`} onClick={() => setBookmarks((current) => current.filter((entry) => entry.id !== item.id))}><X size={16} /></IconButton>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      <div className="manager-footnote"><BookmarkCheck size={14} /> Bookmarks are saved on this device. Folders are not available yet.</div>
    </main>
  )
}

function HistoryPanel({ historyItems, setHistoryItems, onNavigate, onContextMenu, isNative }) {
  const [filter, setFilter] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const filtered = useMemo(() => historyItems.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(filter.toLowerCase())), [historyItems, filter])
  const groups = useMemo(() => {
    const today = new Date()
    const yesterday = new Date(today)
    today.setHours(0, 0, 0, 0)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const grouped = new Map()
    filtered.forEach((item) => {
      const date = new Date(item.visitedAt)
      const key = Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString()
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const label = key === 'Unknown date' ? key
        : start.getTime() === today.getTime() ? 'Today'
          : start.getTime() === yesterday.getTime() ? 'Yesterday'
            : date.toLocaleDateString(undefined, { dateStyle: 'full' })
      if (!grouped.has(key)) grouped.set(key, { label, items: [] })
      grouped.get(key).items.push(item)
    })
    return [...grouped.values()]
  }, [filtered])
  const dateLabel = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <main className="manager-page">
      <PanelHeading
        eyebrow="YOUR LIBRARY"
        title="History"
        description={isNative ? 'Pages recorded after successful Chromium navigation.' : 'Prototype entries only — this is not genuine Chromium browsing history.'}
        action={historyItems.length > 0 && <button className="subtle-button danger-button" onClick={() => setConfirmClear(true)}><XCircle size={15} /> Clear activity</button>}
      />
      {historyItems.length > 0 && <label className="filter-field"><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={isNative ? 'Search recent activity' : 'Search prototype activity'} /><ListFilter size={15} /></label>}
      {filtered.length === 0 ? (
        <EmptyState icon={History} title={historyItems.length ? 'No matching activity' : 'A fresh start'} text={historyItems.length ? 'Try another search.' : isNative ? 'Pages you visit in Nexora will appear here.' : 'There is no prototype activity recorded yet. Real browsing history will require the native Chromium host.'} />
      ) : (
        <section className="history-list">
          <div className="list-label">{filtered.length} {isNative ? 'BROWSER' : 'PROTOTYPE'} {filtered.length === 1 ? 'ENTRY' : 'ENTRIES'}</div>
          {groups.map((group) => (
            <div className="history-day" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <div className="bookmark-row history-row" key={item.id} onContextMenu={(event) => onContextMenu(event, 'history', item.id)}>
                  <span className="row-icon"><Clock3 size={16} /></span>
                  <div className="row-copy"><strong>{item.title}</strong><span>{item.url}</span></div>
                  <time>{dateLabel(item.visitedAt)}</time>
                  <button className="row-action" onClick={() => onNavigate(item.url)}>Reopen</button>
                  <IconButton label="Remove activity entry" onClick={() => setHistoryItems((current) => current.filter((entry) => entry.id !== item.id))}><X size={16} /></IconButton>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
      {confirmClear && <ConfirmDialog title={isNative ? 'Clear recent activity?' : 'Clear prototype activity?'} description={isNative ? 'This removes Nexora’s saved visit list. It does not erase cookies, cache, or other browser data.' : 'This removes the locally stored activity entries from Nexora. It does not affect other browser data.'} confirmLabel="Clear activity" onCancel={() => setConfirmClear(false)} onConfirm={() => { setHistoryItems([]); setConfirmClear(false) }} />}
    </main>
  )
}

function DownloadsPanel({ downloads, onOpenSettings, isNative }) {
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const matchingDownloads = downloads.filter((item) =>
    `${item.fileName} ${item.url} ${item.path}`.toLowerCase().includes(filter.toLowerCase()) &&
    (statusFilter === 'all' || item.status === statusFilter))
  return (
    <main className="manager-page">
      <PanelHeading eyebrow="YOUR FILES" title="Downloads" description={isNative ? 'Files downloaded by Chromium in Nexora.' : 'A clear record of files you choose to save.'} action={<button className="subtle-button" type="button" onClick={onOpenSettings}><Settings size={14} /> Download settings</button>} />
      <div className="download-controls">
        <label className="filter-field"><Search size={15} /><input aria-label="Search downloads" placeholder="Search downloads" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        <select aria-label="Filter downloads" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All downloads</option><option value="in-progress">In progress</option><option value="completed">Completed</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option></select>
      </div>
      {matchingDownloads.length === 0 ? (
        <EmptyState icon={Download} title={downloads.length ? 'No matching downloads' : isNative ? 'No downloads yet' : 'Downloads are not connected'} text={downloads.length ? 'Try a different search or status filter.' : isNative ? 'Downloads started from websites in Nexora will appear here.' : 'The interface prototype cannot download files. Run the native Nexora browser to use Chromium downloads.'} />
      ) : (
        <section className="download-list" aria-label="Download records">
          {matchingDownloads.map((item) => (
            <article className="download-row" key={item.id}>
              <span className="row-icon"><FileDown size={17} /></span>
              <div className="download-copy">
                <strong title={item.fileName}>{item.fileName || 'Download'}</strong>
                <span title={item.url}>{item.url}</span>
                {item.status === 'in-progress' && item.totalBytes > 0 && <progress max={100} value={Math.max(0, item.progress)} aria-label={`Download progress ${item.progress}%`} />}
                <small>{item.status === 'in-progress' ? item.totalBytes > 0 ? `${item.progress}% · ${item.receivedBytes.toLocaleString()} of ${item.totalBytes.toLocaleString()} bytes` : `${item.receivedBytes.toLocaleString()} bytes received` : item.path || item.status}</small>
              </div>
              <span className={`download-status ${item.status}`}>{item.status === 'in-progress' ? 'Downloading' : item.status}</span>
              <div className="download-actions">
                {item.status === 'in-progress' && <IconButton label={`Cancel ${item.fileName}`} onClick={() => browserBridge.cancelDownload(item.id)}><X size={15} /></IconButton>}
                {['failed', 'cancelled'].includes(item.status) && <IconButton label={`Retry ${item.fileName}`} onClick={() => browserBridge.retryDownload(item.id, item.url)}><RotateCw size={15} /></IconButton>}
                {item.status === 'completed' && item.path && <>
                  <IconButton label={`Open ${item.fileName}`} onClick={() => browserBridge.openDownload(item.id, item.path)}><FileSearch size={15} /></IconButton>
                  <IconButton label={`Show ${item.fileName} in folder`} onClick={() => browserBridge.showDownloadInFolder(item.id, item.path)}><FolderOpen size={15} /></IconButton>
                </>}
              </div>
            </article>
          ))}
        </section>
      )}
      <div className="manager-footnote"><ShieldCheck size={14} /> {isNative ? 'Downloads are handled by CEF and saved to your configured folder.' : 'Download records and file actions require the native Chromium host.'}</div>
    </main>
  )
}

function ExtensionsPanel({ isNative }) {
  return (
    <main className="manager-page">
      <PanelHeading eyebrow="BROWSER TOOLS" title="Extensions" description="Manage add-ons and browser capabilities." />
      <EmptyState icon={Puzzle} title="Extensions are not supported yet" text={isNative ? 'Nexora does not yet implement an extension system or permission model. No example extensions or installation controls are shown.' : 'This interface prototype has no extension system or permission model. No example extensions or installation controls are shown.'} />
      <div className="manager-footnote"><ShieldCheck size={14} /> {isNative ? 'Extension installation and permission controls have not been implemented.' : 'Extension installation and permissions require the native browser host.'}</div>
    </main>
  )
}

function AboutPanel({ isNative, cefVersion }) {
  return (
    <main className="manager-page about-page">
      <PanelHeading eyebrow="NEXORA" title="About Nexora Browser" description={isNative ? 'A Windows browser powered by Chromium.' : 'A Windows browser interface prototype.'} />
      <section className="about-card"><AppIcon /><div><strong>Nexora Browser</strong><span>{isNative ? `Version 0.1.0 · CEF ${cefVersion}` : 'Version 0.1.0 · Interface prototype'}</span></div></section>
      <div className="about-details">
        <div><span>Browser engine</span><strong>{isNative ? 'Chromium Embedded Framework' : 'Not connected'}</strong></div>
        <div><span>Updates</span><strong>Not configured</strong></div>
      </div>
      <p className="about-notice">{isNative ? 'Web content is rendered by the installed CEF runtime with sandboxed process startup. A signed installer and production update pipeline are not configured.' : 'This interface preview does not render websites or perform network navigation. Run the native Windows app to browse with Chromium.'}</p>
    </main>
  )
}

const settingCategories = [
  { id: 'general', label: 'General', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'tabs', label: 'Tabs & startup', icon: LayoutGrid },
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'privacy', label: 'Privacy & data', icon: ShieldCheck },
  { id: 'security', label: 'Security', icon: LockKeyhole },
  { id: 'language', label: 'Languages', icon: Languages },
  { id: 'accessibility', label: 'Accessibility', icon: Keyboard },
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'about', label: 'About Nexora', icon: CircleHelp },
]

function SettingRow({ title, description, children }) {
  return (
    <div className="setting-row">
      <div className="setting-copy"><strong>{title}</strong>{description && <small>{description}</small>}</div>
      <div className="setting-value">{children}</div>
    </div>
  )
}

function ToggleRow({ title, description, checked, onChange, disabled = false }) {
  return (
    <SettingRow title={title} description={description}>
      <button
        className={`switch ${checked ? 'is-on' : ''}`}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      ><span /></button>
    </SettingRow>
  )
}

function SettingsPanel({ settings, setSettings, clearHistory, category, setCategory, onOpenPanel, isNative }) {
  const [confirmClear, setConfirmClear] = useState(false)
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
  const activeCategory = settingCategories.find((item) => item.id === category) ?? settingCategories[0]
  const input = (id, label, value, onChange, placeholder) => (
    <input id={id} aria-label={label} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  )
  let content

  if (category === 'general') {
    content = <>
      <SettingRow title="On startup" description="Choose the first page shown when Nexora opens.">
        <select aria-label="On startup" value={settings.startup} onChange={(event) => update('startup', event.target.value)}>
          <option value="newtab">New tab</option><option value="home">Home page</option>
        </select>
      </SettingRow>
      <SettingRow title="Home page" description="Used by the Home button in the browser toolbar.">
        {input('home-input', 'Home page', settings.homePage, (value) => update('homePage', value), 'https://example.com')}
      </SettingRow>
      <SettingRow title="New tab shortcuts" description="Show your saved bookmarks on the new tab page.">
        <button className="subtle-button" type="button" onClick={() => setCategory('bookmarks')}>Customize</button>
      </SettingRow>
    </>
  } else if (category === 'appearance') {
    content = <>
      <SettingRow title="Sidebar width" description="Adjust the width of the tab sidebar.">
        <input type="range" min="220" max="340" step="4" aria-label="Sidebar width" value={settings.sidebarWidth} onChange={(event) => update('sidebarWidth', Number(event.target.value))} />
      </SettingRow>
      <SettingRow title="Theme" description="Choose a light or dark browser interface.">
        <select aria-label="Theme" value={settings.theme} onChange={(event) => update('theme', event.target.value)}>
          <option value="dark">Dark</option><option value="light">Light</option><option value="system">Use system setting</option>
        </select>
      </SettingRow>
      <SettingRow title="Accent color" description="A subtle highlight for selected controls.">
        <select aria-label="Accent color" value={settings.accent} onChange={(event) => update('accent', event.target.value)}>
          <option value="silver">Silver</option><option value="blue">Blue</option><option value="sage">Sage</option>
        </select>
      </SettingRow>
      <SettingRow title="Interface density" description="Adjust spacing across the browser shell.">
        <select aria-label="Interface density" value={settings.density} onChange={(event) => update('density', event.target.value)}>
          <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
        </select>
      </SettingRow>
    </>
  } else if (category === 'search') {
    content = <>
      <SettingRow title="Search engine" description="Used when address bar input is not a website address.">
        <select aria-label="Default search engine" value={settings.searchEngine} onChange={(event) => update('searchEngine', event.target.value)}>
          {Object.keys(ENGINE_URLS).map((engine) => <option key={engine}>{engine}</option>)}
        </select>
      </SettingRow>
      <ToggleRow title="Local suggestions" description="Show matching bookmarks and locally stored history while typing. No keystrokes are sent to a suggestion service." checked={settings.searchSuggestions} onChange={(value) => update('searchSuggestions', value)} />
      <div className="setting-note"><CircleHelp size={14} /> Suggestions stay on this device; submitted searches use the selected search engine.</div>
    </>
  } else if (category === 'tabs') {
    content = <>
      <SettingRow title="New tab page" description="Nexora’s local start page is used for new tabs.">
        <span className="setting-status">Nexora new tab</span>
      </SettingRow>
      <ToggleRow title="Continue where you left off" description="Restore open tabs and workspaces when Nexora starts." checked={settings.restoreSession} onChange={(value) => update('restoreSession', value)} />
      <div className="setting-note"><Keyboard size={14} /> Shortcuts: Ctrl+T new tab, Ctrl+W close tab, Ctrl+Shift+T reopen, Ctrl+Tab switch.</div>
    </>
  } else if (category === 'bookmarks') {
    content = <>
      <ToggleRow title="Show bookmarks bar" description="Keep your saved sites below the address bar." checked={settings.showBookmarksBar} onChange={(value) => update('showBookmarksBar', value)} />
      <SettingRow title="Saved bookmarks" description="Manage, search, import, and export your saved sites.">
        <button className="subtle-button" type="button" onClick={() => onOpenPanel('bookmarks')}>Manage bookmarks</button>
      </SettingRow>
      <div className="setting-note"><BookmarkCheck size={14} /> Bookmark folders are not available in this prototype.</div>
    </>
  } else if (category === 'downloads') {
    content = <>
      <SettingRow title="Download location" description={isNative ? 'Where files downloaded by Chromium are saved.' : 'Choose a folder in the native Nexora browser.'}>
        <input aria-label="Download location" value={settings.downloadDirectory} placeholder="Windows Downloads folder" readOnly />
      </SettingRow>
      <button className="subtle-button" type="button" disabled={!isNative} onClick={() => browserBridge.chooseDownloadDirectory()}><FileSearch size={14} /> Choose folder {!isNative && <span className="unavailable-label">Desktop host required</span>}</button>
      <div className="setting-note"><ShieldCheck size={14} /> {isNative ? 'Chromium download progress and file actions are available in Downloads.' : 'Downloads are handled by CEF in the native browser.'}</div>
    </>
  } else if (category === 'privacy') {
    content = <>
      <SettingRow title={isNative ? 'Recent activity' : 'Prototype activity'} description={isNative ? 'Pages recorded after successful navigation in Nexora.' : 'Local address entries, not genuine Chromium browsing history.'}>
        <button className="subtle-button danger-button" type="button" onClick={() => setConfirmClear(true)}>Clear activity</button>
      </SettingRow>
      <SettingRow title="Cookies and site data" description="Clear stored website data for this browser profile.">
        <span className="setting-status">Not available yet</span>
      </SettingRow>
      <div className="setting-note"><LockKeyhole size={14} /> {isNative ? 'Clearing visit records does not remove cookies or cache.' : 'This does not clear website or Chromium data.'}</div>
    </>
  } else if (category === 'language') {
    content = <>
      <SettingRow title="Browser language" description="The interface currently follows your system language.">
        <span className="setting-status">System default</span>
      </SettingRow>
      <SettingRow title="Page translation" description="Translation requires the browser engine.">
        <span className="setting-status">Not available</span>
      </SettingRow>
    </>
  } else if (category === 'security') {
    content = <>
      <SettingRow title="Safe browsing" description="Website reputation checks require Chromium services."><span className="setting-status">Not implemented</span></SettingRow>
      <SettingRow title="Site permissions" description="Camera, microphone, location, and notification permissions are not managed here."><span className="setting-status">Not implemented</span></SettingRow>
      <div className="setting-note"><ShieldCheck size={14} /> {isNative ? 'Chromium sandboxing is enabled. Nexora still needs explicit site permission prompts and Safe Browsing configuration.' : 'Native browser security controls are only available in the desktop browser.'}</div>
    </>
  } else if (category === 'accessibility') {
    content = <>
      <SettingRow title="Interface text size" description="Adjust labels and settings text.">
        <select aria-label="Interface text size" value={settings.textSize} onChange={(event) => update('textSize', event.target.value)}>
          <option value="normal">Normal</option><option value="large">Large</option>
        </select>
      </SettingRow>
      <SettingRow title="Reduced motion" description="Nexora follows the reduced-motion preference configured in Windows."><span className="setting-status">System setting</span></SettingRow>
      <div className="setting-note"><Keyboard size={14} /> Browser controls and dialogs can be used with the keyboard.</div>
    </>
  } else if (category === 'system') {
    content = <>
      <ToggleRow title="Hardware acceleration" description="Rendering settings require the native Chromium host." checked={false} onChange={() => {}} disabled />
      <SettingRow title="Native integration" description="Native Chromium host status.">
        <span className="setting-status">{isNative ? `Connected · CEF ${browserBridge.cefVersion}` : 'Not connected'}</span>
      </SettingRow>
    </>
  } else {
    content = <>
      <div className="about-card"><AppIcon /><div><strong>Nexora Browser</strong><span>{isNative ? `Version 0.1.0 · CEF ${browserBridge.cefVersion}` : 'Interface prototype · version 0.1.0'}</span></div>{!isNative && <span className="prototype-badge">PROTOTYPE</span>}</div>
      <SettingRow title="Browser engine" description={isNative ? 'Web content is rendered by Chromium Embedded Framework.' : 'Web content cannot be rendered in this standalone interface.'}><span className="setting-status">{isNative ? 'Chromium connected' : 'Chromium not connected'}</span></SettingRow>
      <SettingRow title="Project" description="The Nexora desktop browser for Windows."><span className="setting-status">Nexora</span></SettingRow>
    </>
  }

  return (
    <main className="manager-page settings-page">
      <PanelHeading eyebrow="MAKE IT YOURS" title="Settings" description="Preferences are saved locally on this device." />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings categories">
          {settingCategories.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={category === id ? 'selected' : ''} aria-current={category === id ? 'page' : undefined} onClick={() => setCategory(id)}>
              <Icon size={16} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <section className="settings-content" aria-labelledby="settings-category-heading">
          <div className="settings-category-heading"><h2 id="settings-category-heading">{activeCategory.label}</h2><p>Changes are saved automatically.</p></div>
          {content}
        </section>
      </div>
      {confirmClear && <ConfirmDialog title={isNative ? 'Clear recent activity?' : 'Clear prototype activity?'} description={isNative ? 'This removes Nexora’s saved visit list. It does not erase cookies, cache, or other browser data.' : 'This removes the locally stored activity entries from Nexora. It does not affect other browser data.'} confirmLabel="Clear activity" onCancel={() => setConfirmClear(false)} onConfirm={() => { clearHistory(); setConfirmClear(false) }} />}
    </main>
  )
}

export default function App() {
  const nativeConnected = browserBridge.isNative
  const cefVersion = browserBridge.cefVersion
  const [settings, setSettings] = useState(() => {
    const saved = safeRead('settings', {}, (value) => value && typeof value === 'object' && !Array.isArray(value))
    return {
      ...defaultSettings,
      ...saved,
      searchEngine: ENGINE_URLS[saved.searchEngine] ? saved.searchEngine : defaultSettings.searchEngine,
      theme: ['dark', 'light', 'system'].includes(saved.theme) ? saved.theme : defaultSettings.theme,
      accent: ['silver', 'blue', 'sage'].includes(saved.accent) ? saved.accent : defaultSettings.accent,
      density: ['comfortable', 'compact'].includes(saved.density) ? saved.density : defaultSettings.density,
      textSize: ['normal', 'large'].includes(saved.textSize) ? saved.textSize : defaultSettings.textSize,
      searchSuggestions: typeof saved.searchSuggestions === 'boolean' ? saved.searchSuggestions : defaultSettings.searchSuggestions,
      showBookmarksBar: typeof saved.showBookmarksBar === 'boolean' ? saved.showBookmarksBar : defaultSettings.showBookmarksBar,
      sidebarCollapsed: Boolean(saved.sidebarCollapsed),
      sidebarWidth: Number.isFinite(saved.sidebarWidth) ? Math.min(340, Math.max(220, saved.sidebarWidth)) : defaultSettings.sidebarWidth,
      compactMode: Boolean(saved.compactMode),
      startup: ['newtab', 'home'].includes(saved.startup) ? saved.startup : defaultSettings.startup,
      restoreSession: typeof saved.restoreSession === 'boolean' ? saved.restoreSession : defaultSettings.restoreSession,
      homePage: typeof saved.homePage === 'string' ? saved.homePage : defaultSettings.homePage,
      downloadDirectory: typeof saved.downloadDirectory === 'string' ? saved.downloadDirectory : defaultSettings.downloadDirectory,
    }
  })
  const [workspaces, setWorkspaces] = useState(readWorkspaces)
  const [initialSession] = useState(() => (
    settings.restoreSession ? restoreSession(readStored('session', null), workspaces) : null
  ))
  const [tabs, setTabs] = useState(() => {
    if (initialSession) return initialSession.tabs
    const storedWorkspaceId = safeRead('activeWorkspace', workspaces[0].id, (value) => typeof value === 'string')
    const startupWorkspaceId = workspaces.some((workspace) => workspace.id === storedWorkspaceId) ? storedWorkspaceId : workspaces[0].id
    const tab = { ...newTab(), workspaceId: startupWorkspaceId }
    if (settings.startup === 'home') {
      const url = normalizeAddress(settings.homePage, settings.searchEngine)
      if (url && url !== NEW_TAB_URL) return [{ ...tab, title: displayTitle(url), url }]
    }
    return [tab]
  })
  const [activeId, setActiveId] = useState(initialSession?.activeTabId ?? tabs[0].id)
  const [workspaceId, setWorkspaceId] = useState(() => {
    if (initialSession) return initialSession.workspaceId
    const saved = safeRead('activeWorkspace', readWorkspaces()[0].id, (value) => typeof value === 'string')
    return readWorkspaces().some((workspace) => workspace.id === saved) ? saved : readWorkspaces()[0].id
  })
  const [closedTabs, setClosedTabs] = useState([])
  const [bookmarks, setBookmarks] = useState(() => safeRead('bookmarks', [], Array.isArray))
  const [historyItems, setHistoryItems] = useState(() => safeRead(nativeConnected ? 'cefHistory' : 'prototypeActivity', [], Array.isArray))
  const [downloads, setDownloads] = useState(() => safeRead('downloads', [], Array.isArray).map((item) => ({
    ...item,
    fileName: item?.fileName || item?.path?.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Download',
    status: item?.status === 'in-progress' ? 'failed' : item?.status,
  })))
  const [panel, setPanel] = useState(null)
  const [settingsCategory, setSettingsCategory] = useState('general')
  const [address, setAddress] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [notice, setNotice] = useState('')
  const [openMenu, setOpenMenu] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [workspaceEdit, setWorkspaceEdit] = useState(null)
  const [workspaceToRemove, setWorkspaceToRemove] = useState(null)
  const [draggedTabId, setDraggedTabId] = useState(null)
  const addressRef = useRef(null)
  const findRef = useRef(null)
  const tabsRef = useRef(tabs)
  const workspaceIdRef = useRef(workspaceId)
  tabsRef.current = tabs
  workspaceIdRef.current = workspaceId
  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
  const visibleTabs = tabs.filter((tab) => tab.workspaceId === workspaceId)
  const pinnedTabs = visibleTabs.filter((tab) => tab.pinned)
  const regularTabs = visibleTabs.filter((tab) => !tab.pinned)
  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0]

  useEffect(() => writeStored('bookmarks', bookmarks), [bookmarks])
  useEffect(() => writeStored(nativeConnected ? 'cefHistory' : 'prototypeActivity', historyItems), [historyItems, nativeConnected])
  useEffect(() => writeStored('downloads', downloads), [downloads])
  useEffect(() => writeStored('settings', settings), [settings])
  useEffect(() => writeStored('workspaces', workspaces), [workspaces])
  useEffect(() => writeStored('activeWorkspace', workspaceId), [workspaceId])
  useEffect(() => {
    writeStored('session', createSessionSnapshot(tabs, activeId, workspaceId))
  }, [tabs, activeId, workspaceId])
  useEffect(() => {
    setAddress(activeTab?.url === NEW_TAB_URL ? '' : activeTab?.url ?? '')
  }, [activeTab?.id, activeTab?.url])
  useEffect(() => {
    addressRef.current?.blur()
  }, [activeTab?.id])
  useEffect(() => {
    if (findOpen) findRef.current?.focus()
  }, [findOpen])
  useEffect(() => {
    if (findOpen && nativeConnected && activeTab?.url !== NEW_TAB_URL && findText) {
      browserBridge.find(activeTab.id, findText, true, false, false)
    }
  }, [activeTab?.id, findOpen, nativeConnected])
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = settings.theme === 'system'
        ? (media.matches ? 'light' : 'dark')
        : settings.theme
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [settings.theme])
  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent
    document.documentElement.dataset.density = settings.density
    document.documentElement.dataset.textSize = settings.textSize
    document.documentElement.dataset.sidebarCollapsed = String(settings.sidebarCollapsed)
    document.documentElement.dataset.compactMode = String(settings.compactMode)
  }, [settings.accent, settings.density, settings.textSize, settings.sidebarCollapsed, settings.compactMode])

  useEffect(() => {
    if (!nativeConnected || !activeTab) return
    browserBridge.activate(activeTab.id, activeTab.url)
  }, [nativeConnected, activeTab?.id])
  useEffect(() => {
    if (nativeConnected) browserBridge.setDownloadDirectory(settings.downloadDirectory)
  }, [nativeConnected, settings.downloadDirectory])

  useEffect(() => {
    if (!nativeConnected || !activeTab) return
    const workspace = document.querySelector('.workspace')
    const browserMain = document.querySelector('.browser-main')
    if (!workspace || !browserMain) return
    const updateViewport = () => {
      const rect = workspace.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      const visible = !panel && activeTab.url !== NEW_TAB_URL
      browserBridge.setViewport(
        activeTab.id,
        Math.round(rect.left * scale),
        Math.round(rect.top * scale),
        Math.round(rect.width * scale),
        Math.round(rect.height * scale),
        visible,
      )
    }
    const resizeObserver = new ResizeObserver(updateViewport)
    resizeObserver.observe(workspace)
    resizeObserver.observe(browserMain)
    window.addEventListener('resize', updateViewport)
    updateViewport()
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateViewport)
    }
  }, [nativeConnected, activeTab?.id, activeTab?.url, panel, settings.showBookmarksBar, settings.sidebarWidth, settings.sidebarCollapsed, settings.compactMode])

  const startFind = () => {
    if (!nativeConnected || !activeTab || activeTab.url === NEW_TAB_URL) {
      setNotice('Find in page is available for open websites in the desktop browser.')
      window.setTimeout(() => setNotice(''), 3200)
      return
    }
    setOpenMenu(null)
    setFindOpen(true)
  }
  const closeFind = () => {
    if (nativeConnected && activeTab) browserBridge.stopFinding(activeTab.id, true)
    setFindText('')
    setFindOpen(false)
  }
  const searchInPage = (forward = true, findNext = false, text = findText) => {
    if (nativeConnected && activeTab && activeTab.url !== NEW_TAB_URL) {
      browserBridge.find(activeTab.id, text, forward, false, findNext)
    }
  }
  const navigate = (input) => {
    const url = normalizeAddress(input, settings.searchEngine)
    if (!url) {
      setNotice('That address is not allowed.')
      window.setTimeout(() => setNotice(''), 3200)
      return
    }
    setAddress(url === NEW_TAB_URL ? '' : url)
    setPanel(null)
    if (nativeConnected) {
      if (!browserBridge.navigate(activeId, url)) {
        setNotice('The native browser could not accept the navigation request.')
        window.setTimeout(() => setNotice(''), 3200)
      }
      return
    }
    if (url === NEW_TAB_URL) {
      setTabs((current) => current.map((tab) => tab.id === activeId ? { ...tab, title: 'New tab', url, back: [...tab.back, tab.url], forward: [] } : tab))
      return
    }
    const title = displayTitle(url)
    setTabs((current) => current.map((tab) => tab.id === activeId ? { ...tab, title, url, back: [...tab.back, tab.url], forward: [] } : tab))
    setAddress(url)
    setPanel(null)
    setHistoryItems((current) => [{ id: crypto.randomUUID(), title, url, visitedAt: new Date().toISOString() }, ...current].slice(0, 200))
  }
  const moveHistory = (direction) => {
    if (nativeConnected) {
      browserBridge[direction](activeId)
      setPanel(null)
      return
    }
    setTabs((current) => current.map((tab) => {
      if (tab.id !== activeId) return tab
      const source = direction === 'back' ? tab.back : tab.forward
      if (!source.length) return tab
      const target = source[source.length - 1]
      const opposite = direction === 'back' ? 'forward' : 'back'
      return {
        ...tab,
        url: target,
        title: target === NEW_TAB_URL ? 'New tab' : displayTitle(target),
        [direction]: source.slice(0, -1),
        [opposite]: [...tab[opposite], tab.url],
      }
    }))
    setAddress('')
    setPanel(null)
  }
  const addTab = () => {
    const tab = { ...newTab(), workspaceId }
    setTabs((current) => [...current, tab])
    setActiveId(tab.id)
    setAddress('')
    setPanel(null)
    setOpenMenu(null)
  }
  const duplicateTab = (id) => {
    const source = tabs.find((tab) => tab.id === id)
    if (!source) return
    const copy = { ...source, id: crypto.randomUUID(), back: [...source.back], forward: [...source.forward], pinned: false, workspaceId }
    setTabs((current) => [...current, copy])
    setActiveId(copy.id)
    setPanel(null)
  }
  const closeOtherTabs = (id) => {
    const target = tabs.find((tab) => tab.id === id)
    if (!target) return
    const others = visibleTabs.filter((tab) => tab.id !== id)
    if (nativeConnected) others.forEach((tab) => browserBridge.closeTab(tab.id))
    setClosedTabs((current) => [...current, ...others].slice(-10))
    setTabs((current) => current.filter((tab) => tab.workspaceId !== workspaceId || tab.id === id))
    setActiveId(target.id)
    setPanel(null)
  }
  const showContextMenu = (event, type, targetId) => {
    event.preventDefault()
    setOpenMenu(null)
    const height = type === 'tab' ? 190 : type === 'bookmark' ? 120 : 82
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 205)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
      type,
      targetId,
    })
  }
  const closeTab = (id) => {
    const closing = tabs.find((tab) => tab.id === id)
    if (!closing) return
    if (nativeConnected) browserBridge.closeTab(id)
    setClosedTabs((current) => [...current, closing].slice(-10))
    const workspaceTabs = tabs.filter((tab) => tab.workspaceId === closing.workspaceId)
    if (workspaceTabs.length === 1) {
      const replacement = { ...newTab(), workspaceId: closing.workspaceId }
      setTabs((current) => [...current.filter((tab) => tab.id !== id), replacement])
      if (id === activeId) setActiveId(replacement.id)
      setPanel(null)
      return
    }
    const index = workspaceTabs.findIndex((tab) => tab.id === id)
    const remaining = workspaceTabs.filter((tab) => tab.id !== id)
    setTabs((current) => current.filter((tab) => tab.id !== id))
    if (id === activeId) setActiveId(remaining[Math.max(0, index - 1)].id)
    setPanel(null)
  }
  const restoreTab = () => {
    const tab = closedTabs[closedTabs.length - 1]
    if (!tab) return
    setTabs((current) => [...current, tab])
    setWorkspaceId(tab.workspaceId ?? workspaceId)
    setActiveId(tab.id)
    setClosedTabs((current) => current.slice(0, -1))
    setPanel(null)
    setOpenMenu(null)
  }

  useEffect(() => {
    if (!nativeConnected) return
    const handleNativeEvent = (detail) => {
      if (!detail || typeof detail.type !== 'string') return
      if (detail.type === 'popup' && typeof detail.url === 'string') {
        const tab = {
          ...newTab(),
          title: displayTitle(detail.url),
          url: detail.url,
          workspaceId: workspaceIdRef.current,
        }
        setTabs((current) => [...current, tab])
        setActiveId(tab.id)
        setPanel(null)
        return
      }
      if (detail.type === 'downloadDirectory' && typeof detail.path === 'string') {
        if (typeof detail.error === 'string') {
          setNotice(detail.error)
          return
        }
        setSettings((current) => ({ ...current, downloadDirectory: detail.path }))
        return
      }
      if (detail.type === 'download' && typeof detail.id === 'string' &&
          typeof detail.url === 'string' &&
          ['in-progress', 'completed', 'cancelled', 'failed'].includes(detail.status)) {
        setDownloads((current) => {
          const previous = current.find((item) => item.id === detail.id)
          const next = {
            id: detail.id,
            url: detail.url,
            fileName: typeof detail.fileName === 'string' ? detail.fileName : previous?.fileName ?? 'Download',
            path: typeof detail.path === 'string' ? detail.path : previous?.path ?? '',
            status: detail.status,
            progress: Number.isFinite(detail.progress) ? detail.progress : previous?.progress ?? -1,
            receivedBytes: Number.isFinite(detail.receivedBytes) ? detail.receivedBytes : previous?.receivedBytes ?? 0,
            totalBytes: Number.isFinite(detail.totalBytes) ? detail.totalBytes : previous?.totalBytes ?? 0,
            startedAt: previous?.startedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          return [next, ...current.filter((item) => item.id !== detail.id)].slice(0, 500)
        })
        return
      }
      if (typeof detail.tabId !== 'string') return
      if (detail.type === 'navigation' && typeof detail.url === 'string') {
        setTabs((current) => current.map((tab) => tab.id === detail.tabId
          ? {
              ...tab,
              title: displayTitle(detail.url),
              url: detail.url,
              canGoBack: typeof detail.canGoBack === 'boolean' ? detail.canGoBack : tab.canGoBack,
              canGoForward: typeof detail.canGoForward === 'boolean' ? detail.canGoForward : tab.canGoForward,
            }
          : tab))
      } else if (detail.type === 'title' && typeof detail.title === 'string') {
        setTabs((current) => current.map((tab) => tab.id === detail.tabId ? { ...tab, title: detail.title } : tab))
      } else if (detail.type === 'loading') {
        setTabs((current) => current.map((tab) => tab.id === detail.tabId
          ? { ...tab, isLoading: Boolean(detail.isLoading), canGoBack: Boolean(detail.canGoBack), canGoForward: Boolean(detail.canGoForward) }
          : tab))
      } else if (detail.type === 'loaded' && typeof detail.url === 'string' && /^https?:\/\//i.test(detail.url)) {
        setHistoryItems((current) => [{
          id: crypto.randomUUID(),
          title: currentTitle(detail.tabId, detail.url),
          url: detail.url,
          visitedAt: new Date().toISOString(),
        }, ...current].slice(0, 500))
      } else if (detail.type === 'error') {
        setNotice(`Could not load ${detail.url || 'the page'}: ${detail.title || 'network error'}`)
        window.setTimeout(() => setNotice(''), 5000)
      }
    }
    const currentTitle = (tabId, url) => tabsRef.current.find((tab) => tab.id === tabId)?.title || displayTitle(url)
    return browserBridge.subscribe(handleNativeEvent)
  }, [nativeConnected])
  const bookmarkCurrent = () => {
    if (!activeTab || activeTab.url === NEW_TAB_URL) return
    const existing = bookmarks.find((item) => item.url === activeTab.url)
    if (existing) {
      setBookmarks((current) => current.filter((item) => item.url !== activeTab.url))
    } else {
      setBookmarks((current) => [...current, { id: crypto.randomUUID(), title: activeTab.title, url: activeTab.url }])
    }
  }
  const isBookmarked = Boolean(activeTab && bookmarks.some((item) => item.url === activeTab.url))
  const openPanel = (name) => { setPanel(name); setNotice(''); setOpenMenu(null) }
  const openSettings = (category = 'general') => {
    setSettingsCategory(category)
    openPanel('settings')
  }
  const switchWorkspace = (id) => {
    const nextWorkspace = workspaces.find((workspace) => workspace.id === id)
    if (!nextWorkspace) return
    const nextTab = tabs.find((tab) => tab.workspaceId === id)
    if (!nextTab) {
      const tab = { ...newTab(), workspaceId: id }
      setTabs((current) => [...current, tab])
      setWorkspaceId(tab.workspaceId ?? workspaceId)
      setActiveId(tab.id)
    } else {
      setActiveId(nextTab.id)
    }
    setWorkspaceId(id)
    setPanel(null)
    setOpenMenu(null)
  }
  const createWorkspace = () => {
    const workspace = { id: crypto.randomUUID(), name: `Workspace ${workspaces.length + 1}`, icon: 'globe' }
    const tab = { ...newTab(), workspaceId: workspace.id }
    setWorkspaces((current) => [...current, workspace])
    setTabs((current) => [...current, tab])
    setWorkspaceId(workspace.id)
    setActiveId(tab.id)
    setWorkspaceEdit({ id: workspace.id, name: workspace.name })
    setOpenMenu('workspaces')
  }
  const renameWorkspace = (id, name) => {
    const cleanName = name.trim()
    if (!cleanName) return
    setWorkspaces((current) => current.map((workspace) => workspace.id === id ? { ...workspace, name: cleanName } : workspace))
    setWorkspaceEdit(null)
  }
  const removeWorkspace = (id) => {
    if (workspaces.length < 2) return
    const targetId = workspaces.find((workspace) => workspace.id !== id).id
    setTabs((current) => current.map((tab) => tab.workspaceId === id ? { ...tab, workspaceId: targetId } : tab))
    setWorkspaces((current) => current.filter((workspace) => workspace.id !== id))
    if (workspaceId === id) {
      setWorkspaceId(targetId)
      const targetTab = tabs.find((tab) => tab.workspaceId === targetId)
      if (targetTab) setActiveId(targetTab.id)
    }
    setOpenMenu(null)
  }
  const reorderTab = (sourceId, destinationId) => {
    if (!sourceId || sourceId === destinationId) return
    setTabs((current) => {
      const sourceIndex = current.findIndex((tab) => tab.id === sourceId)
      const destinationIndex = current.findIndex((tab) => tab.id === destinationId)
      if (sourceIndex < 0 || destinationIndex < 0 || current[sourceIndex].workspaceId !== current[destinationIndex].workspaceId) return current
      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(next.findIndex((tab) => tab.id === destinationId), 0, moved)
      return next
    })
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (findOpen) {
          closeFind()
          return
        }
        setOpenMenu(null)
        setContextMenu(null)
        return
      }
      const key = event.key.toLowerCase()
      if (event.altKey && event.shiftKey && key === 'c') {
        event.preventDefault()
        setSettings((current) => ({ ...current, compactMode: !current.compactMode }))
        return
      }
      if (event.altKey && event.shiftKey && key === 'b') {
        event.preventDefault()
        setSettings((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed }))
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      if (key === 'l') {
        event.preventDefault()
        setPanel(null)
        addressRef.current?.focus()
        addressRef.current?.select()
      } else if (key === 'f') {
        event.preventDefault()
        startFind()
      } else if (event.shiftKey && key === 't') {
        event.preventDefault()
        restoreTab()
      } else if (key === 't') {
        event.preventDefault()
        addTab()
      } else if (key === 'w') {
        event.preventDefault()
        closeTab(activeId)
      } else if (key === 'r') {
        event.preventDefault()
        if (nativeConnected && activeTab?.url !== NEW_TAB_URL) {
          browserBridge[activeTab.isLoading ? 'stop' : 'reload'](activeTab.id)
        } else {
          setNotice(activeTab?.url === NEW_TAB_URL ? '' : 'Reload requires the native Chromium host.')
          window.setTimeout(() => setNotice(''), 3200)
        }
      } else if (key === 'tab') {
        event.preventDefault()
        const index = visibleTabs.findIndex((tab) => tab.id === activeId)
        const offset = event.shiftKey ? -1 : 1
        setActiveId(visibleTabs[(index + offset + visibleTabs.length) % visibleTabs.length].id)
        setPanel(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeId, activeTab?.url, activeTab?.isLoading, nativeConnected, tabs, visibleTabs, closedTabs, settings.compactMode, settings.sidebarCollapsed, findOpen])

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (openMenu && !event.target.closest('.menu-popover, .workspace-selector, .toolbar-menu-wrap')) setOpenMenu(null)
      if (contextMenu && !event.target.closest('.context-menu')) setContextMenu(null)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [contextMenu, openMenu])

  const pageTitle = panel ? ({ bookmarks: 'Bookmarks', history: 'History', downloads: 'Downloads', extensions: 'Extensions', about: 'About Nexora Browser', settings: 'Settings' }[panel]) : activeTab?.title
  const workspacePopoverOpen = openMenu === 'workspaces'
  const browserPopoverOpen = openMenu === 'browser'
  const contextItems = contextMenu?.type === 'tab' ? [
    { label: 'New tab', action: () => addTab(), icon: Plus },
    { label: 'Duplicate tab', action: () => duplicateTab(contextMenu.targetId), icon: Copy },
    { label: tabs.find((tab) => tab.id === contextMenu.targetId)?.pinned ? 'Unpin tab' : 'Pin tab', action: () => setTabs((current) => current.map((tab) => tab.id === contextMenu.targetId ? { ...tab, pinned: !tab.pinned } : tab)), icon: Pin },
    { label: 'Close other tabs', action: () => closeOtherTabs(contextMenu.targetId), icon: X, separator: true },
    { label: 'Close tab', action: () => closeTab(contextMenu.targetId), icon: X },
  ] : contextMenu?.type === 'bookmark' ? [
    { label: 'Open in current tab', action: () => { const item = bookmarks.find((entry) => entry.id === contextMenu.targetId); if (item) navigate(item.url) }, icon: Globe2 },
    { label: 'Manage bookmarks', action: () => openPanel('bookmarks'), icon: Bookmark },
    { label: 'Remove bookmark', action: () => setBookmarks((current) => current.filter((entry) => entry.id !== contextMenu.targetId)), icon: X, separator: true },
  ] : contextMenu?.type === 'history' ? [
    { label: 'Reopen entry', action: () => { const item = historyItems.find((entry) => entry.id === contextMenu.targetId); if (item) navigate(item.url) }, icon: RotateCw },
    { label: 'Remove entry', action: () => setHistoryItems((current) => current.filter((entry) => entry.id !== contextMenu.targetId)), icon: X },
  ] : []
  return (
    <div className={`app-shell ${settings.compactMode ? 'is-compact' : ''} ${settings.sidebarCollapsed ? 'sidebar-collapsed' : ''}`} style={{ '--sidebar-width': `${settings.sidebarWidth}px` }}>
      <header className="titlebar" onMouseDown={(event) => {
        if (nativeConnected && event.button === 0 && !event.target.closest('button')) browserBridge.windowAction('drag')
      }} onDoubleClick={(event) => {
        if (nativeConnected && !event.target.closest('button')) browserBridge.windowAction('toggleMaximize')
      }}>
        <div className="app-identity"><AppIcon /><span>Nexora</span></div>
        <div className="window-title">{pageTitle} — Nexora Browser</div>
        <div className="window-actions" aria-label="Window controls">
          <button aria-label="Minimize window" title="Minimize" onClick={() => nativeConnected ? browserBridge.windowAction('minimize') : setNotice('Window controls require the native desktop host.')}>−</button>
          <button aria-label="Maximize or restore window" title="Maximize or restore" onClick={() => nativeConnected ? browserBridge.windowAction('toggleMaximize') : setNotice('Window controls require the native desktop host.')}>□</button>
          <button aria-label="Close window" title="Close" onClick={() => nativeConnected ? browserBridge.windowAction('close') : setNotice('Close Nexora using the desktop window controls.')}>×</button>
        </div>
      </header>
      <div className="browser-layout">
        {settings.compactMode && <button className="compact-sidebar-edge" type="button" aria-label="Exit compact mode and show sidebar" onClick={() => setSettings((current) => ({ ...current, compactMode: false }))} />}
        <aside className={`sidebar ${settings.sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="Tabs and workspaces">
          <div className="sidebar-top">
            <div className="sidebar-brand"><AppIcon /><span>Nexora Browser</span></div>
            <div className="workspace-control">
              <button className="workspace-selector" type="button" aria-label={`Workspace: ${activeWorkspace.name}`} aria-expanded={openMenu === 'workspaces'} onClick={() => setOpenMenu(openMenu === 'workspaces' ? null : 'workspaces')}>
                <span className="workspace-glyph"><WorkspaceIcon name={activeWorkspace.icon} /></span><span>{activeWorkspace.name}</span><ChevronRight size={14} className="workspace-chevron" />
              </button>
              {workspacePopoverOpen && <div className={`menu-popover workspace-popover ${settings.sidebarCollapsed ? 'workspace-popover-collapsed' : ''}`} role="menu">
                <div className="menu-heading"><strong>Workspaces</strong><span>Keep related tabs together</span></div>
                {workspaces.map((workspace) => (
                  <div className={`workspace-menu-row ${workspace.id === workspaceId ? 'selected' : ''}`} key={workspace.id}>
                    {workspaceEdit?.id === workspace.id ? (
                      <form onSubmit={(event) => { event.preventDefault(); renameWorkspace(workspace.id, workspaceEdit.name) }}>
                        <input aria-label="Workspace name" autoFocus value={workspaceEdit.name} onChange={(event) => setWorkspaceEdit({ ...workspaceEdit, name: event.target.value })} />
                        <select aria-label="Workspace icon" value={workspace.icon ?? 'globe'} onChange={(event) => setWorkspaces((current) => current.map((item) => item.id === workspace.id ? { ...item, icon: event.target.value } : item))}><option value="globe">Globe</option><option value="home">Home</option><option value="briefcase">Work</option><option value="code">Code</option></select>
                        <button type="submit" aria-label="Save workspace name"><Check size={14} /></button>
                        <button type="button" aria-label="Cancel workspace rename" onClick={() => setWorkspaceEdit(null)}><X size={14} /></button>
                      </form>
                    ) : (
                      <>
                        <button type="button" className="workspace-choice" role="menuitemradio" aria-checked={workspace.id === workspaceId} onClick={() => switchWorkspace(workspace.id)}>
                          <WorkspaceIcon name={workspace.icon} /><span>{workspace.name}</span><small>{tabs.filter((tab) => tab.workspaceId === workspace.id).length}</small>
                        </button>
                        <button className="workspace-edit" type="button" aria-label={`Rename ${workspace.name}`} onClick={() => setWorkspaceEdit({ id: workspace.id, name: workspace.name })}><MoreHorizontal size={15} /></button>
                      </>
                    )}
                  </div>
                ))}
                <div className="menu-divider" />
                <MenuOption icon={Plus} label="Create workspace" onClick={createWorkspace} />
                {workspaces.length > 1 && <MenuOption icon={X} label="Remove current workspace" onClick={() => { setWorkspaceToRemove(activeWorkspace); setOpenMenu(null) }} />}
              </div>}
            </div>
            <button className="sidebar-new-tab" type="button" onClick={addTab}><Plus size={16} /><span>New tab</span><kbd>Ctrl+T</kbd></button>
          </div>
          <div className="sidebar-tabs" role="tablist" aria-label={`${activeWorkspace.name} tabs`}>
            {pinnedTabs.length > 0 && <div className="tab-group-label"><Pin size={12} /><span>Pinned</span></div>}
            {pinnedTabs.map((tab) => (
              <div className={`vertical-tab pinned-tab ${tab.id === activeId ? 'selected' : ''}`} role="tab" aria-selected={tab.id === activeId} tabIndex={0} key={tab.id} title={tab.title} onClick={() => { setActiveId(tab.id); setPanel(null) }} onContextMenu={(event) => showContextMenu(event, 'tab', tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveId(tab.id); setPanel(null) } }} draggable onDragStart={() => setDraggedTabId(tab.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderTab(draggedTabId, tab.id)} onDragEnd={() => setDraggedTabId(null)}>
                <span className="tab-favicon">{tab.isLoading ? <LoaderCircle className="tab-loading-icon" size={15} /> : tab.url === NEW_TAB_URL ? <AppIcon /> : <Globe2 size={15} />}</span><span className="vertical-tab-title">{tab.title}</span>
                <span className="vertical-tab-actions"><button type="button" aria-label={`Unpin ${tab.title}`} onClick={(event) => { event.stopPropagation(); setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, pinned: false } : item)) }}><Pin size={13} /></button><button type="button" aria-label={`Close ${tab.title}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id) }}><X size={14} /></button></span>
              </div>
            ))}
            {regularTabs.length > 0 && pinnedTabs.length > 0 && <div className="tab-group-label regular-tabs-label"><span>Tabs</span></div>}
            {regularTabs.map((tab) => (
              <div className={`vertical-tab ${tab.id === activeId ? 'selected' : ''} ${draggedTabId === tab.id ? 'dragging' : ''}`} role="tab" aria-selected={tab.id === activeId} tabIndex={0} key={tab.id} title={tab.title} onClick={() => { setActiveId(tab.id); setPanel(null) }} onContextMenu={(event) => showContextMenu(event, 'tab', tab.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveId(tab.id); setPanel(null) } }} draggable onDragStart={() => setDraggedTabId(tab.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderTab(draggedTabId, tab.id)} onDragEnd={() => setDraggedTabId(null)}>
                <span className="tab-favicon">{tab.isLoading ? <LoaderCircle className="tab-loading-icon" size={15} /> : tab.url === NEW_TAB_URL ? <AppIcon /> : <Globe2 size={15} />}</span><span className="vertical-tab-title">{tab.title}</span>
                <span className="vertical-tab-actions"><button type="button" aria-label={`Pin ${tab.title}`} title="Pin tab" onClick={(event) => { event.stopPropagation(); setTabs((current) => current.map((item) => item.id === tab.id ? { ...item, pinned: true } : item)) }}><Pin size={13} /></button><button type="button" aria-label={`Close ${tab.title}`} onClick={(event) => { event.stopPropagation(); closeTab(tab.id) }}><X size={14} /></button></span>
              </div>
            ))}
          </div>
          <div className="sidebar-bottom">
            <button type="button" className={`sidebar-utility ${panel === 'history' ? 'selected' : ''}`} title="History" onClick={() => openPanel('history')}><History size={16} /><span>History</span></button>
            <button type="button" className={`sidebar-utility ${panel === 'bookmarks' ? 'selected' : ''}`} title="Bookmarks" onClick={() => openPanel('bookmarks')}><Bookmark size={16} /><span>Bookmarks</span></button>
            <button type="button" className={`sidebar-utility ${panel === 'downloads' ? 'selected' : ''}`} title="Downloads" onClick={() => openPanel('downloads')}><Download size={16} /><span>Downloads</span></button>
            <button type="button" className={`sidebar-utility ${panel === 'settings' ? 'selected' : ''}`} title="Settings" onClick={() => openSettings()}><Settings size={16} /><span>Settings</span></button>
          </div>
        </aside>
        <main className="browser-main">
          {settings.compactMode && <button className="compact-toolbar-edge" type="button" aria-label="Exit compact mode and show toolbar" onClick={() => setSettings((current) => ({ ...current, compactMode: false }))} />}
          <div className="browser-toolbar">
            <div className="navigation-buttons">
              <IconButton label="Back" disabled={nativeConnected ? !activeTab?.canGoBack : !activeTab?.back.length} onClick={() => moveHistory('back')}><ArrowLeft size={17} /></IconButton>
              <IconButton label="Forward" disabled={nativeConnected ? !activeTab?.canGoForward : !activeTab?.forward.length} onClick={() => moveHistory('forward')}><ArrowRight size={17} /></IconButton>
              <IconButton label={activeTab?.isLoading ? 'Stop loading' : 'Reload (Ctrl+R)'} disabled={activeTab?.url === NEW_TAB_URL} onClick={() => {
                if (nativeConnected && activeTab?.url !== NEW_TAB_URL) {
                  browserBridge[activeTab.isLoading ? 'stop' : 'reload'](activeTab.id)
                } else if (!nativeConnected && activeTab?.url !== NEW_TAB_URL) {
                  setNotice('Reload requires the native Chromium host.')
                }
              }}>{activeTab?.isLoading ? <X size={16} /> : <RotateCw size={16} />}</IconButton>
            </div>
            {findOpen ? (
              <form className="address-field find-field" role="search" onSubmit={(event) => { event.preventDefault(); searchInPage(true, true) }}>
                <Search size={14} className="address-lock" />
                <input
                  ref={findRef}
                  type="search"
                  aria-label="Find in page"
                  placeholder="Find in page"
                  value={findText}
                  onChange={(event) => { setFindText(event.target.value); searchInPage(true, false, event.target.value) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      searchInPage(!event.shiftKey, true)
                    }
                  }}
                />
                <div className="find-actions">
                  <IconButton label="Previous match" disabled={!findText} onClick={() => searchInPage(false, true)}><ArrowLeft size={15} /></IconButton>
                  <IconButton label="Next match" disabled={!findText} onClick={() => searchInPage(true, true)}><ArrowRight size={15} /></IconButton>
                  <IconButton label="Close find bar" onClick={closeFind}><X size={15} /></IconButton>
                </div>
              </form>
            ) : (
            <form className={`address-field ${activeTab?.isLoading ? 'is-loading' : ''}`} onSubmit={(event) => { event.preventDefault(); navigate(address) }}>
              {activeTab?.url.startsWith('https://')
                ? <LockKeyhole size={14} className="address-lock" />
                : <Globe2 size={14} className="address-lock" />}
              <AddressSuggestions
                inputRef={addressRef}
                ariaLabel="Address and search"
                value={address}
                onChange={setAddress}
                onSubmitValue={navigate}
                onEscape={() => setAddress(activeTab?.url === NEW_TAB_URL ? '' : activeTab?.url ?? '')}
                bookmarks={bookmarks}
                historyItems={historyItems}
                searchEngine={settings.searchEngine}
                enabled={settings.searchSuggestions}
              />
              {activeTab?.url !== NEW_TAB_URL && <IconButton label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'} active={isBookmarked} onClick={bookmarkCurrent}>{isBookmarked ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}</IconButton>}
            </form>
            )}
            <div className="toolbar-actions">
              <IconButton label="Home" onClick={() => navigate(settings.homePage)}><Home size={16} /></IconButton>
              <IconButton label="Bookmarks" active={panel === 'bookmarks'} onClick={() => openPanel(panel === 'bookmarks' ? null : 'bookmarks')}><Bookmark size={16} /></IconButton>
              <IconButton label="Reopen closed tab (Ctrl+Shift+T)" disabled={!closedTabs.length} onClick={restoreTab}><RotateCw size={15} /></IconButton>
              <div className="toolbar-menu-wrap">
                <button className={`icon-button ${openMenu === 'browser' ? 'is-active' : ''}`} type="button" aria-label="Open browser menu" aria-expanded={openMenu === 'browser'} onClick={() => setOpenMenu(openMenu === 'browser' ? null : 'browser')}><Menu size={17} /></button>
                {browserPopoverOpen && <div className="menu-popover browser-menu" role="menu">
                  <div className="menu-heading"><strong>Nexora Browser</strong><span>{nativeConnected ? 'Browser actions' : 'Prototype actions'}</span></div>
                  <MenuOption icon={Plus} label="New tab" shortcut="Ctrl+T" onClick={addTab} />
                  <MenuOption icon={History} label="Recent activity" onClick={() => openPanel('history')} />
                  <MenuOption icon={Bookmark} label="Bookmarks" onClick={() => openPanel('bookmarks')} />
                  <MenuOption icon={Download} label="Downloads" onClick={() => openPanel('downloads')} />
                  <MenuOption icon={Puzzle} label="Extensions" onClick={() => openPanel('extensions')} />
                  <MenuOption icon={SplitSquareHorizontal} label="Split view" detail="Requires native browser views" disabled />
                  <MenuOption icon={settings.sidebarCollapsed ? PanelLeftOpen : PanelLeftClose} label={settings.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} shortcut="Alt+Shift+B" onClick={() => { setSettings((current) => ({ ...current, sidebarCollapsed: !current.sidebarCollapsed })); setOpenMenu(null) }} />
                  <MenuOption icon={Monitor} label={settings.compactMode ? 'Exit compact mode' : 'Compact mode'} shortcut="Alt+Shift+C" onClick={() => { setSettings((current) => ({ ...current, compactMode: !current.compactMode })); setOpenMenu(null) }} />
                  <div className="menu-divider" />
                  <MenuOption icon={FileSearch} label="Find in page" shortcut="Ctrl+F" disabled={!nativeConnected || activeTab?.url === NEW_TAB_URL} onClick={startFind} />
                  <MenuOption icon={Globe2} label="Print" detail="Requires Chromium" disabled />
                  <MenuOption icon={Settings} label="Settings" onClick={() => openSettings()} />
                  <MenuOption icon={CircleHelp} label="About Nexora" onClick={() => openPanel('about')} />
                </div>}
              </div>
            </div>
          </div>
          {settings.showBookmarksBar && bookmarks.length > 0 && <div className="bookmarks-bar"><span className="bar-label"><LayoutGrid size={13} /> Bookmarks</span>{bookmarks.slice(0, 7).map((item) => <button key={item.id} title={item.url} onClick={() => navigate(item.url)}><Globe2 size={13} />{item.title}</button>)}<button className="bar-manage" onClick={() => openPanel('bookmarks')}>Manage</button></div>}
          <div className="workspace">
            {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={14} /></button></div>}
            {panel === 'bookmarks' && <BookmarksPanel bookmarks={bookmarks} setBookmarks={setBookmarks} onContextMenu={showContextMenu} />}
            {panel === 'history' && <HistoryPanel historyItems={historyItems} setHistoryItems={setHistoryItems} onNavigate={navigate} onContextMenu={showContextMenu} isNative={nativeConnected} />}
            {panel === 'downloads' && <DownloadsPanel downloads={downloads} onOpenSettings={() => openSettings('downloads')} isNative={nativeConnected} />}
            {panel === 'extensions' && <ExtensionsPanel isNative={nativeConnected} />}
            {panel === 'about' && <AboutPanel isNative={nativeConnected} cefVersion={cefVersion} />}
            {panel === 'settings' && <SettingsPanel settings={settings} setSettings={setSettings} clearHistory={() => setHistoryItems([])} category={settingsCategory} setCategory={setSettingsCategory} onOpenPanel={openPanel} isNative={nativeConnected} />}
            {!panel && activeTab?.url === NEW_TAB_URL && <NewTabPage bookmarks={bookmarks} onNavigate={navigate} onOpenPanel={openPanel} onContextMenu={showContextMenu} />}
            {!panel && activeTab?.url !== NEW_TAB_URL && !nativeConnected && <SitePlaceholder tab={activeTab} onGoHome={() => navigate(NEW_TAB_URL)} />}
          </div>
        </main>
      </div>
      {contextMenu && contextItems.length > 0 && <div className="context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
        {contextItems.map(({ label, action, icon: Icon, separator }) => <button key={label} type="button" role="menuitem" className={separator ? 'has-separator' : ''} onClick={() => { action(); setContextMenu(null) }}><Icon size={14} /><span>{label}</span></button>)}
      </div>}
      {workspaceToRemove && <ConfirmDialog title={`Remove “${workspaceToRemove.name}”?`} description="Its tabs will be kept and moved to another workspace. This workspace will be removed from this device." confirmLabel="Remove workspace" onCancel={() => setWorkspaceToRemove(null)} onConfirm={() => { removeWorkspace(workspaceToRemove.id); setWorkspaceToRemove(null) }} />}
    </div>
  )
}
