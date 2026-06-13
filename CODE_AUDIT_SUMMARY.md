# Code Audit Summary: Resurrection & Data Loss Paths

## Session Resurrection Prevention ✅

### Critical Guard: `loadActiveSession` (src/app.jsx ~4089)

```
When browser starts/refreshes:
1. Try fetch /api/active-session from server
2. If server reachable:
   - Server has session? → Use it (server is source-of-truth)
   - Server has NO session? → Purge LocalStorage (prevent resurrection)
3. If server unreachable:
   - Can use LocalStorage only if:
     a) Not tombstoned (discardedAt timestamp check passed)
     b) Not stale (< 6hr old)
     c) Not older than latest ended game timestamp
   - Otherwise: Purge LocalStorage
```

**Safeguard Status:** ✅ HIGH - Server-first policy + tombstone check prevents resurrection after end/discard.

---

### Critical Guard: `clearLiveSessionEverywhere` (src/app.jsx ~5797)

```
When user clicks "Discard" or game ends:
1. Create tombstone: discardedLiveSessionTombstoneRef.current = { sessionInstanceId, discardedAt }
2. Immediately purge LocalStorage (before network sync)
3. Send DELETE to /api/active-session with terminationStatus
4. Server marks session as 'ended' or 'discarded' in match_sessions table
5. Broadcast session_cleared to all WebSocket clients
6. Clients receive broadcast → mark tombstone locally → purge storage
```

**Safeguard Status:** ✅ HIGH - Multi-layered: local tombstone, server terminal status, broadcast.

---

### Critical Guard: Stale Remote Sync Rejection (src/app.jsx ~2348)

```
In applyRemoteLiveSession:
1. Check if incoming session's instanceId matches local tombstone
2. If matched AND tombstone.discardedAt >= incoming sync time:
   → Reject payload, don't apply
   → Call pullActiveSessionSnapshot() to re-fetch authoritative state
3. Otherwise apply normally
```

**Safeguard Status:** ✅ MEDIUM - Prevents stale payloads after discard, but only if tombstone is set.

---

## Mid-Game Data Loss Prevention

### Path 1: Event Queueing & Persistence

**File:** src/app.jsx (persistPendingLiveEvents, flushPendingLiveEvents ~line 800+)

```
When stat is logged mid-game:
1. Event added to pendingLiveEventsRef.current (in-memory)
2. Immediately persisted to localStorage: LIVE_EVENTS_QUEUE_KEY
3. On network available → flush all to /api/live-events
4. Server inserts each to live_events table (append-only)
5. Client waits for seq confirmation, removes from queue

Recovery: If tab closes mid-game with unsent events:
- Next session reads localStorage queue
- fetchMissingLiveEvents() fills any gaps from server
- flushPendingLiveEvents() sends any that didn't make it
```

**Safeguard Status:** ✅ HIGH - Events are persisted to localStorage immediately; survive tab close.

---

### Path 2: Event Deduplication During Reconnect

**File:** server.js (line ~2082, appendLiveEvent)

```
Each event has unique event_id = timestamp_randomString
Server checks: if event_id already in live_events table → skip
Result: Identical events sent twice → only inserted once
```

**Safeguard Status:** ✅ HIGH - ID-based deduplication prevents duplicates on reconnect.

---

### Path 3: Session Merge on Reconnect (Winning Writes)

**File:** server.js (mergeActiveSessions ~line 2000)

```
When Device A (offline) reconnects with stale gameLog and Device B has newer:
1. Server merges: gameLog = union(existing, incoming)
2. Event IDs used as dedup keys
3. Newer data (by timestamp in event ID) wins
4. Result: All events preserved, none lost

Same for playedPlayers: merged as set union
Same for liveStats: Device B's newer scores preserved
```

**Safeguard Status:** ✅ HIGH - Union merge prevents loss; timestamp ordering maintains consistency.

---

### Path 4: Quarter Boundary Atomic Persistence

**File:** src/app.jsx (~4121, on quarterEnd log event)

```
When a quarter ends:
1. Create checkpoint snapshot (full game state at this moment)
2. Create quarterEnd event with checkpoint attached
3. Write BOTH to gameLog
4. Call saveSessionToServer() immediately (setTimeout 0)
5. Server receives: session + gameLog with checkpoint
6. Inserts live_events records (idempotent)
7. Checkpoint embedded in game_sessions.session_json or live_events
```

**Safeguard Status:** ✅ MEDIUM-HIGH - Checkpoint captures exact boundary state, but checkpoint and quarterEnd are separate events (potential for one to be lost if network fails between the two).

---

### Path 5: Revision-Based Session Merge

**File:** server.js (line ~2172, writeActiveSession)

```
When Device A and B both send updated sessions:
1. Each includes: sessionUpdatedAt = Date.now() (millisecond timestamp)
2. Server compares: incoming.sessionUpdatedAt vs existing.sessionUpdatedAt
3. If incoming > existing: accept incoming
4. If incoming <= existing: reject (stale), return applied: false
```

