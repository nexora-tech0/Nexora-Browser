export const NEW_TAB_URL = 'nexora://newtab'

export const ENGINE_URLS = {
  Google: 'https://www.google.com/search?q=',
  Bing: 'https://www.bing.com/search?q=',
  DuckDuckGo: 'https://duckduckgo.com/?q=',
}

export function displayTitle(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || 'New tab'
  } catch {
    return 'New tab'
  }
}

export function normalizeAddress(input, engine) {
  const value = input.trim()
  if (!value) return NEW_TAB_URL
  if (/^(javascript|data|file):/i.test(value)) return null
  if (value === NEW_TAB_URL) return NEW_TAB_URL
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).href
    } catch {
      return null
    }
  }
  if (/^(?:localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?(\/.*)?$/i.test(value) && !/\s/.test(value)) {
    return `https://${value}`
  }
  return `${ENGINE_URLS[engine] ?? ENGINE_URLS.Google}${encodeURIComponent(value)}`
}
