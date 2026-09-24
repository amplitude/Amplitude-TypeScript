// The site's own script: it makes a request and changes the URL the way a real page would, so the
// injected SDK has the page's fetch and history to observe rather than only its DOM.
document.getElementById('fetch-button').addEventListener('click', () => {
  fetch('/api/test').catch(() => undefined);
});

let navigations = 0;
document.getElementById('navigate-button').addEventListener('click', () => {
  navigations += 1;
  history.pushState({}, '', `${location.pathname}#page-${navigations}`);
});

document.getElementById('a-form').addEventListener('submit', (event) => {
  event.preventDefault();
});
