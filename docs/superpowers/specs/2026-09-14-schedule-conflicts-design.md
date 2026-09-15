# Settings → Schedule: a schedule that cannot be broken

**Status:** approved 2026-09-14. Design brainstormed with the owner (two decisions taken
in dialogue), grounded in two read-only code maps and two independent design passes,
then merged. Implementation follows the four-commit order at the end of this document.

## Context

The schedule tab lets a user build weekday and weekend time slots, each tying a
station (and optionally volume, tone, theme) to a span of the day. Today the only
guard is at Save: overlaps and other conflicts are refused with a red card and a
footer message, and everything up to that point is unguarded. Two agents mapped the
code (`scheduler.js`, the schedule UI in `app.js`, `tests/scheduler.test.js`) and
found about twenty distinct ways a user can end up with a broken or surprising
schedule — several of them without doing anything wrong. Two are outright runtime
bugs that leave the radio silent.

You asked for advanced conflict-avoidance logic that makes changing the schedule
*easy* — simple, user-friendly, not confusing — with the problematic scenarios
identified and solved by automation where possible.

## Decisions taken (with you)

1. **Conflicts are fixed automatically, with a visible note and one-click Undo.**
   Drag slot A's end past slot B's start → B is trimmed to start where A ends; a
   small note says so; Undo puts it back. The user never sees an overlap error.
2. **"Turn the radio off when the last slot ends" is not one-way.** The next
   scheduled slot turns the radio back on. Off means off *between* slots.

## The problem inventory (what the code actually does today)

Grouped by root cause. Every line is grounded in code the agents read.

### A. Nothing is checked until Save, and Save's feedback is poor
- Overlap is only discovered at Save (`draftIsValid`, `app.js` ~L2655). No live signal while typing.
- The message names a slot number the UI never shows: `'Overlaps slot ' + (ok[a]+1)` (`scheduler.js:90`); cards have no ordinal.
- Saving from another tab leaves the red cards on a *hidden* pane — `draftIsValid` sets `slotGroup` but never `showPane('schedule')`.
- Error cards are force-opened without updating `openSlot`; the next header click (`syncOpenSlots`) folds them all shut, hiding the message.
- Any argument-less `renderSlotRows()` — station change, add, delete, tab switch — wipes the red state while the footer still says "Fix the highlighted…".
- Weekend errors hide behind weekday errors: the group loop returns on the first failure.
- `required` on the time inputs is decorative: `#saveBtn` is `type="button"`.

### B. Order is array order, and the resolver depends on it
- No sort anywhere. `activeSlot` (`scheduler.js:36`) returns the **first array match** — overlapping slots are resolved by position, which the user cannot see or change (slot cards have no reorder).
- `addSlot` (`app.js` ~L2476) chains the new start off the *array-last* slot's end with a fixed `end: '23:00'` → **the third click produces a zero-length `23:00→23:00` slot** that Save then refuses. The user did nothing but press the button.
- If a prior slot ends after 23:00, the new one silently *wraps* (`23:30→23:00`) with no indication.

### C. Midnight does not mean what the user thinks
- A weekday slot `23:00→01:00` does **not** cover Saturday 00:30 — `activeSlot` reads the *current* day's group. Its tail plays 00:00–01:00 on **Monday** morning instead. Nothing warns; `validateSlots` has no opinion. Intended meaning is plainly "belongs to the day it starts on".
- A 24-hour slot is unrepresentable (`start === end` is rejected); `23:59→00:00` validates but is one minute long.

### D. Deleting a station leaves ghosts
- `askDeleteStation` warns "The schedule points at it from N slots" then only splices the station (`app.js` ~L2128). Slots dangle.
- A dangling card's `<select>` shows the first station (no option selected) while the pill says "Pick a station" — Save is refused until each select is physically touched, though it *looks* correct.
- `renderSlotRows` repairs only an *empty* `stationId` (`~L2332`), never a stale one.
- Losing every station (`normalise`, `app.js:117`) swaps in the default stations wholesale and orphans the entire schedule.

