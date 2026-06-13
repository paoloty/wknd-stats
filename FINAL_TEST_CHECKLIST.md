# Final Test Checklist: Resurrection & Mid-Game Data Loss

## Resurrection Tests (Session Recovery After End/Clear)

### Test 1: Session Cannot Resurrect After Server-Initiated End
**Setup:**
1. Start a live game, play through full 4 quarters
2. Complete the match (End Game & Lock)
3. Verify match is locked on both devices
4. Close all browser tabs completely (hard quit)
5. Clear browser cache entirely

**Action:**
6. Reopen fresh browser tab and navigate to app
7. Load the match history/completed games

**Expected Outcome:**
- ✅ Match appears ONLY in completed/archived games, never as active live session
- ✅ No "Resume Game" button or live clock visible
- ✅ Cannot write any stats to a completed game

**Regression Risk:** Medium - If `loadActiveSession` doesn't check server state first, stale localStorage could resurrect an ended session.

---

### Test 2: Session Cannot Resurrect After Discard
**Setup:**
1. Start a live game, log some stats
2. One device clicks "Discard Live Session"
3. Immediately (before network sync completes):
   - Other device tries to continue logging stats
   - First device hard-refreshes browser
   - Second device hard-refreshes browser

**Expected Outcome:**
- ✅ Neither device can write stats after discard, even during network lag
- ✅ Discard broadcast reaches both devices and clears session
- ✅ Hard refresh shows no live session active
- ✅ No lingering live events in queues

**Regression Risk:** Medium-High - Stale sync payloads could re-apply session if tombstone check is skipped.

---

## Mid-Game Data Loss Tests

### Test 3: Stats Persist Through Network Disconnection
**Setup:**
1. Start live game, play through Q1 and Q2
2. Log stats for ~10 players (mix of points, rebounds, fouls)
3. Verify stats sync to server (check Network tab in DevTools)

**Action:**
4. Disable network (DevTools > Network tab > Offline checkbox)
5. Log additional stats in Q2 for 3-5 players
6. Re-enable network

**Expected Outcome:**
- ✅ All stats logged during offline period appear in the game log
- ✅ No duplicate entries after reconnect
- ✅ All pending events flush to server within 2-3 seconds
- ✅ Both devices converge to same stat totals

**Regression Risk:** High - Events queued during offline could be dropped or duplicated.

---

### Test 4: Game Log Survives Tab Close Mid-Quarter
**Setup:**
1. Start live game and play through Q1
2. Log 5-10 mixed stats (points, assists, rebounds, fouls)
3. Verify log appears on both devices

**Action:**
4. During Q2 play, close the browser tab WITHOUT ending the game
5. Reopen the app on same browser (LocalStorage intact)
6. Navigate back to the same game

**Expected Outcome:**
- ✅ Game log shows all stats from Q1 and Q2 (including ones logged before tab close)
- ✅ Game clock resumes at correct position in Q2
- ✅ Team scores match expected totals
- ✅ Both devices have identical logs after sync

**Regression Risk:** High - Incomplete sync before tab close could lose pending writes.

---

### Test 5: Partial Quarter Boundary Persists Correctly
**Setup:**
1. Start game, play through Q1 and Q2
2. Let Q3 clock expire and move to backfill (End Quarter & Lock button shows)
3. Log 3-5 backfill stats into Q3

**Action:**
4. Hard refresh during backfill
5. Open same game on second device

**Expected Outcome:**
- ✅ Q3 is locked/finalized in DB (checkpoint exists)
- ✅ Q3 stats logged during backfill are persisted
- ✅ Clock shows 00:00 for Q3 (not reset to 12:00)
- ✅ Button shows "End Quarter & Lock" (not Resume)
- ✅ Both devices show identical Q3 totals

**Regression Risk:** High - Backfill stats could be lost if not flushed before boundaries.

---

### Test 6: Concurrent Edits from Two Devices Don't Lose Data
**Setup:**
1. Device A: Start game, Q1
2. Device B: Open same game (observer mode or operator)
3. Device A: Log stat → "Player X: 2 pts"
4. Device B: Simultaneously log stat → "Player Y: 3 pts"
5. Both devices: Verify Network queues (DevTools > Network tab or app sync debug)

**Expected Outcome:**
- ✅ Both stats appear in final log (no loss)
- ✅ No duplicate entries
- ✅ Order is consistent across both devices after sync (latest first)
- ✅ Team totals reflect BOTH stats

**Regression Risk:** Very High - Race conditions in event merge could drop one stat.

---

### Test 7: Undo After Network Failure Doesn't Corrupt Log
**Setup:**
1. Start game, log stat → "Player X: 2 pts"
2. Disable network
3. Click Undo
4. Re-enable network