**Safeguard Status:** ✅ HIGH - Timestamp guards prevent old state from overwriting new.
**CAVEAT:** Clock skew between devices could cause timestamp inversion; tolerance window would help.

---

## Known Remaining Risks

### Risk 1: Concurrent Same-Second Writes (Medium)
**Scenario:** Device A and Device B both log a stat at exact same millisecond, both send session updates.
**Current:** Whichever reaches server first wins (random).
**Mitigation:** Session includes a sequence number now (`sessionRevisionRef`), but comparison is still timestamp-based.
**Recommendation:** Add sequence counter as secondary tie-breaker.

---

### Risk 2: Backfill Stat Race with Next Quarter Start (Medium-High)
**Scenario:** 
- Q3 clock expires, quarterClockExpired logged
- User logs backfill stat for Q3
- At exact same time, another device clicks "Start Q4"
- Q4 quarterStart event logged immediately after backfill stat

**Current:** Both events are in the log, but if client reloads before sync completes, might see Q4 clock (12:00) instead of Q3 backfill.
**Mitigation:** Hard-lock in effects (hasQuarterClockExpiredFromLog) keeps Q3 active and clock=0:00 even if sync brings in Q4 event, UNTIL an explicit next-period boundary (quarterStart for Q4).
**Status:** ✅ Mitigated by quarter pinning logic (added in final batch).

---

### Risk 3: Offline Event Queue Ordering (Medium)
**Scenario:**
- Device offline
- User logs: Stat1, Stat2, Stat3 in rapid succession
- Network reconnects
- Events in offline queue: [Stat1, Stat2, Stat3]
- But server might see them as: [Stat3, Stat2, Stat1] if timestamps collide

**Current:** Events sorted by timestamp (from event ID), but rapid logging might have same millisecond.
**Mitigation:** Event IDs include randomString, so even same-ms events are unique; merge is deterministic (sort by ID lexicographically after timestamp).
**Status:** ✅ Deterministic order, but requires testing.

---

### Risk 4: Stale Sync Payload After Clear (Low-Medium)
**Scenario:**
- Device A: Discard session (tombstone set, broadcast sent)
- Device B: Offline, doesn't receive broadcast
- Device B: Reconnects after 10 minutes, gets stale session snapshot from its old sync cache

**Current:** 
1. Device B's loadActiveSession fetches /api/active-session
2. Server returns: no active session (cleared)
3. Device B: purgeStaleLocalSessionArtifacts()

**BUT** if Device B reconnects via WebSocket immediately:
1. Might receive old `sync` message from broadcast before broadcast clears
2. Tombstone check in applyRemoteLiveSession should catch it

**Status:** ✅ Mitigated by tombstone check, but requires both tombstone to be set AND incoming sync to have old timestamp.

---

## Testing Recommendations

### High Priority (Test Before Deploying)
1. ✅ **Test 3: Offline stats persist** → Validates event queue + flush
2. ✅ **Test 6: Concurrent writes** → Validates merge logic
3. ✅ **Test 9: Revision guard** → Validates timestamp ordering

### Medium Priority
4. ✅ **Test 4: Tab close mid-quarter** → Validates LocalStorage integrity
5. ✅ **Test 5: Backfill stats persist** → Validates checkpoint + boundary logic

### Lower Priority
6. ✅ **Test 1, 2, 7, 8** → Validate specific edge cases

---

## Deployment Notes

**Before going live with 2+ concurrent operators:**

- [ ] Run all 9 tests in FINAL_TEST_CHECKLIST.md
- [ ] Monitor server logs for:
  - Duplicate event IDs (should see 0)
  - Session revision downgrades (should see 0)
  - Rejected appendLiveEvent calls to ended/discarded sessions (these are normal; confirm count is low)
- [ ] Verify Network tab in DevTools shows event flushes completing (no hangs)
- [ ] Do a full game end-to-end with 2 devices + network throttling enabled
- [ ] Verify game appears in archive with correct final stats after completion

---

## Code Locations Summary

| Function | File | Line | Purpose |
|----------|------|------|---------|
| loadActiveSession | src/app.jsx | ~4089 | Server-first resurrection prevention |
| clearLiveSessionEverywhere | src/app.jsx | ~5797 | Multi-layer discard with tombstone |
| pullActiveSessionSnapshot | src/app.jsx | ~998 | Re-fetch authoritative snapshot |
| applyRemoteLiveSession | src/app.jsx | ~2320 | Tombstone check + merge logic |
| persistPendingLiveEvents | src/app.jsx | ~800+ | LocalStorage event queue |
| flushPendingLiveEvents | src/app.jsx | ~800+ | Send queued events to server |
| appendLiveEvent | server.js | ~2080 | Server-side event validation + insert |
| writeActiveSession | server.js | ~2169 | Server-side session merge + revision check |
| mergeActiveSessions | server.js | ~2000 | Union merge with timestamp ordering |
