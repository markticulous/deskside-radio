/*
 * Markticulous support-card policy. Pure logic: callers pass the clock and
 * persist the returned state. See kit/policy.md.
 * Works via <script> (window.MarkticulousSupport) or require().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MarkticulousSupport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000;
  const MIN_DAYS_SINCE_FIRST_RUN = 14;
  const MIN_DAYS_BETWEEN_ASKS = 90;
  const MAX_ASKS = 3;
  const KEY = 'markticulous.support';

  function emptyState() {
    return {
      firstRunUtc: null,
      lastAskUtc: null,
      askCount: 0,
      dismissedForever: false,
      supporter: false,
      milestoneHit: false,
    };
  }

  // Unparseable or missing -> NaN, and every comparison with NaN is false.
  const ms = (iso) => (iso ? Date.parse(iso) : NaN);

  function ensureFirstRun(s, now) {
    return s.firstRunUtc ? { ...s } : { ...s, firstRunUtc: now.toISOString() };
  }

  function markMilestone(s) {
    return { ...s, milestoneHit: true };
  }

  // busy = user is mid-task (audio dialog open, import running, ...).
  function shouldShowCard(s, now, busy) {
    if (busy || s.supporter || s.dismissedForever || !s.milestoneHit) return false;
    if (s.askCount >= MAX_ASKS) return false;
    const t = now.getTime();
    const first = ms(s.firstRunUtc);
    if (!(t - first >= MIN_DAYS_SINCE_FIRST_RUN * DAY)) return false;
    if (s.lastAskUtc) {
      const last = ms(s.lastAskUtc);
      if (!(t - last >= MIN_DAYS_BETWEEN_ASKS * DAY)) return false;
    }
    return true;
  }

  // Call when the card is displayed. "Later" needs no extra state.
  function recordShown(s, now) {
    return { ...s, lastAskUtc: now.toISOString(), askCount: s.askCount + 1 };
  }

  function recordNeverAsk(s) {
    return { ...s, dismissedForever: true };
  }

  // "I've supported": honor system; also unlocks cosmetics in the app.
  function recordSupporter(s) {
    return { ...s, supporter: true };
  }

  // Storage is injected (pass window.localStorage). Private windows and
  // blocked site data can make it throw, so both calls swallow errors.
  function load(storage) {
    try {
      const raw = storage.getItem(KEY);
      return raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
    } catch (e) {
      return emptyState();
    }
  }

  function save(storage, s) {
    try {
      storage.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      /* page works without persistence */
    }
  }

  return {
    emptyState, ensureFirstRun, markMilestone, shouldShowCard,
    recordShown, recordNeverAsk, recordSupporter, load, save,
  };
});
