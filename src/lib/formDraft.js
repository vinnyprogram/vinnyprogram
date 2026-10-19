// Tiny helpers to keep a half-typed form alive when the phone switches apps
// or the browser reloads the page (iOS frees memory from background tabs, so
// anything held only in React state is lost). Stored on the device only.
export function loadFormDraft(key) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; }
  catch (e) { return null; }
}
export function saveFormDraft(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
export function clearFormDraft(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}