### E. Runtime bugs (silent — nothing throws)
- **Dangling slot mutes the radio.** At handover `tick()` calls `disarmHandover(false)` (gain left at 0 after the 5s fade), `station(slot.stationId)` is null so `tune()` never runs, `setStatus('live')` never restores the gain, and the later `disarmHandover(true)` early-returns because `armedFor` is already null. The previous stream keeps playing at gain 0.
- **"Turn off at day end" fires on any midday gap**, not only the last slot — the branch is `!slot && !first`. And once `stopPlayback()` clears `intendedPlaying`, the retune branch is gated on it, so the schedule never restarts the radio.
- **Phantom handover:** adjacent slots on the *same* station (07–12 + 12–23) re-run `tune()` at noon with a 5s fade-down first — `slotKey` includes start/end. A same-station change should be a settings change, not a reconnect.
- The chip labels a dangling slot "Free play" (`renderNext`, `st` null) — it claims free play when a broken slot is due.

### F. Unvalidated paths into state
- `seedSettings` applies a seed file with no `validateSlots`; `cleanSlots` only drops non-objects. Overlaps, zero-length and dangling slots land in `state` and are saved.
- Slot `volume` that is not a number silently disables `applyVolume` (clampNum → null) while the card shows "50%".

### G. Small UX debts
- `openSlot` is a *position* (`group + index`), so it can point at the wrong card after add/delete, and it survives closing the drawer.
- The header flashes `--:--` mid-edit (a `type=time` input reports `''` until complete).
- New slot defaults come from the *live* radio (`state.volume`, `state.theme`), not the draft.
- Tab badge `#countSchedule` is one number for both groups; the weekday/weekend buttons carry no count and no warning.

## Design

### The one rule the user has to know

> **What you just set stays. Anything it runs into is cut back to make room, and a
> slot with nothing left is removed. A note says what happened, with Undo.**

Everything below exists to make that sentence true at every moment, on every path
into the schedule (typing, adding, deleting, deleting a station, import, seed, load),
and to make the runtime honour what the cards show.

### 1. Architecture — one function every write path goes through (`scheduler.js`)

New pure, exported functions:

