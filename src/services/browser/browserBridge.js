const commandNames = [
  'navigate',
  'activate',
  'closeTab',
  'back',
  'forward',
  'reload',
  'stop',
  'setViewport',
  'windowAction',
  'setDownloadDirectory',
  'chooseDownloadDirectory',
  'cancelDownload',
  'retryDownload',
  'openDownload',
  'showDownloadInFolder',
  'find',
  'stopFinding',
]

export function createBrowserBridge(nativeBridge, eventTarget) {
  const bridge = nativeBridge && typeof nativeBridge === 'object' ? nativeBridge : null
  const commands = Object.fromEntries(commandNames.map((name) => [
    name,
    (...args) => {
      const command = bridge?.[name]
      if (typeof command !== 'function') return false
      command(...args)
      return true
    },
  ]))

  return {
    ...commands,
    get isNative() {
      return bridge?.isNative === true
    },
    get cefVersion() {
      return typeof bridge?.cefVersion === 'string' ? bridge.cefVersion : ''
    },
    subscribe(listener) {
      if (!eventTarget || typeof listener !== 'function') return () => {}
      const handleEvent = (event) => listener(event.detail)
      eventTarget.addEventListener('nexora-native', handleEvent)
      return () => eventTarget.removeEventListener('nexora-native', handleEvent)
    },
  }
}

export const browserBridge = createBrowserBridge(
  typeof window === 'undefined' ? null : window.nexora,
  typeof window === 'undefined' ? null : window,
)
