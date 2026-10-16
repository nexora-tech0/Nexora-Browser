const PREFIX = 'nexora.'

export function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key)
    return value === null ? fallback : JSON.parse(value)
  } catch (error) {
    console.error(`Could not read Nexora ${key} from local storage.`, error)
    return fallback
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch (error) {
    console.error(`Could not save Nexora ${key} to local storage.`, error)
  }
}