| Function | Does |
|---|---|
| `settle(slots, stations, anchor)` | Returns `{ slots, changes }`. Drops unparseable/zero-length slots; re-points slots whose station is gone to the first station (matching the app's existing "wrong station beats nothing" stance in `bootTarget`); trims or removes anything the *anchor* (the slot just edited/added) runs into; with no anchor (import/seed/load) the earlier start wins. Sorts by `parseHHMM(start)`. Mutates surviving slot objects' `start`/`end` in place (object identity kept). Idempotent. **Property:** `validateSlots(settle(x).slots)` is always `[]`. |
| `occupancy(slots)` | `Uint8Array(1440)` marking covered minutes after wrap expansion — the substrate `settle` walks. |
| `suggestSlot(slots)` | Where a new slot goes (rule in §6). `null` when the day is full. |
| `dayIsOver(schedule, date)` | True when no slot change lands later on this calendar day — what "the last slot of the day" means to `tick()`. |

**`changes` shape:** `[{ kind: 'trimmed'|'removed'|'repointed', id, before: {start,end}, text }]`
with the exact user-facing `text` built here so UI, import and tests share one wording.

**Trim rule, precisely** (anchor X, neighbour N, on the 1440-minute circle so wraps work):
- X covers N's start → N starts where X ends. X covers N's end → N ends where X starts.
- X covers all of N → N removed.
- X sits strictly inside N → N keeps its **head** (the part before X); the tail is dropped, not made into a new slot. *(Judgement call — see §10.)*
- The group was valid before the edit, so only X can cause trims: one pass, no cascade.

**Existing functions that change:**
- `activeSlot(schedule, date)` — first check *yesterday's* group for a wrapping slot whose tail covers this minute; then today's group, where a wrapping slot matches only its head. This is "a slot belongs to the day it starts on", and gives the cross-group precedence rule for free: *a slot that is playing finishes before anything the next morning starts.*
- `nextChange(schedule, date)` — rewritten as "collect candidate edges (00:00, every start, every non-wrap end, yesterday's wrap ends), sort, return the first edge after now where `activeSlot` differs by id". Fixes the current bug that places a wrap slot's end on the *same* day.
- `validateSlots` — unchanged; the UI stops calling it. It becomes the invariant checker for tests and a belt-and-braces check before commit.
- Header comment (L2–4) updated: full slot shape, start-day rule, precedence.

### 2. Data model — slots get an identity

Every slot carries `id: 'sl_' + Date.now().toString(36) + counter`, assigned in `cleanSlots`
(`app.js:78`) when missing — so stored, imported and seeded schedules acquire one silently
— and in the Add handler. Persisted (harmless in export).

Why: `openSlot`, the Undo snapshot, delete-by-position and the card ↔ slot mapping are
all *positions* today, and a sorted list makes positions lie. `openSlot` becomes an id;
every card node gets `data-id`; `askDeleteSlot(group, id)`; `tick()` compares slots by
id instead of the `slotKey` string.

### 3. Where `settle` is called

| Path | Call | Notes |
|---|---|---|
| Load / seed | `normalise()` — after stations are final | Silent. Fixes the seed-file hole. |
| Import | `importSettingsInto()` both groups, no anchor | Footer: `Imported, with 2 schedule fixes. Press Save to keep it.` Strip shows the fixes, **no Undo** (the alternative is an invalid schedule). |
| Edit a time | on each valid `input`, anchor = that slot | Live. |
| Add | after push, anchor = new slot | No-op by construction; it is the one gate. |
| Delete slot / delete station | after splice / re-point | No-op by construction. |
| Save | `commitSettings()`, both groups | Belt and braces; should return no changes. `draftIsValid`'s schedule loop and the "Fix the highlighted…" path are **deleted**. |

### 4. Editing — what the user sees, action by action

Notation: station name, or `the 10:00 slot` if the station is unnamed.

| Action | Data | Sees | Note |
|---|---|---|---|
| **Focus a time field** | snapshot `undoSnap = {group, slots: clone}`; remember `fieldWas` | — | — |
| **Type, incomplete (`''`)** | nothing | header keeps the last good time — **never `--:--`** | — |
| **Type a valid time** | `slot[k] = v`; `settle(anchor)` | this card's header updates; wrap tag appears/disappears; affected cards' headers + inputs patched **in place** and flashed (`.is-touched`); removed cards slide out. **The card being edited never moves while a field in it has focus.** | `Drive Time now starts at 09:30 to make room. · Undo` / `…now ends at 07:00…` / `Drive Time, 10:00 to 11:00, was removed to make room. · Undo` / two: `X now starts at 12:00 and Y was removed to make room. · Undo` / 3+: `3 slots were shortened or removed to make room. · Undo` |
| **Type a time equal to the other end** | written; no settle | header shows `10:00 to 10:00` | none yet — the user is mid-move (start first, then end) |
| **Leave the card** (`focusout`, `relatedTarget` outside the card) | if a field is `''` → restored to slot value; if start === end → field back to `fieldWas` | `reflowSlots()`: FLIP the existing nodes into sorted order (edited card leads, stays open) | zero-length revert: `A slot can't start and end at the same time, so the start went back to 07:00.` (no Undo) |
| **Change station** | `slot.stationId` | dot colour + pill patched in place; nothing moves; existing note survives | — |
| **Flag / range / theme** | as today | as today; note + Undo survive | — |
| **Delete slot (×)** | snapshot; splice by id; settle | card slides out, cards below slide up; **no confirm dialog** — `#confirmSlot` is removed; focus moves to Undo | `Removed Drive Time, 10:00 to 12:00. · Undo` |
| **Switch group** | `slotGroup` | full render; `aria-selected`; note kept with a prefix if it belongs to the other group: `Weekdays: …` | — |
| **Save** (on this tab) | settle both; commit | as today (stays open, cards fold, SAVED plate); strip cleared | — |
| **Reopen Settings** | `openSlot = null`, `undoSnap = null` | nothing highlighted, strip hidden | — |

### 5. The note strip and Undo

```html
<div class="fix-note" id="fixNote" role="status" aria-live="polite" hidden>
  <span class="fix-text" id="fixText"></span>
  <button type="button" class="undo" id="fixUndo">Undo</button>
</div>
```
Sits **above `#slotRows`, under the group tabs, `position: sticky; top: 0`** inside the
scrolling drawer body — where the eye goes when a card jumps, and visible while editing
the fourth card of a long list. Not in the card (the fix is to *another* card, possibly
gone), not the footer plate (shared with SAVED and built to vanish).

- **No timer.** Replaced by the next fix; cleared by Undo, any later time edit, Add,
  Delete, Save, closing the drawer; kept through flag/range/station/day-end changes,
  card open/close, group switch.
- **Undo = one level.** Restores `start`/`end` of every slot in that group from the
  snapshot and re-inserts removed slots wholesale; flags, values and stations the user
  changed since are left alone. Snapshot is taken on *focus*, so typing `09:30` via
  `09` → `09:3` → `09:30` undoes to the original, not to a passed-through value. After
  Undo the strip reads `Put back.` (no button) until the next change. Restored cards
  flash. Never persisted; dies with the draft.
- Never stacks. Several changes fold into one sentence (templates above).

CSS (all `--ui-*` tokens, drawer stays theme-independent): `.fix-note` (flex row,
`--ui-field` bg, `--ui-line` border, `--ui-radius`, 12.5px, `save-msg-in` entry),
`.fix-note[hidden]{display:none}`, `.undo` (small bordered button, `.mini` hover/active
tints), `.card.is-touched / .is-new { animation: card-touch .9s }` (accent ring fading),
all listed in the existing `prefers-reduced-motion` block.

### 6. Add-slot placement (`suggestSlot`)

1. No slots → `07:00 to 10:00`.
2. Else scan free stretches round the clock from the earliest start: take the **first
   free stretch ≥ 60 min**; failing that the **longest ≥ 15 min**; failing that the day
   is full.
3. Fill it, cut at `23:00` unless the stretch begins at/after 23:00.

`[07–10]` → `10:00 to 23:00`. `[07–10][14–23]` → `10:00 to 14:00`.
`[07–10][10–14][14–23]` → `23:00 to 07:00 · past midnight`. Full day → `#addSlot` gets
`.is-off` with a hint beside it: `The day is full. Shorten a slot to make room for another.`

New card: slides in at its sorted place, `.is-new` ring, opens, `scrollIntoView`, Start
field focused. No note — adding is not a fix. Defaults come from the **draft**, not the
live radio.

### 7. Midnight, made legible

- Header: `23:00 to 01:00` then `<span class="card-late">past midnight</span>` (11px
  italic mute). Words, not a glyph.
- Open card, under the time row: `Runs past midnight. It counts as a weekday slot
  because it starts on one.` (or weekend). Taught where it applies; not "into Saturday",
  which is true one night in five.
- Both appear/disappear live as the times change.

### 8. Deleting a station that slots use (`#confirmStation`)

```
Delete this station?
Drive Time · 99.1 FM.
The schedule uses it in 3 slots.
  (•) Move those slots to  [ KISS 92.5 ▾ ]
  ( ) Delete those slots too
                          [ Keep it ]  [ Delete station ]
```
Radios + select appear only when `used > 0`; default **Move**, select on the first
*other* station. Singular wording for 1. Only station → radios hidden, hint adds
`Its 3 slots go with it.`, button `Delete anyway`. Afterwards the strip (no Undo — the
dialog was the confirmation): `3 slots now play KISS 92.5.` / `3 slots were removed with
Drive Time.` The `Pick a station` pill state and the `app.js:2332` empty-id repair are
deleted: a slot always has a live station.

### 9. Runtime — `tick()` / `updateHandover()`

- Compare slots by **id**; `lastSlotKey`/`slotKey` go; `seenOnce` replaces the
  `undefined` sentinel.
- **Day end only at day end:** `if (!slot && seenOnce && intendedPlaying)` →
  `Scheduler.dayIsOver(...)` **and** the *ended slot's group* (found by id) is `'off'`
  → `stopPlayback(); scheduleStopped = true`. A midday gap only restores the level.
- **Off then on:** slot branch runs when `intendedPlaying || scheduleStopped`; if
  `scheduleStopped`, clear it, set `intendedPlaying`, `ensureGraph()`, reset the gain
  multiplier, then tune. `scheduleStopped` is cleared by the user's own Play/Stop, so a
  manual Stop stays stopped. A browser that refuses to start audio without a gesture
  already falls into the existing `NotAllowedError → showOverlay()` tap panel.
- **Never mute:** if `station(slot.stationId)` is missing, restore the gain over
  `RETURN_FADE_MS` anyway (`settle` makes this unreachable; the fade must not depend on it).
- **Same-station handover = settings change, not a reconnect:** when the next slot's
  station is the one already playing and live, apply tone/volume/theme, no `tune()`;
  `updateHandover` disarms (no bar, no 5s fade) when `n.slot.stationId === currentStationId`.
- `#dayEnd` wording: label `When the day's last slot ends`; options `Keep playing (free
  play)` / `Turn the radio off until the next slot`; hint `Set for weekdays and the
  weekend separately. The radio comes back on by itself when the next slot starts.`

### 10. Alternatives considered, and judgement calls you can flip cheaply

- **Show conflicts and offer fixes / refuse-but-clearer** — offered, you chose auto-fix.
- **Settle on blur only** (no live trimming) — rejected: the point is seeing the
  neighbour give way as you type. Live trim + reflow-on-blur gives both.
- **Split a swallowed-middle neighbour into two** rather than keep its head — rejected
  for now: auto-creating a slot the user did not ask for is the more surprising thing.
  Undo covers regret. *Flip if you'd rather keep both pieces.*
- **Drop, not re-point, an imported slot whose station is gone** — rejected: matches the
  app's existing stance; the note says which station it got. *Flip if you'd rather lose it.*
- **Keep the delete-slot confirm dialog** — rejected: its own comment says it exists
  because there is no Undo. Now there is. Station delete keeps its dialog (more is lost,
  and it carries a choice).
- **Slot ids vs object identity** — ids chosen: Undo restores a *clone*, which breaks
  object identity.
- **Timeline/coverage bar, drag-and-drop, up/down buttons, per-day-of-week, undo history,
  "copy weekdays to weekend"** — not now. Order is a consequence of times; a bar is a
  second representation to learn; nobody has asked for the rest.

## Implementation order — four commits, each shippable

1. **`scheduler.js` + tests** — `settle`, `occupancy`, `suggestSlot`, `dayIsOver`; rewrite
   `activeSlot`/`nextChange`; ~18 tests incl. a 200-case property test
   (`validateSlots(settle(x).slots) === []`) and the cross-group wrap cases. One existing
   test flips (`activeSlot handles a slot that wraps…` — the tail is now next morning).
2. **Runtime** — `tick()`/`updateHandover()` per §9. Verifiable with the existing
   `fadewatch.js` harness (gain + status through a staged handover) extended with a
   same-station pair and an `'off'` group whose next slot must restart the radio.
3. **Data layer** — ids in `cleanSlots`; `settle` in `normalise` and `importSettingsInto`;
   import message. Verifiable with the `check.js` seed harness (hostile seed → settled).
4. **Drawer UI** — §4–8: `openSlot` as id, `renderSlotRows` with `data-id`/wrap tag/in-place
   station patch, focus/input/focusout handlers with `undoSnap`, `reflowSlots()` FLIP,
   Add rule, Delete without dialog, note strip + Undo, station-delete fates, tab counts +
   `aria-selected`, `draftIsValid` trimmed; `index.html` hint/strip/dialog; `app.css`.
   Then README (L94 "refused on save" → the rule; L106 off/on) and both readmes' schedule
   sections.

## Files

| File | Change | ~Size |
|---|---|---|
| `scheduler.js` | 4 new functions, 2 rewritten, header comment | +170 / 45 changed |
| `tests/scheduler.test.js` | ~18 new, 1 modified | +160 |
| `app.js` | `normalise`/`cleanSlots`; `tick`/`updateHandover`; slot UI; note/undo; add; delete; station delete; import; `draftIsValid`/`commitSettings` | net +220 |
| `index.html` | hint, strip, tab pills, day-end wording, `#confirmStation` radios, remove `#confirmSlot` | ~25 |
| `app.css` | `.fix-note`, `.undo`, `.card-late`, `.slot-note`, `.tab-n`, `.is-touched/.is-new`, reduced-motion; remove `.has-err/.err` | ~30 |
| `README.md`, `tools/dist-readme.txt` | schedule sections | ~10 |

Reuse: `.save-msg-in` keyframe, `.is-sliding` FLIP pattern from `moveStation`, `.mini`
tints, `.ghost.is-off`, `.hint`, `.confirm` dialog shell and its click-not-close handlers,
`clone()`, `escapeHtml()`, `renderCounts()`.

## Verification

- `node --test "tests/*.test.js"` — all green, incl. the property test.
- **Runtime** (`fadewatch.js` harness, real stream, seeded schedule around the clock):
  (a) same-station adjacent slots → no `tune()`/reconnect at the edge, no fade, gain
  stays full; (b) `scheduleEnds='off'`, slot ends at T, next slot at T+1 → `Stopped` at T,
  `Live` at T+1 without a click; (c) midday gap under `'off'` → radio keeps playing;
  (d) a hand-seeded dangling slot → gain restored, never left at 0.
- **Drawer** (CDP harness, `drawercheck.js` pattern): (a) slots 07–10 / 10–23, drive the
  first End to `11:00` via synthetic `input` while focused → second header `11:00 to 23:00`,
  strip text exact, `activeElement` still the input, DOM order unchanged; blur → reflowed;
  Undo → restored, strip `Put back.`; (b) Add ×3 → `23:00 to 07:00` with `past midnight`;
  Add ×4 → button `.is-off` + hint; (c) delete a station with slots → radios → Move →
  re-pointed; Delete too → gone; (d) import a seed with an overlap + dangling station →
  strip lists fixes, saved state passes `validateSlots`; (e) reduced-motion: no `is-touched`
  animation.
- Pixel/visual: render the strip and a `past midnight` card in the drawer at 1133px and
  at 390px (phone) to confirm the sticky strip and wrap tag lay out.
- Compliance table before each commit; push after the four.

---

## Decisions taken 2026-09-14 (second round)

These replace the corresponding "judgement calls" in §10 above.

### D1. A slot swallowed in the middle keeps its first part

Morning Show 10:00–14:00, News set to 11:00–12:00 → Morning Show becomes 10:00–11:00
and the 12:00–14:00 remainder is dropped. Note: `Shortened Morning Show to end 11:00. · Undo`

Rejected: splitting it in two (one edit would silently create a slot the user never
added, and the card count grows behind them) and removing it outright (loses the most
for the smallest edit).

### D2. Same time at both ends means all day

`08:00 to 08:00` reads as "round the clock from 08:00". Chosen over an explicit
*All day* switch because it needs no new control on a card that already carries six,
and over leaving it impossible because the closest expressible thing —
`00:00–23:59` — leaves a one-minute gap at midnight which, with *turn off at day end*
set, is a minute of silence every night.

**This inverts existing semantics and needs a one-time migration.** Today
`start === end` matches nothing, in three places: `contains` (`scheduler.js:30`),
`nextChange`'s edge loop (`:50`) and `validateSlots` (`:84`). And the Add-slot defect
this work fixes produces **exactly** `23:00→23:00` — so a user who pressed "+ Add time
slot" three times is carrying a dormant zero-length slot that would, on upgrade,
silently take over their whole day.

Migration: `state.scheduleV` (absent on every existing install). When `normalise` sees a
schedule with no `scheduleV`, it **drops** `start === end` slots — they did nothing
before, so dropping them changes nothing a user could observe — then stamps
`scheduleV: 2`. After that, equal times mean all day. One-time, silent, and it cannot
misfire on a slot created after the upgrade.

Consequent changes beyond the plan above:
- `contains`: `s === e` → always true (all day).
- `nextChange`: an all-day slot contributes one edge, its start; it is never a gap.
- `validateSlots`: the `'Start and end are the same time.'` rule is **deleted**.
- `settle`: zero-length is no longer a removal reason; an all-day slot occupies all
  1440 minutes, so anything it is settled against is trimmed to nothing and removed —
  which is correct and should be said plainly in the note.
- `suggestSlot`: never proposes an all-day slot; the day is "full" instead.
- UI: header tag `· all day` beside the times (same treatment as `· past midnight`,
  and mutually exclusive); the zero-length revert-on-blur and its note are dropped.
- `dayIsOver`: an all-day slot means the day is never over, so *turn off at day end*
  never fires for that group. Correct, and worth a line in the readme.

### D3. The delete dialog stays, but only for the delete button

A slot can leave the list two ways, and they are not the same act. Pressing the card's
× is deliberate and aimed at one slot the user is looking at; `settle()` removing a
slot is a *consequence* of editing a different one, which the user did not ask for and
might not notice. The ceremony follows that distinction:

| Slot disappears because | What happens |
|---|---|
| The user pressed × | `#confirmSlot` names it and asks. Confirmed, it is gone. No strip note — the dialog was the decision, and repeating it is noise. |
| An edit swallowed it whole | Note + Undo, no interruption |
| Import or seed found it invalid | Note, no Undo (the alternative is an invalid schedule) |
| Its station was deleted | The station dialog already asked, and carried the choice |

So `#confirmSlot`, `askDeleteSlot` and `pendingSlotDelete` are all **kept** as they are
today. The code comment at `app.js:2283-2286` that justifies the dialog by "no undo
behind it" gets rewritten: the reason is now that a deliberate removal deserves a
question, while a consequential one deserves an explanation.

The settle path must never open a dialog. One stretch of a slot can swallow two
neighbours, and a modal — let alone two in a row — in the middle of dragging a time
field would be intolerable. That path is silent, reversible, and explained by the strip.

One consequence to keep straight in the code: the × handler and the settle path both
end in "a slot left the list", but only the settle path touches the strip. The delete
handler must not call `showFix()`.

*Open if wanted later:* showing the note with Undo **after** a confirmed × as well, so
the dialog prevents accidents and Undo covers regret. Left out for now to keep the strip
meaning one thing — "here is something that happened as a result of what you did" —
rather than also echoing what the user just confirmed.

---

## D4 / commit 5. Saving points at the field, not at the card

**Asked for:** when a save needs the user's attention, red-highlight the actual
affected fields rather than leaving them to hunt.

**What is honest about this once settle lands.** After commit 4 the Schedule tab has
nothing left to refuse. `settle` guarantees `validateSlots` is empty, the
`'Fix the highlighted weekday slots.'` path is deleted, and `.has-err` on a slot card
goes with it. So there is no schedule field left to paint red — which is the point of
the previous four commits, not a gap in this one.

Every save failure that remains lives on the **Stations** tab, and each one already
knows exactly which field is at fault but does not say:

| Today | Field it actually means |
|---|---|
| `Station 3 needs a name and an http(s) stream URL.` | `[data-k="name"]` or `[data-k="url"]` on card 3 — or both |
| `Keep at least one station.` | none; stays a message |
| `No frequency set` (the `confirmBand` soft gate) | `[data-k="band"]`, already routed by `focusStationField` |

So this commit generalises the mechanism and applies it where the failures are.

### The mechanism

`markField(scope, index, key, message)` — built out of the existing
`focusStationField(index, key)` (`app.js:2220-2228`), which already opens the card,
re-renders and focuses. Added to it:

- `.is-bad` on the input itself — `border-color: #c0392b` and a 2px inner ring in the
  same red, so it reads as the field's own state rather than a box drawn round it.
- A `.field-err` line under that field carrying the reason, 12px `#c0392b`, styled like
  the `.miss-note` already used beside the read-me link.
- `scrollIntoView({ block: 'nearest' })` before focus, because `.drawer-body` scrolls
  and the current code focuses fields that may be off-screen.
- The first offending field wins focus; **every** offending field is marked, so a
  station missing both a name and a URL shows both, not one at a time.

### Clearing

- On `input` to that field — the mark and its message go immediately, so a corrected
  field stops looking wrong before the next save. This is the failure mode the old
  slot-card errors had: they never cleared, so a fixed slot still looked broken.
- On `openSettings`, and on a successful `commitSettings`.
- Never by an unrelated re-render: marks are re-applied after `renderStationRows()`
  from a small `badFields` map keyed `stationId + '|' + key`, so changing one station
  does not silently wipe another's mark — the exact defect the schedule cards had.

### Precise messages

Replacing one sentence that covers two fields:

- name empty → `A name is needed.`
- url empty → `A stream address is needed.`
- url present but not http(s) → `This needs to start with http:// or https://.`

### The schedule's one remaining case

`commitSettings` runs a belt-and-braces `settle` on both groups. It should never
return changes — if it does, something got past the live path, which is a defect in
this code and not the user's doing. Silently rewriting their schedule at the save
button would be the wrong response: those changes are shown in the note strip like any
other, so the behaviour degrades into "we fixed something" rather than "your schedule
quietly differs from what you left".

### Files

`app.js` (`markField`/`clearFieldMarks`/`badFields`, `draftIsValid` rewritten to mark
rather than narrate, `renderStationRows` re-applying marks, clearing in the station
`input` handler), `app.css` (`.in.is-bad`, `.field-err`), `index.html` (nothing).
