import assert from 'node:assert/strict'
import test from 'node:test'
import { displayTitle, NEW_TAB_URL, normalizeAddress } from '../src/services/browser/addressService.js'

test('empty input opens a new tab', () => {
  assert.equal(normalizeAddress('   ', 'Google'), NEW_TAB_URL)
})

test('already normalized new-tab addresses stay internal', () => {
  assert.equal(normalizeAddress(NEW_TAB_URL, 'Google'), NEW_TAB_URL)
})

test('HTTP and HTTPS URLs are normalized by the URL parser', () => {
  assert.equal(normalizeAddress('https://example.com/path?q=hello world', 'Google'), 'https://example.com/path?q=hello%20world')
  assert.equal(normalizeAddress('http://example.com:8080/', 'Google'), 'http://example.com:8080/')
  assert.equal(normalizeAddress('https://', 'Google'), null)
})

test('domain-like input navigates directly over HTTPS', () => {
  assert.equal(normalizeAddress('example.com/path', 'Google'), 'https://example.com/path')
  assert.equal(normalizeAddress('localhost:5173', 'Google'), 'https://localhost:5173')
})

test('search queries use the selected engine and encode the query', () => {
  assert.equal(normalizeAddress('two words', 'Google'), 'https://www.google.com/search?q=two%20words')
  assert.equal(normalizeAddress('browser', 'Bing'), 'https://www.bing.com/search?q=browser')
  assert.equal(normalizeAddress('browser', 'DuckDuckGo'), 'https://duckduckgo.com/?q=browser')
  assert.equal(normalizeAddress('browser', 'unknown'), 'https://www.google.com/search?q=browser')
})

test('dangerous local and script schemes are rejected', () => {
  assert.equal(normalizeAddress('javascript:alert(1)', 'Google'), null)
  assert.equal(normalizeAddress('data:text/html,unsafe', 'Google'), null)
  assert.equal(normalizeAddress('file:///C:/Windows/win.ini', 'Google'), null)
})

test('page titles use the hostname and safely handle invalid input', () => {
  assert.equal(displayTitle('https://www.example.com/path'), 'example.com')
  assert.equal(displayTitle('not a URL'), 'New tab')
})
