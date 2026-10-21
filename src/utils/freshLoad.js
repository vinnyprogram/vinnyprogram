// Tells a page whether it is the very first screen after the app was (re)loaded,
// as opposed to one the person navigated to inside the app. A phone that frees
// a background tab reloads the address you were on - this lets the estimate page
// notice "I was just reloaded onto a blank new estimate" and offer the project
// that was saved a minute ago, instead of silently starting a second one.
let lastKey = null;
let navigated = false;
export function trackNavigation(key) {
  if (lastKey !== null && key !== lastKey) navigated = true;
  lastKey = key;
}
export function isFreshLoad() { return !navigated; }
