// Keep the tide pages on the same date as wherever you came from.
//
// setTideLinkDate(iso, time) points every link to tides.html or tidemap.html
// on the page at ?date=iso (other query parameters kept), so following one
// opens that page on the same day.  time ("HH:MM", local at Qaringil) also
// goes on tidemap.html links, which start the map then; without it they start
// at midnight.  The simulation calls this as its time changes, and the tide
// pages as theirs does.
//
// timeFromURL() reads ?time= as minutes after midnight (0 if absent or bad).
//
// dateFromURL(input) fills a date <input> from ?date=, clamped to the input's
// min/max (the simulation can sit a few days before a tide page's earliest
// date, which needs spin-up time after the 200-yr snapshot).

const TIDE_PAGE = /(^|\/)(tides|tidemap)\.html$/;

export function setTideLinkDate(iso, time = null, root = document) {
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href'), q = href.indexOf('?');
    const path = q < 0 ? href : href.slice(0, q);
    if (!TIDE_PAGE.test(path)) continue;
    const params = new URLSearchParams(q < 0 ? '' : href.slice(q + 1));
    params.set('date', iso);
    if (time && path.endsWith('tidemap.html')) params.set('time', time); else params.delete('time');
    a.setAttribute('href', `${path}?${params}`);
  }
}

export function timeFromURL() {
  const m = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('time') ?? '');
  return m && +m[1] < 24 && +m[2] < 60 ? 60 * +m[1] + +m[2] : 0;
}

export function dateFromURL(input) {
  const d = new URLSearchParams(location.search).get('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d ?? '')) return false;
  input.value = input.min && d < input.min ? input.min : input.max && d > input.max ? input.max : d;
  return true;
}