**Expected Outcome:**
- ✅ Undo entry appears in log (with "UNDO COMPENSATION" marker if present)
- ✅ Player X points show -2 delta (net 0)
- ✅ All events sync cleanly to server
- ✅ Other device shows same undo state

**Regression Risk:** Medium - Undo compensation events might not serialize correctly during offline undo.

---

### Test 8: Team Rotation (Sub/Lineup) Changes Persist
**Setup:**
1. Start game, log first few stats with current lineup
2. Make substitution (Player A out, Player B in)
3. Log stats with new lineup
4. Change network to 2G throttle (DevTools > Network tab > 2G)
5. Make another substitution
6. Log one stat with new lineup

**Expected Outcome:**
- ✅ All three lineup states are in the log
- ✅ Stats are attributed to correct players in each lineup
- ✅ Replay from checkpoint respects lineup transitions
- ✅ No missing or orphaned substitution events

**Regression Risk:** Medium - Subs and stat merging could diverge if not atomically written.

---

### Test 9: Session Timestamp & Revision Guards Prevent Stale Overwrites
**Setup:**
1. Device A: Start game, play 5 minutes, log 10 stats
2. Device B: Hard-refresh (so it fetches initial snapshot)
3. Device A: Disable network for 10 seconds, log 5 more stats
4. Device A: Force a manual sync (if available) or wait for auto-sync
5. Device B: Already synced earlier, now has stale revision number
6. Re-enable Device A network, trigger a new sync from Device A

**Expected Outcome:**
- ✅ Device A's 5 new stats appear on Device B
- ✅ Device B does not downgrade its state to an older revision
- ✅ Session revision numbers always increase (never go backward)
- ✅ Timestamps are consistent with event order

**Regression Risk:** Very High - Revision mismatch could cause one device to lose newer changes.

---

## Quick Checklist Summary

| Test | Scenario | Pass ✓ | Notes |
|------|----------|--------|-------|
| 1 | End > Refresh → No resurrection | [ ] | Server source-of-truth check |
| 2 | Discard + Offline Refresh → No resurrection | [ ] | Tombstone guard |
| 3 | Offline Stats → Reconnect | [ ] | Event queue flush |
| 4 | Tab close mid-quarter | [ ] | LocalStorage + sync integrity |
| 5 | Backfill stats + Refresh | [ ] | Boundary persistence |
| 6 | Concurrent A+B stats | [ ] | Event merge dedup |
| 7 | Undo during offline | [ ] | Undo event serialization |
| 8 | Rotation changes + throttle | [ ] | Sub/stat atomicity |
| 9 | Revision guard during stale fetch | [ ] | Timestamp/revision order |

---

## Known Risk Areas (Monitored in Code)

### Medium Risk
- **Quarter boundary transitions**: Multiple paths set `currentQuarter`; hard-lock in effects mitigates but bears watching
- **Event merge during reconnect**: Deduplication by ID is safe but requires stable event IDs

### High Risk
- **Offline event queue ordering**: Events logged offline could arrive out-of-order during reconnect flush
- **Backfill stats during boundary**: Stats logged in backfill window could race with `quarterEnd` event persistence

### Very High Risk
- **Concurrent stat writes from 2+ operators**: Merge logic is union-based (safe) but verify no events are dropped
- **Session revision downgrade**: If incoming sync has older revision, could lose recent stats

---

## Server-Side Safeguards in Place

1. ✅ `appendLiveEvent` rejects writes to ended/discarded sessions
2. ✅ `writeActiveSession` validates session status before update
3. ✅ Transactions used for teams/games/stat-actions (atomic batch writes)
4. ✅ Event deduplication by ID prevents duplicate inserts
5. ✅ Timestamp-based merge prefers newer data
6. ✅ Live events queue separate from session state (async fault-tolerant)

---

## Client-Side Safeguards in Place

1. ✅ Backfill hard-lock: clock forced to 0:00, stop-clock forced false when `quarterClockExpired` in log
2. ✅ Tombstone checks prevent resurrected ended/discarded sessions
3. ✅ Event queue persists to LocalStorage; survives refresh
4. ✅ Revision guard: incoming sessions compared by `sessionUpdatedAt` timestamp
5. ✅ Quarter boundary pinning: sync keeps quarter on ended quarter until next explicit `quarterStart`

---

## Recommendation

**If all 9 tests pass:** System is ready for production use with 2+ concurrent operators.

**If tests 3, 6, or 9 fail:** Mid-game data loss is possible; review event merge and revision logic before deploying.

**If tests 1, 2, or 5 fail:** Resurrection or backfill bugs exist; do not deploy until fixed.
