        const { useState, useEffect, useRef } = React;

        async function apiRequest(path, options = {}) {
            const response = await fetch(path, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                },
                ...options
            });

            const text = await response.text();
            let payload = null;
            if (text) {
                try {
                    payload = JSON.parse(text);
                } catch {
                    payload = null;
                }
            }

            if (!response.ok) {
                const detail = payload?.error || (text ? text.slice(0, 240) : 'Unknown server error');
                throw new Error(`Request failed (${response.status}): ${detail}`);
            }

            return payload;
        }

        const Icons = {
            Plus: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>,
            Minus: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>,
            Users: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
            Trophy: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/></svg>,
            History: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
            ShieldAlert: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
            Activity: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
            ChevronRight: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
            X: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
            Trash: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>,
            UserPlus: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
            FolderPlus: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
            ArrowRightLeft: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/></svg>,
            Zap: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
            Undo: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        };

        // Data is loaded from SQLite-backed API endpoints.

        function App() {
            const SHOW_LIVE_SYNC_DEBUG = false;
            const [teams, setTeams] = useState([]);
            const [games, setGames] = useState([]);
            const [statActions, setStatActions] = useState([]);
            const [activeTab, setActiveTab] = useState('live');
            const [toast, setToast] = useState(null);

            // Added State to toggle roster view mode between 'averages' and 'totals'
            const [rosterViewMode, setRosterViewMode] = useState('averages');
            const [selectedRosterPlayer, setSelectedRosterPlayer] = useState(null);
            const [standingsStatMode, setStandingsStatMode] = useState('totals');
            const [leadersStatMode, setLeadersStatMode] = useState('perGame');

            const [isGameLive, setIsGameLive] = useState(false);
            const [teamAId, setTeamAId] = useState("");
            const [teamBId, setTeamBId] = useState("");
            const [teamAScore, setTeamAScore] = useState(0);
            const [teamBScore, setTeamBScore] = useState(0);
            const [currentQuarter, setCurrentQuarter] = useState(1);
            
            const [teamALineup, setTeamALineup] = useState([]);
            const [teamABench, setTeamABench] = useState([]);
            const [teamBLineup, setTeamBLineup] = useState([]);
            const [teamBBench, setTeamBBench] = useState([]);
            
            const [liveStats, setLiveStats] = useState({});
            const [gameLog, setGameLog] = useState([]);
            const [liveGameSnapshot, setLiveGameSnapshot] = useState(null);
            const [playedPlayers, setPlayedPlayers] = useState([]); 
            const [dnpPlayers, setDnpPlayers] = useState([]);
            
            const [loggedHistory, setLoggedHistory] = useState([]);
            const [activeAction, setActiveAction] = useState(null); 
            const [correctionMode, setCorrectionMode] = useState(false); 
            const [showLoggingModal, setShowLoggingModal] = useState(false);

            const [activeMobileConsoleTab, setActiveMobileConsoleTab] = useState('home');
            const [showHomeBenchAdder, setShowHomeBenchAdder] = useState(false);
            const [showAwayBenchAdder, setShowAwayBenchAdder] = useState(false);
            const [showQuarterScoring, setShowQuarterScoring] = useState(true);
            const [showLiveRunningBoxscore, setShowLiveRunningBoxscore] = useState(true);
            const [selectedHistoryGameId, setSelectedHistoryGameId] = useState(null);
            const [historyDetailTab, setHistoryDetailTab] = useState('potg');
            const [historyVideoInput, setHistoryVideoInput] = useState('');
            const [historyWriteupInput, setHistoryWriteupInput] = useState('');
            const [generatingWriteupGameId, setGeneratingWriteupGameId] = useState(null);
            const [awaitingOvertimeDecision, setAwaitingOvertimeDecision] = useState(false);
            const [awaitingPeriodStart, setAwaitingPeriodStart] = useState(false);

            // Historic Boxscore Editing States
            const [editingGame, setEditingGame] = useState(null); 
            const [editStatsTemp, setEditStatsTemp] = useState({}); 
            const [expandedEditPlayerId, setExpandedEditPlayerId] = useState(null);

            const [showNewTeamModal, setShowNewTeamModal] = useState(false);
            const [newTeamName, setNewTeamName] = useState("");
            const [newTeamColor, setNewTeamColor] = useState("#10b981");

            const [showNewPlayerModal, setShowNewPlayerModal] = useState(false);
            const [selectedTeamIdForPlayer, setSelectedTeamIdForPlayer] = useState("");
            const [newPlayerName, setNewPlayerName] = useState("");
            const [newPlayerNumber, setNewPlayerNumber] = useState("");
            const [editingPlayer, setEditingPlayer] = useState(null);
            const [advancedEditingPlayer, setAdvancedEditingPlayer] = useState(null);
            const syncSocketRef = useRef(null);
            const syncClientIdRef = useRef(`client_${Math.random().toString(36).slice(2, 10)}`);
            const suppressLiveSessionSyncRef = useRef(false);
            const pendingLiveEventsRef = useRef([]);
            const flushLiveEventsInFlightRef = useRef(false);
            const pendingActiveSessionSyncRef = useRef(null);
            const flushActiveSessionSyncInFlightRef = useRef(false);
            const processedGameLogIdsRef = useRef(new Set());
            const remoteEventIdsRef = useRef(new Set());
            const liveEventQueueReadyRef = useRef(false);
            const lastLiveSeqRef = useRef(0);
            const [flashPlayers, setFlashPlayers] = useState({});
            const [subFlashPlayers, setSubFlashPlayers] = useState({});
            const [subFlashLogId, setSubFlashLogId] = useState(null);
            const [scoreFlashTeams, setScoreFlashTeams] = useState({});
            const flashTimersRef = useRef({});
            const lastObservedLogIdRef = useRef(null);
            const prevLiveStatsRef = useRef({});
            const prevLiveScoresRef = useRef({ teamA: null, teamB: null });
            const [mobileNavOpen, setMobileNavOpen] = useState(false);
            const [showAccountMenu, setShowAccountMenu] = useState(false);

            const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
            const [subTargetPlayer, setSubTargetPlayer] = useState(null); 
            const [showAddFromBenchModal, setShowAddFromBenchModal] = useState(false);
            const [addFromBenchTeam, setAddFromBenchTeam] = useState(null);
            const [addFromBenchSelection, setAddFromBenchSelection] = useState([]);
            const [lineupRevision, setLineupRevision] = useState(0);
            const [syncDebug, setSyncDebug] = useState({
                lastIncomingEventId: '',
                lastIncomingSeq: 0,
                lastRemoteLineupRevision: 0,
                lastLocalLineupRevisionAtSync: 0,
                keepLocalRotation: false,
                pendingQueue: 0,
                hasLocalOnly: false,
                lastPersist: 'never',
                persistError: ''
            });
            const teamsRef = useRef(teams);
            const isGameLiveRef = useRef(isGameLive);
            const teamALineupRef = useRef(teamALineup);
            const teamABenchRef = useRef(teamABench);
            const teamBLineupRef = useRef(teamBLineup);
            const teamBBenchRef = useRef(teamBBench);
            const gameLogRef = useRef(gameLog);
            const liveGameSnapshotRef = useRef(liveGameSnapshot);
            const loggedHistoryRef = useRef(loggedHistory);
            const lineupRevisionRef = useRef(lineupRevision);
            const lastRemoteGameLogIdsRef = useRef(new Set());

            // Modal Alert System for 4th and 5th personal fouls
            const [foulAlert, setFoulAlert] = useState(null);

            const [confirmDialog, setConfirmDialog] = useState(null);
            const hadLiveSessionRef = useRef(false);

            const [authRole, setAuthRole] = useState('viewer');
            const [showAuthModal, setShowAuthModal] = useState(false);
            const [authFormRole, setAuthFormRole] = useState('operator');
            const [authPassword, setAuthPassword] = useState('');
            const [operatorFocus, setOperatorFocus] = useState('both');

            const canOperateLive = authRole === 'operator' || authRole === 'admin';
            const canEditPlayers = authRole === 'operator' || authRole === 'admin';
            const isLoggedIn = authRole !== 'viewer';
            const PLAYER_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
            const OPERATOR_FOCUS_KEY = 'wknd_live_operator_focus';
            const operatorFocusOptions = [
                { id: 'home' },
                { id: 'both', label: 'BOTH' },
                { id: 'away' }
            ];

            useEffect(() => {
                const savedRole = localStorage.getItem('wknd_access_role');
                if (savedRole === 'operator' || savedRole === 'admin') {
                    setAuthRole(savedRole);
                }

                const savedFocus = localStorage.getItem(OPERATOR_FOCUS_KEY);
                if (savedFocus === 'home' || savedFocus === 'away' || savedFocus === 'both') {
                    setOperatorFocus(savedFocus);
                }
            }, []);

            useEffect(() => {
                try {
                    localStorage.setItem(OPERATOR_FOCUS_KEY, operatorFocus);
                } catch (e) {}
            }, [operatorFocus]);

            const handleAuthLogin = async (e) => {
                e.preventDefault();
                try {
                    await apiRequest('/api/auth/login', {
                        method: 'POST',
                        body: JSON.stringify({ role: authFormRole, password: authPassword })
                    });

                    setAuthRole(authFormRole);
                    localStorage.setItem('wknd_access_role', authFormRole);
                    setAuthPassword('');
                    setShowAuthModal(false);
                    showToast(`Logged in as ${authFormRole}.`, 'success');
                } catch (error) {
                    showToast('Invalid login credentials.', 'error');
                }
            };

            const handleAuthLogout = () => {
                setAuthRole('viewer');
                setShowAccountMenu(false);
                localStorage.removeItem('wknd_access_role');
                setAuthPassword('');
                setShowAuthModal(false);
                setShowLoggingModal(false);
                setActiveAction(null);
                showToast('Logged out. Viewer access only.', 'info');
            };

            const canOperateTeam = (isTeamA) => {
                if (!canOperateLive) return false;
                if (operatorFocus === 'both') return true;
                return operatorFocus === (isTeamA ? 'home' : 'away');
            };

            const ensureTeamOperationAccess = (isTeamA, actionLabel = 'operate on this team') => {
                if (canOperateTeam(isTeamA)) return true;
                const teamLabel = isTeamA ? 'HOME' : 'AWAY';
                showToast(`Focus is set to ${operatorFocus.toUpperCase()}. Switch to ${teamLabel} or BOTH to ${actionLabel}.`, 'info');
                return false;
            };

            const openActionForTeam = (action, isTeamA) => {
                if (!canOperateTeam(isTeamA)) {
                    ensureTeamOperationAccess(isTeamA, 'log stats for this team');
                    return;
                }
                setActiveAction(action);
                setShowLoggingModal(true);
            };

            const showHomeLivePanel = !canOperateLive || operatorFocus !== 'away';
            const showAwayLivePanel = !canOperateLive || operatorFocus !== 'home';
            const isCompactRecordActionModal = canOperateLive && operatorFocus === 'both' && showHomeLivePanel && showAwayLivePanel;

            const cloneStatsMap = (source = {}) => {
                const cloned = {};
                Object.entries(source || {}).forEach(([playerId, stats]) => {
                    cloned[playerId] = { ...stats };
                });
                return cloned;
            };

            const LIVE_EVENTS_QUEUE_KEY = 'wknd_pending_live_events';
            const LIVE_EVENTS_LAST_SEQ_KEY = 'wknd_last_live_seq';
            const ACTIVE_SESSION_SYNC_KEY = 'wknd_pending_active_session_sync';

            const persistPendingLiveEvents = () => {
                try {
                    localStorage.setItem(LIVE_EVENTS_QUEUE_KEY, JSON.stringify(pendingLiveEventsRef.current || []));
                } catch (e) {}
            };

            const persistPendingActiveSessionSync = () => {
                try {
                    if (pendingActiveSessionSyncRef.current) {
                        localStorage.setItem(ACTIVE_SESSION_SYNC_KEY, JSON.stringify(pendingActiveSessionSyncRef.current));
                    } else {
                        localStorage.removeItem(ACTIVE_SESSION_SYNC_KEY);
                    }
                } catch (e) {}
            };

            const setLastLiveSeq = (nextSeq) => {
                const seq = Number.parseInt(nextSeq, 10) || 0;
                if (seq <= 0) return;
                if (seq > lastLiveSeqRef.current) {
                    lastLiveSeqRef.current = seq;
                    try {
                        localStorage.setItem(LIVE_EVENTS_LAST_SEQ_KEY, String(seq));
                    } catch (e) {}
                }
            };

            const applyIncomingLiveEvent = (record) => {
                const seq = Number.parseInt(record?.seq, 10) || 0;
                if (seq > 0 && seq <= lastLiveSeqRef.current) return;

                const event = record?.event;
                if (!event || typeof event !== 'object' || !event.id) return;

                if (seq > 0) {
                    setLastLiveSeq(seq);
                }

                setSyncDebug((prev) => ({
                    ...prev,
                    lastIncomingEventId: event.id,
                    lastIncomingSeq: seq,
                    pendingQueue: (pendingLiveEventsRef.current || []).length
                }));

                remoteEventIdsRef.current.add(event.id);

                if (isRotationLogEvent(event)) {
                    const rotationRevision = getLineupRevisionFromEventId(event.id);
                    if (rotationRevision > 0) {
                        setLineupRevision((prev) => {
                            const next = Math.max(prev, rotationRevision);
                            lineupRevisionRef.current = next;
                            return next;
                        });
                    }
                }

                if (event.kind === 'stat') {
                    setLoggedHistory((prev) => {
                        if (prev.some((entry) => entry.id === event.id)) return prev;
                        return [{
                            id: event.id,
                            playerId: event.playerId,
                            statField: event.statField,
                            changeAmount: event.changeAmount,
                            attachedTrackingStat: event.attachedTrackingStat,
                            trackingDelta: event.trackingDelta,
                            previousTeamAScore: null,
                            previousTeamBScore: null,
                            logText: event.text,
                            kind: 'stat',
                            actionId: event.actionId,
                            countsTeamFoul: event.countsTeamFoul
                        }, ...prev].slice(0, 300);
                    });
                }

                setGameLog((prev) => {
                    if (prev.some((log) => log.id === event.id)) return prev;
                    const nextLog = [event, ...prev].slice(0, 300);

                    const replayed = buildLiveStateFromEvents(liveGameSnapshotRef.current, nextLog);
                    if (replayed) {
                        setLiveStats(replayed.liveStats);
                        setTeamAScore(replayed.teamAScore);
                        setTeamBScore(replayed.teamBScore);
                        setCurrentQuarter(replayed.currentQuarter || 1);
                        setTeamALineup(replayed.teamALineup);
                        setTeamABench(replayed.teamABench);
                        setTeamBLineup(replayed.teamBLineup);
                        setTeamBBench(replayed.teamBBench);
                        setPlayedPlayers(replayed.playedPlayers);
                    }
                    hadLiveSessionRef.current = true;
                    setIsGameLive(true);
                    return nextLog;
                });
            };

            const fetchMissingLiveEvents = async () => {
                try {
                    const payload = await apiRequest(`/api/live-events?sinceSeq=${lastLiveSeqRef.current}`);
                    const events = Array.isArray(payload?.events) ? payload.events : [];
                    events
                        .slice()
                        .sort((a, b) => (Number.parseInt(a.seq, 10) || 0) - (Number.parseInt(b.seq, 10) || 0))
                        .forEach((record) => applyIncomingLiveEvent(record));
                } catch (e) {}
            };

            const queueActiveSessionSync = (mode, session = null) => {
                const nextRequest = {
                    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    mode,
                    sourceClientId: syncClientIdRef.current,
                    ...(mode === 'put' ? { session } : {})
                };
                pendingActiveSessionSyncRef.current = nextRequest;
                persistPendingActiveSessionSync();
                setSyncDebug((prev) => ({
                    ...prev,
                    lastPersist: `${mode.toUpperCase()} QUEUED ${new Date().toLocaleTimeString()}`,
                    persistError: ''
                }));
            };

            const flushPendingActiveSessionSync = async () => {
                if (flushActiveSessionSyncInFlightRef.current) return;
                if (!navigator.onLine) return;
                if (!pendingActiveSessionSyncRef.current) return;

                flushActiveSessionSyncInFlightRef.current = true;
                try {
                    while (pendingActiveSessionSyncRef.current) {
                        const nextRequest = pendingActiveSessionSyncRef.current;
                        if (nextRequest.mode === 'put') {
                            await apiRequest('/api/active-session', {
                                method: 'PUT',
                                body: JSON.stringify({ session: nextRequest.session, sourceClientId: nextRequest.sourceClientId })
                            });
                        } else {
                            await apiRequest('/api/active-session', {
                                method: 'DELETE',
                                body: JSON.stringify({ sourceClientId: nextRequest.sourceClientId })
                            });
                        }

                        if (pendingActiveSessionSyncRef.current?.id === nextRequest.id) {
                            pendingActiveSessionSyncRef.current = null;
                            persistPendingActiveSessionSync();
                        }

                        setSyncDebug((prev) => ({
                            ...prev,
                            lastPersist: `${nextRequest.mode.toUpperCase()} ${new Date().toLocaleTimeString()}`,
                            persistError: ''
                        }));
                    }
                } catch (error) {
                    setSyncDebug((prev) => ({
                        ...prev,
                        lastPersist: `PENDING ${new Date().toLocaleTimeString()}`,
                        persistError: error?.message || 'Active session sync failed'
                    }));
                } finally {
                    flushActiveSessionSyncInFlightRef.current = false;
                }
            };

            const flushPendingLiveEvents = async () => {
                if (flushLiveEventsInFlightRef.current) return;
                if (!navigator.onLine) return;
                if (!Array.isArray(pendingLiveEventsRef.current) || pendingLiveEventsRef.current.length === 0) return;

                flushLiveEventsInFlightRef.current = true;
                try {
                    while (pendingLiveEventsRef.current.length > 0) {
                        const nextEvent = pendingLiveEventsRef.current[0];
                        const response = await apiRequest('/api/live-events', {
                            method: 'POST',
                            body: JSON.stringify({ event: nextEvent, sourceClientId: syncClientIdRef.current })
                        });
                        setLastLiveSeq(response?.seq);
                        pendingLiveEventsRef.current.shift();
                        persistPendingLiveEvents();
                    }
                } catch (e) {
                    // Keep unsent queue for retry on next reconnect/sync tick.
                } finally {
                    flushLiveEventsInFlightRef.current = false;
                }
            };

            const enqueueLiveEvent = (event) => {
                if (!event || typeof event !== 'object' || !event.id) return;
                if (pendingLiveEventsRef.current.some((queued) => queued.id === event.id)) return;
                pendingLiveEventsRef.current.push(event);
                pendingLiveEventsRef.current = pendingLiveEventsRef.current.slice(-500);
                persistPendingLiveEvents();
                flushPendingLiveEvents();
            };

            const triggerPlayerFlash = (playerId) => {
                if (!playerId) return;

                setFlashPlayers((prev) => ({
                    ...prev,
                    [playerId]: (prev[playerId] || 0) + 1
                }));

                if (flashTimersRef.current[playerId]) {
                    clearTimeout(flashTimersRef.current[playerId]);
                }

                flashTimersRef.current[playerId] = window.setTimeout(() => {
                    setFlashPlayers((prev) => {
                        if (!prev[playerId]) return prev;
                        const next = { ...prev };
                        delete next[playerId];
                        return next;
                    });
                    delete flashTimersRef.current[playerId];
                }, 900);
            };

            const flashPlayerElements = (playerId) => {
                if (!playerId) return;

                const flashClassNames = [
                    'animate-pulse',
                    'ring-2',
                    'ring-emerald-400/70',
                    'shadow-[0_0_24px_rgba(16,185,129,0.32)]',
                    'bg-emerald-500/10'
                ];

                const elements = Array.from(document.querySelectorAll(`[data-player-id="${playerId}"]`));
                if (elements.length === 0) return;

                elements.forEach((element) => {
                    flashClassNames.forEach((className) => element.classList.add(className));
                });

                if (flashTimersRef.current[`dom_${playerId}`]) {
                    clearTimeout(flashTimersRef.current[`dom_${playerId}`]);
                }

                flashTimersRef.current[`dom_${playerId}`] = window.setTimeout(() => {
                    elements.forEach((element) => {
                        flashClassNames.forEach((className) => element.classList.remove(className));
                    });
                    delete flashTimersRef.current[`dom_${playerId}`];
                }, 900);
            };

            const triggerSubGlow = (playerId) => {
                if (!playerId) return;

                setSubFlashPlayers((prev) => ({
                    ...prev,
                    [playerId]: (prev[playerId] || 0) + 1
                }));

                const timerKey = `sub_${playerId}`;
                if (flashTimersRef.current[timerKey]) {
                    clearTimeout(flashTimersRef.current[timerKey]);
                }

                flashTimersRef.current[timerKey] = window.setTimeout(() => {
                    setSubFlashPlayers((prev) => {
                        if (!prev[playerId]) return prev;
                        const next = { ...prev };
                        delete next[playerId];
                        return next;
                    });
                    delete flashTimersRef.current[timerKey];
                }, 1900);
            };

            const triggerSubLogGlow = (logId) => {
                if (!logId) return;
                setSubFlashLogId(logId);

                const timerKey = 'sub_log_glow';
                if (flashTimersRef.current[timerKey]) {
                    clearTimeout(flashTimersRef.current[timerKey]);
                }

                flashTimersRef.current[timerKey] = window.setTimeout(() => {
                    setSubFlashLogId((current) => (current === logId ? null : current));
                    delete flashTimersRef.current[timerKey];
                }, 2200);
            };

            const triggerScoreFlash = (teamKey) => {
                if (!teamKey) return;

                setScoreFlashTeams((prev) => ({
                    ...prev,
                    [teamKey]: (prev[teamKey] || 0) + 1
                }));

                const timerKey = `score_${teamKey}`;
                if (flashTimersRef.current[timerKey]) {
                    clearTimeout(flashTimersRef.current[timerKey]);
                }

                flashTimersRef.current[timerKey] = window.setTimeout(() => {
                    setScoreFlashTeams((prev) => {
                        if (!prev[teamKey]) return prev;
                        const next = { ...prev };
                        delete next[teamKey];
                        return next;
                    });
                    delete flashTimersRef.current[timerKey];
                }, 800);
            };

            const getQuarterFromEvent = (event) => {
                const q = Number.parseInt(event?.quarter, 10);
                return Number.isFinite(q) && q >= 1 ? q : 1;
            };

            const getPeriodLabel = (quarter) => {
                const q = Number.parseInt(quarter, 10) || 1;
                return q <= 4 ? `Q${q}` : `OT${q - 4}`;
            };

            const navTabs = [
                { id: 'live', label: 'Live', icon: Icons.Activity },
                { id: 'teams', label: 'Rosters', icon: Icons.Users },
                { id: 'standings', label: 'Standings', icon: Icons.Trophy },
                { id: 'history', label: 'Game Log', icon: Icons.History },
                { id: 'leaders', label: 'Stats', icon: Icons.Trophy }
            ];
            const activeNavTab = navTabs.find((tab) => tab.id === activeTab) || navTabs[0];

            useEffect(() => {
                setMobileNavOpen(false);
            }, [activeTab]);

            const createEmptyQuarterStats = () => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 });

            const computeQuarterTeamStatsFromLog = (logs = []) => {
                const maxQuarter = Math.max(
                    4,
                    ...(logs || []).map((event) => getQuarterFromEvent(event))
                );
                const quarters = Array.from({ length: maxQuarter }, (_, idx) => idx + 1).map((quarter) => ({
                    quarter,
                    teamA: createEmptyQuarterStats(),
                    teamB: createEmptyQuarterStats()
                }));

                (logs || []).forEach((event) => {
                    if (!event || event.kind !== 'stat') return;
                    if (!['pts', 'reb', 'ast', 'stl', 'blk', 'to', 'pf'].includes(event.statField)) return;
                    if (
                        event.statField === 'pf' &&
                        (event.countsTeamFoul === false && !['pf_offensive', 'pf_technical'].includes(event.actionId))
                    ) {
                        return;
                    }
                    const delta = Number(event.changeAmount) || 0;
                    if (delta === 0) return;

                    const quarterIdx = getQuarterFromEvent(event) - 1;
                    const teamBucket = event.isTeamA === true
                        ? quarters[quarterIdx].teamA
                        : event.isTeamA === false
                            ? quarters[quarterIdx].teamB
                            : null;
                    if (!teamBucket) return;

                    teamBucket[event.statField] = Math.max(0, (teamBucket[event.statField] || 0) + delta);
                });

                return quarters;
            };

            const computeTimeoutsFromLog = (logs = []) => {
                return (logs || []).reduce((acc, event) => {
                    if (!event || event.kind !== 'meta' || event.metaType !== 'timeout') return acc;
                    if (event.isTeamA === true) acc.teamA += 1;
                    if (event.isTeamA === false) acc.teamB += 1;
                    return acc;
                }, { teamA: 0, teamB: 0 });
            };

            const computeTimeoutUsage = (logs = [], currentQuarterValue = 1) => {
                const activeQuarter = Number.parseInt(currentQuarterValue, 10) || 1;
                const usage = {
                    teamA: { regulation: 0, currentOvertime: 0 },
                    teamB: { regulation: 0, currentOvertime: 0 }
                };

                (logs || []).forEach((event) => {
                    if (!event || event.kind !== 'meta' || event.metaType !== 'timeout') return;
                    const eventQuarter = getQuarterFromEvent(event);
                    if (event.isTeamA === true) {
                        if (eventQuarter <= 4) usage.teamA.regulation += 1;
                        if (eventQuarter > 4 && eventQuarter === activeQuarter) usage.teamA.currentOvertime += 1;
                    }
                    if (event.isTeamA === false) {
                        if (eventQuarter <= 4) usage.teamB.regulation += 1;
                        if (eventQuarter > 4 && eventQuarter === activeQuarter) usage.teamB.currentOvertime += 1;
                    }
                });

                return usage;
            };

            const isTimeoutCurrentlyActive = (logs = []) => {
                for (const event of logs || []) {
                    if (!event || event.kind !== 'meta') continue;
                    if (event.metaType === 'timeout') return true;
                    if (event.metaType === 'timeoutResume') return false;
                }
                return false;
            };

            const getCurrentGameLogSegment = (logs = []) => {
                const entries = Array.isArray(logs) ? logs : [];
                const resetIndex = entries.findIndex((event) => event?.kind === 'meta' && event?.metaType === 'hardReset');
                return resetIndex >= 0 ? entries.slice(0, resetIndex + 1) : entries;
            };

            const extractYouTubeVideoId = (rawUrl = '') => {
                const value = String(rawUrl || '').trim();
                if (!value) return '';

                try {
                    const parsed = new URL(value);
                    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();

                    if (host === 'youtu.be') {
                        const idFromPath = parsed.pathname.replace(/^\//, '').split('/')[0];
                        return /^[A-Za-z0-9_-]{11}$/.test(idFromPath) ? idFromPath : '';
                    }

                    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
                        const fromQuery = parsed.searchParams.get('v');
                        if (fromQuery && /^[A-Za-z0-9_-]{11}$/.test(fromQuery)) return fromQuery;

                        const pathParts = parsed.pathname.split('/').filter(Boolean);
                        if ((pathParts[0] === 'shorts' || pathParts[0] === 'embed' || pathParts[0] === 'live') && pathParts[1]) {
                            return /^[A-Za-z0-9_-]{11}$/.test(pathParts[1]) ? pathParts[1] : '';
                        }
                    }
                } catch (error) {
                    const fallbackMatch = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
                    return fallbackMatch ? fallbackMatch[1] : '';
                }

                return '';
            };

            const normalizeYouTubeUrl = (rawUrl = '') => {
                const videoId = extractYouTubeVideoId(rawUrl);
                return videoId ? `https://www.youtube.com/watch?v=${videoId}` : '';
            };

            const getYouTubeEmbedUrl = (rawUrl = '') => {
                const videoId = extractYouTubeVideoId(rawUrl);
                return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
            };

            function hasAvailableBenchPlayer(isTeamA) {
                const targetTeamId = isTeamA ? teamAId : teamBId;
                const targetLineup = isTeamA ? teamALineup : teamBLineup;
                const targetBench = isTeamA ? teamABench : teamBBench;
                const teamObj = teams.find((t) => t.id === targetTeamId);
                if (!teamObj) return false;

                const rosterIds = (teamObj.players || []).map((p) => p.id);
                const fallbackCandidates = rosterIds.filter((id) => !targetLineup.includes(id));
                const addCandidates = targetBench.length > 0 ? targetBench : fallbackCandidates;
                return addCandidates.length > 0;
            }

            const sanitizeTeamRotation = (teamId, lineupIds = [], benchIds = [], options = {}) => {
                const { fillToFive = true } = options;
                const teamPool = (teamsRef.current && teamsRef.current.length > 0) ? teamsRef.current : teams;
                const teamObj = teamPool.find((t) => t.id === teamId);
                const roster = (teamObj?.players || []).map((p) => p.id);
                const rosterSet = new Set(roster);

                const toUniqueLoose = (ids = []) => {
                    const seen = new Set();
                    return (ids || []).filter((id) => {
                        const normalized = String(id || '');
                        if (!normalized || seen.has(normalized)) return false;
                        seen.add(normalized);
                        return true;
                    });
                };

                if (roster.length === 0) {
                    let lineup = toUniqueLoose(lineupIds).slice(0, 5);
                    let bench = toUniqueLoose(benchIds).filter((id) => !lineup.includes(id));

                    if (fillToFive && lineup.length < 5) {
                        const fillers = bench.slice(0, 5 - lineup.length);
                        lineup = [...lineup, ...fillers];
                        const lineupSet = new Set(lineup);
                        bench = bench.filter((id) => !lineupSet.has(id));
                    }

                    return { lineup, bench };
                }

                const toUniqueValid = (ids = []) => {
                    const seen = new Set();
                    return (ids || []).filter((id) => {
                        if (!rosterSet.has(id) || seen.has(id)) return false;
                        seen.add(id);
                        return true;
                    });
                };

                let lineup = toUniqueValid(lineupIds).slice(0, 5);
                const seedBench = toUniqueValid([...benchIds, ...roster]).filter((id) => !lineup.includes(id));

                if (fillToFive && lineup.length < 5) {
                    const fillers = seedBench.slice(0, 5 - lineup.length);
                    lineup = [...lineup, ...fillers];
                }

                const lineupSet = new Set(lineup);
                const bench = toUniqueValid([...seedBench, ...roster]).filter((id) => !lineupSet.has(id));

                return { lineup, bench };
            };

            const buildLiveStateFromEvents = (snapshot, events) => {
                if (!snapshot) return null;

                const buildBaseStateFromSnapshot = () => ({
                    teamAScore: snapshot.teamAScore || 0,
                    teamBScore: snapshot.teamBScore || 0,
                    currentQuarter: snapshot.currentQuarter || 1,
                    teamALineup: [...(snapshot.teamALineup || [])],
                    teamABench: [...(snapshot.teamABench || [])],
                    teamBLineup: [...(snapshot.teamBLineup || [])],
                    teamBBench: [...(snapshot.teamBBench || [])],
                    liveStats: cloneStatsMap(snapshot.liveStats || {}),
                    playedPlayers: [...(snapshot.playedPlayers || [])]
                });

                const nextState = {
                    ...buildBaseStateFromSnapshot()
                };

                const initialA = sanitizeTeamRotation(snapshot.teamAId, nextState.teamALineup, nextState.teamABench, { fillToFive: false });
                nextState.teamALineup = initialA.lineup;
                nextState.teamABench = initialA.bench;
                const initialB = sanitizeTeamRotation(snapshot.teamBId, nextState.teamBLineup, nextState.teamBBench, { fillToFive: false });
                nextState.teamBLineup = initialB.lineup;
                nextState.teamBBench = initialB.bench;

                const teamPool = (teamsRef.current && teamsRef.current.length > 0) ? teamsRef.current : teams;
                const teamAObj = teamPool.find(t => t.id === snapshot.teamAId);
                const teamBObj = teamPool.find(t => t.id === snapshot.teamBId);

                const recomputeScores = () => {
                    let totalA = 0;
                    let totalB = 0;
                    if (teamAObj) teamAObj.players.forEach(p => { totalA += nextState.liveStats[p.id]?.pts || 0; });
                    if (teamBObj) teamBObj.players.forEach(p => { totalB += nextState.liveStats[p.id]?.pts || 0; });
                    nextState.teamAScore = totalA;
                    nextState.teamBScore = totalB;
                };

                const orderedEvents = [...(events || [])].sort((a, b) => {
                    const aKey = Number.parseInt(String(a?.id || '').split('_')[0], 10);
                    const bKey = Number.parseInt(String(b?.id || '').split('_')[0], 10);
                    const safeA = Number.isFinite(aKey) ? aKey : 0;
                    const safeB = Number.isFinite(bKey) ? bKey : 0;
                    if (safeA !== safeB) return safeA - safeB;
                    return String(a?.id || '').localeCompare(String(b?.id || ''));
                });

                orderedEvents.forEach((event) => {
                    if (event.kind === 'meta' && event.metaType === 'hardReset') {
                        const base = buildBaseStateFromSnapshot();
                        nextState.teamAScore = base.teamAScore;
                        nextState.teamBScore = base.teamBScore;
                        nextState.currentQuarter = base.currentQuarter;
                        nextState.teamALineup = base.teamALineup;
                        nextState.teamABench = base.teamABench;
                        nextState.teamBLineup = base.teamBLineup;
                        nextState.teamBBench = base.teamBBench;
                        nextState.liveStats = base.liveStats;
                        nextState.playedPlayers = base.playedPlayers;

                        const sanitizedA = sanitizeTeamRotation(snapshot.teamAId, nextState.teamALineup, nextState.teamABench, { fillToFive: false });
                        nextState.teamALineup = sanitizedA.lineup;
                        nextState.teamABench = sanitizedA.bench;
                        const sanitizedB = sanitizeTeamRotation(snapshot.teamBId, nextState.teamBLineup, nextState.teamBBench, { fillToFive: false });
                        nextState.teamBLineup = sanitizedB.lineup;
                        nextState.teamBBench = sanitizedB.bench;
                        return;
                    }

                    if (event.kind === 'stat') {
                        nextState.currentQuarter = Math.max(nextState.currentQuarter, getQuarterFromEvent(event));
                        const currentVal = nextState.liveStats[event.playerId]?.[event.statField] || 0;
                        const newVal = Math.max(0, currentVal + event.changeAmount);
                        const currentPlayer = { ...(nextState.liveStats[event.playerId] || {}) };
                        currentPlayer[event.statField] = newVal;
                        if (event.attachedTrackingStat) {
                            const currentTrackVal = currentPlayer[event.attachedTrackingStat] || 0;
                            currentPlayer[event.attachedTrackingStat] = Math.max(0, currentTrackVal + event.trackingDelta);
                        }
                        nextState.liveStats[event.playerId] = currentPlayer;
                        if (!nextState.playedPlayers.includes(event.playerId)) {
                            nextState.playedPlayers.push(event.playerId);
                        }
                        recomputeScores();
                    }

                    if (event.kind === 'sub') {
                        nextState.currentQuarter = Math.max(nextState.currentQuarter, getQuarterFromEvent(event));
                        if (event.isTeamA) {
                            nextState.teamALineup = nextState.teamALineup.map(id => id === event.outId ? event.inId : id);
                            nextState.teamABench = nextState.teamABench.map(id => id === event.inId ? event.outId : id);
                            const sanitized = sanitizeTeamRotation(snapshot.teamAId, nextState.teamALineup, nextState.teamABench, { fillToFive: true });
                            nextState.teamALineup = sanitized.lineup;
                            nextState.teamABench = sanitized.bench;
                        } else {
                            nextState.teamBLineup = nextState.teamBLineup.map(id => id === event.outId ? event.inId : id);
                            nextState.teamBBench = nextState.teamBBench.map(id => id === event.inId ? event.outId : id);
                            const sanitized = sanitizeTeamRotation(snapshot.teamBId, nextState.teamBLineup, nextState.teamBBench, { fillToFive: true });
                            nextState.teamBLineup = sanitized.lineup;
                            nextState.teamBBench = sanitized.bench;
                        }
                        if (!nextState.playedPlayers.includes(event.inId)) {
                            nextState.playedPlayers.push(event.inId);
                        }
                    }

                    if (event.kind === 'meta' && event.metaType === 'quarterStart') {
                        nextState.currentQuarter = getQuarterFromEvent(event);
                    }

                    if (event.kind === 'meta' && event.metaType === 'onCourtClear') {
                        if (event.isTeamA) {
                            const sanitized = sanitizeTeamRotation(snapshot.teamAId, [], [...nextState.teamABench, ...nextState.teamALineup], { fillToFive: false });
                            nextState.teamALineup = sanitized.lineup;
                            nextState.teamABench = sanitized.bench;
                        } else if (event.isTeamA === false) {
                            const sanitized = sanitizeTeamRotation(snapshot.teamBId, [], [...nextState.teamBBench, ...nextState.teamBLineup], { fillToFive: false });
                            nextState.teamBLineup = sanitized.lineup;
                            nextState.teamBBench = sanitized.bench;
                        }
                    }

                    if (event.kind === 'meta' && event.metaType === 'onCourtAdd' && event.playerId) {
                        if (event.isTeamA) {
                            const nextLineup = [...nextState.teamALineup, event.playerId];
                            const nextBench = nextState.teamABench.filter((id) => id !== event.playerId);
                            const sanitized = sanitizeTeamRotation(snapshot.teamAId, nextLineup, nextBench, { fillToFive: false });
                            nextState.teamALineup = sanitized.lineup;
                            nextState.teamABench = sanitized.bench;
                        } else if (event.isTeamA === false) {
                            const nextLineup = [...nextState.teamBLineup, event.playerId];
                            const nextBench = nextState.teamBBench.filter((id) => id !== event.playerId);
                            const sanitized = sanitizeTeamRotation(snapshot.teamBId, nextLineup, nextBench, { fillToFive: false });
                            nextState.teamBLineup = sanitized.lineup;
                            nextState.teamBBench = sanitized.bench;
                        }
                        if (!nextState.playedPlayers.includes(event.playerId)) {
                            nextState.playedPlayers.push(event.playerId);
                        }
                    }
                });

                return nextState;
            };

            const normalizeLiveSessionEvents = (sessionGameLog = [], sessionHistory = []) => {
                const normalizedHistory = (sessionHistory || []).map((entry, idx) => ({
                    ...entry,
                    id: entry.id || `hist_${idx}_${Math.random().toString(36).slice(2, 7)}`,
                    kind: entry.kind || 'stat'
                }));

                const historyQueueByText = new Map();
                normalizedHistory.forEach((entry) => {
                    const key = entry.logText || '';
                    const bucket = historyQueueByText.get(key) || [];
                    bucket.push(entry);
                    historyQueueByText.set(key, bucket);
                });

                const normalizedLog = (sessionGameLog || []).map((log, idx) => {
                    const existing = { ...log };
                    if (existing.id) {
                        return existing;
                    }

                    const key = existing.text || '';
                    const matchedHistory = (historyQueueByText.get(key) || []).shift();
                    if (matchedHistory) {
                        return {
                            ...existing,
                            id: matchedHistory.id,
                            kind: 'stat',
                            quarter: existing.quarter || matchedHistory.quarter || 1,
                            playerId: matchedHistory.playerId,
                            statField: matchedHistory.statField,
                            changeAmount: matchedHistory.changeAmount,
                            attachedTrackingStat: matchedHistory.attachedTrackingStat,
                            trackingDelta: matchedHistory.trackingDelta
                        };
                    }

                    return {
                        ...existing,
                        id: `legacy_${idx}_${Math.random().toString(36).slice(2, 7)}`,
                        kind: existing.kind || 'meta'
                    };
                });

                return {
                    gameLog: normalizedLog,
                    loggedHistory: normalizedHistory
                };
            };

            const getLineupRevisionFromLog = (logs = []) => {
                const lineupMetaTypes = new Set(['onCourtAdd', 'onCourtClear']);
                return (logs || []).reduce((maxRevision, event) => {
                    const isRotationEvent =
                        event?.kind === 'sub' ||
                        (event?.kind === 'meta' && lineupMetaTypes.has(event?.metaType));
                    if (!isRotationEvent) return maxRevision;

                    const eventRevision = getLineupRevisionFromEventId(event?.id);
                    return eventRevision > maxRevision ? eventRevision : maxRevision;
                }, 0);
            };

            const getLineupRevisionFromEventId = (eventId) => {
                const rawId = String(eventId || '');
                const timestamp = Number.parseInt(rawId.split('_')[0], 10);
                if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;

                const suffix = rawId.split('_').slice(1).join('_');
                let hash = 0;
                for (let i = 0; i < suffix.length; i += 1) {
                    hash = (hash * 31 + suffix.charCodeAt(i)) % 997;
                }
                return (timestamp * 1000) + hash;
            };

            const isRotationLogEvent = (event) => {
                if (!event || typeof event !== 'object') return false;
                if (event.kind === 'sub') return true;
                return event.kind === 'meta' && (event.metaType === 'onCourtAdd' || event.metaType === 'onCourtClear');
            };

            const getRecentRotationEventIds = (logs = [], maxItems = 30) => {
                return (logs || [])
                    .filter((event) => isRotationLogEvent(event) && event?.id)
                    .slice(0, maxItems)
                    .map((event) => String(event.id));
            };

            const hasPendingRotationEvents = () => {
                return (pendingLiveEventsRef.current || []).some((event) => isRotationLogEvent(event));
            };

            const getEventTimestampFromId = (id) => {
                const parsed = Number.parseInt(String(id || '').split('_')[0], 10);
                return Number.isFinite(parsed) ? parsed : 0;
            };

            const mergeUniqueEventsById = (primary = [], secondary = [], maxItems = 300) => {
                const mergedById = new Map();
                [...(primary || []), ...(secondary || [])].forEach((event) => {
                    if (!event || typeof event !== 'object') return;
                    const eventId = event.id;
                    if (!eventId) return;
                    if (!mergedById.has(eventId)) {
                        mergedById.set(eventId, event);
                    }
                });

                return Array.from(mergedById.values())
                    .sort((a, b) => {
                        const tsDiff = getEventTimestampFromId(b.id) - getEventTimestampFromId(a.id);
                        if (tsDiff !== 0) return tsDiff;
                        return String(b.id).localeCompare(String(a.id));
                    })
                    .slice(0, maxItems);
            };

            const inferLiveTeamIdsFromSession = (session = {}, normalizedGameLog = []) => {
                const explicitTeamAId = session.teamAId || session.liveGameSnapshot?.teamAId || '';
                const explicitTeamBId = session.teamBId || session.liveGameSnapshot?.teamBId || '';
                if (explicitTeamAId && explicitTeamBId) {
                    return { teamAId: explicitTeamAId, teamBId: explicitTeamBId };
                }

                const teamPool = (teamsRef.current && teamsRef.current.length > 0) ? teamsRef.current : teams;
                const playerTeamIds = [];
                const seenPlayerIds = new Set();
                const candidatePlayerIds = [
                    ...(session.playedPlayers || []),
                    ...(session.teamALineup || []),
                    ...(session.teamABench || []),
                    ...(session.teamBLineup || []),
                    ...(session.teamBBench || []),
                    ...Object.keys(session.liveStats || {})
                ];

                (normalizedGameLog || []).forEach((event) => {
                    [event?.playerId, event?.outId, event?.inId].forEach((playerId) => {
                        if (playerId) candidatePlayerIds.push(playerId);
                    });
                });

                candidatePlayerIds.forEach((playerId) => {
                    if (!playerId || seenPlayerIds.has(playerId)) return;
                    seenPlayerIds.add(playerId);
                    const owningTeam = teamPool.find((team) => (team.players || []).some((player) => player.id === playerId));
                    if (owningTeam?.id && !playerTeamIds.includes(owningTeam.id)) {
                        playerTeamIds.push(owningTeam.id);
                    }
                });

                const latestMatchLabelEvent = (normalizedGameLog || []).find((event) => {
                    return typeof event?.text === 'string' && /^(Match initialized|Match restarted):\s+/i.test(event.text);
                });

                let nameDerivedTeamIds = [];
                if (latestMatchLabelEvent?.text) {
                    const labelText = latestMatchLabelEvent.text.replace(/^(Match initialized|Match restarted):\s+/i, '');
                    const nameParts = labelText.split(/\s+vs\s+/i).map((part) => part.trim()).filter(Boolean);
                    nameDerivedTeamIds = nameParts
                        .map((name) => teamPool.find((team) => String(team.name || '').trim().toLowerCase() === name.toLowerCase())?.id)
                        .filter(Boolean);
                }

                const resolvedTeamAId = explicitTeamAId || nameDerivedTeamIds[0] || playerTeamIds[0] || '';
                const resolvedTeamBId = explicitTeamBId || nameDerivedTeamIds[1] || playerTeamIds.find((teamId) => teamId !== resolvedTeamAId) || '';

                return {
                    teamAId: resolvedTeamAId,
                    teamBId: resolvedTeamBId
                };
            };

            const buildFallbackLiveSnapshot = (session = {}, resolvedTeamIds = { teamAId: '', teamBId: '' }) => {
                const teamAId = resolvedTeamIds.teamAId || '';
                const teamBId = resolvedTeamIds.teamBId || '';
                if (!teamAId || !teamBId) return null;

                const teamPool = (teamsRef.current && teamsRef.current.length > 0) ? teamsRef.current : teams;
                const teamAObj = teamPool.find((team) => team.id === teamAId);
                const teamBObj = teamPool.find((team) => team.id === teamBId);
                if (!teamAObj || !teamBObj) return null;

                const initializedStats = cloneStatsMap(session.liveStats || {});
                [...(teamAObj.players || []), ...(teamBObj.players || [])].forEach((player) => {
                    if (!initializedStats[player.id]) {
                        initializedStats[player.id] = {
                            pts: 0,
                            ast: 0,
                            reb: 0,
                            stl: 0,
                            blk: 0,
                            to: 0,
                            pf: 0,
                            fg2m: 0,
                            fg3m: 0,
                            fg2m_miss: 0,
                            fg3m_miss: 0,
                            ftm: 0,
                            ft_miss: 0
                        };
                    }
                });

                return {
                    teamAId,
                    teamBId,
                    teamAScore: session.teamAScore || 0,
                    teamBScore: session.teamBScore || 0,
                    currentQuarter: session.currentQuarter || 1,
                    teamALineup: Array.isArray(session.teamALineup) ? session.teamALineup : [],
                    teamABench: Array.isArray(session.teamABench) ? session.teamABench : [],
                    teamBLineup: Array.isArray(session.teamBLineup) ? session.teamBLineup : [],
                    teamBBench: Array.isArray(session.teamBBench) ? session.teamBBench : [],
                    liveStats: initializedStats,
                    playedPlayers: Array.isArray(session.playedPlayers) ? session.playedPlayers : []
                };
            };

            const applyRemoteLiveSession = (session) => {
                if (!session) return;

                suppressLiveSessionSyncRef.current = true;
                const normalized = normalizeLiveSessionEvents(session.gameLog || [], session.loggedHistory || []);
                const resolvedTeamIds = inferLiveTeamIdsFromSession(session, normalized.gameLog || []);
                const remoteTeamAId = resolvedTeamIds.teamAId || '';
                const remoteTeamBId = resolvedTeamIds.teamBId || '';
                const replaySnapshot = session.liveGameSnapshot || buildFallbackLiveSnapshot(session, resolvedTeamIds);
                const remoteLineupRevision = Number.parseInt(session.lineupRevision, 10) || getLineupRevisionFromLog(normalized.gameLog || []);
                const localLineupRevision = Number(lineupRevisionRef.current || 0);
                const localRecentRotationIds = getRecentRotationEventIds(gameLogRef.current || []);
                const remoteRecentRotationSet = new Set(getRecentRotationEventIds(normalized.gameLog || []));
                const remoteMissingLocalRotationEvent = localRecentRotationIds.some((eventId) => !remoteRecentRotationSet.has(eventId));
                const pendingLocalRotationEvents = hasPendingRotationEvents();
                const keepLocalRotation =
                    isGameLiveRef.current &&
                    (
                        localLineupRevision > remoteLineupRevision ||
                        pendingLocalRotationEvents ||
                        (localLineupRevision === remoteLineupRevision && remoteMissingLocalRotationEvent)
                    );

                if (keepLocalRotation && isGameLiveRef.current && (remoteMissingLocalRotationEvent || pendingLocalRotationEvents)) {
                    console.warn('Keeping local lineup to avoid stale remote rollback.', {
                        localLineupRevision,
                        remoteLineupRevision,
                        pendingLocalRotationEvents,
                        remoteMissingLocalRotationEvent,
                        localRecentRotationIds,
                        remoteRecentRotationIds: Array.from(remoteRecentRotationSet)
                    });
                }

                const effectiveGameLog = keepLocalRotation
                    ? mergeUniqueEventsById(gameLogRef.current || [], normalized.gameLog || [], 300)
                    : normalized.gameLog;
                const effectiveLoggedHistory = keepLocalRotation
                    ? mergeUniqueEventsById(loggedHistoryRef.current || [], normalized.loggedHistory || [], 300)
                    : normalized.loggedHistory;
                lastRemoteGameLogIdsRef.current = new Set((normalized.gameLog || []).map((event) => event?.id).filter(Boolean));
                const replayed = buildLiveStateFromEvents(replaySnapshot || liveGameSnapshotRef.current || null, effectiveGameLog) || null;
                const hasLocalOnly = (gameLogRef.current || []).some((event) => event?.id && !lastRemoteGameLogIdsRef.current.has(event.id));
                setSyncDebug((prev) => ({
                    ...prev,
                    lastRemoteLineupRevision: remoteLineupRevision,
                    lastLocalLineupRevisionAtSync: localLineupRevision,
                    keepLocalRotation,
                    pendingQueue: (pendingLiveEventsRef.current || []).length,
                    hasLocalOnly
                }));
                const effectiveLineupRevision = keepLocalRotation
                    ? Math.max(localLineupRevision, remoteLineupRevision)
                    : remoteLineupRevision;

                const hasRotationHistory = (effectiveGameLog || []).some((event) => isRotationLogEvent(event));
                const shouldPreferReplayedRotation = Boolean(replayed) && (hasRotationHistory || !session.liveGameSnapshot || !session.teamAId || !session.teamBId);

                const incomingTeamALineup = keepLocalRotation
                    ? teamALineupRef.current
                    : (shouldPreferReplayedRotation ? (replayed?.teamALineup || []) : (Array.isArray(session.teamALineup) ? session.teamALineup : (replayed?.teamALineup || [])));
                const incomingTeamABench = keepLocalRotation
                    ? teamABenchRef.current
                    : (shouldPreferReplayedRotation ? (replayed?.teamABench || []) : (Array.isArray(session.teamABench) ? session.teamABench : (replayed?.teamABench || [])));
                const incomingTeamBLineup = keepLocalRotation
                    ? teamBLineupRef.current
                    : (shouldPreferReplayedRotation ? (replayed?.teamBLineup || []) : (Array.isArray(session.teamBLineup) ? session.teamBLineup : (replayed?.teamBLineup || [])));
                const incomingTeamBBench = keepLocalRotation
                    ? teamBBenchRef.current
                    : (shouldPreferReplayedRotation ? (replayed?.teamBBench || []) : (Array.isArray(session.teamBBench) ? session.teamBBench : (replayed?.teamBBench || [])));
                const teamARotation = sanitizeTeamRotation(remoteTeamAId, incomingTeamALineup, incomingTeamABench, { fillToFive: false });
                const teamBRotation = sanitizeTeamRotation(remoteTeamBId, incomingTeamBLineup, incomingTeamBBench, { fillToFive: false });

                setTeamAId(remoteTeamAId);
                setTeamBId(remoteTeamBId);
                setTeamAScore(replayed?.teamAScore || session.teamAScore || 0);
                setTeamBScore(replayed?.teamBScore || session.teamBScore || 0);
                setCurrentQuarter(replayed?.currentQuarter || session.currentQuarter || 1);
                setTeamALineup(teamARotation.lineup);
                setTeamABench(teamARotation.bench);
                setTeamBLineup(teamBRotation.lineup);
                setTeamBBench(teamBRotation.bench);
                setLiveStats(replayed?.liveStats || session.liveStats || {});
                setLiveGameSnapshot(replaySnapshot || null);
                setGameLog(effectiveGameLog);
                setLoggedHistory(effectiveLoggedHistory);
                setPlayedPlayers(replayed?.playedPlayers || session.playedPlayers || []);
                setDnpPlayers(session.dnpPlayers || []);
                setAwaitingPeriodStart(Boolean(session.awaitingPeriodStart));
                setLineupRevision((prev) => {
                    const next = Math.max(prev, effectiveLineupRevision || 0);
                    lineupRevisionRef.current = next;
                    return next;
                });
                hadLiveSessionRef.current = true;
                setIsGameLive(true);
            };

            const clearRemoteLiveSession = () => {
                suppressLiveSessionSyncRef.current = true;
                lastRemoteGameLogIdsRef.current = new Set();
                setIsGameLive(false);
                setTeamAId('');
                setTeamBId('');
                setTeamAScore(0);
                setTeamBScore(0);
                setCurrentQuarter(1);
                setTeamALineup([]);
                setTeamABench([]);
                setTeamBLineup([]);
                setTeamBBench([]);
                setLiveStats({});
                setLiveGameSnapshot(null);
                setGameLog([]);
                setLoggedHistory([]);
                setPlayedPlayers([]);
                setDnpPlayers([]);
                setAwaitingPeriodStart(false);
                setLineupRevision(0);
                lineupRevisionRef.current = 0;
                hadLiveSessionRef.current = false;
            };

            const customFoulActions = [
                {
                    id: 'pf_offensive',
                    label: 'OFFENSIVE FOUL',
                    category: 'deficit',
                    stat: 'pf',
                    val: 1,
                    countsTeamFoul: true,
                    trackingStat: 'to',
                    colorClass: 'bg-red-900/40 hover:bg-red-900/60 text-red-200 border-red-700/70 shadow-sm'
                },
                {
                    id: 'pf_technical',
                    label: 'TECHNICAL FOUL',
                    category: 'deficit',
                    stat: 'pf',
                    val: 1,
                    countsTeamFoul: true,
                    colorClass: 'bg-amber-900/40 hover:bg-amber-900/60 text-amber-200 border-amber-700/70 shadow-sm'
                }
            ];

            const availableCustomFoulActions = customFoulActions.filter((customAction) => {
                return !statActions.some((existingAction) => existingAction.id === customAction.id);
            });

            const liveActionPool = [...statActions, ...availableCustomFoulActions];

            const getActionsByOrder = (orderedIds) => {
                const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
                return liveActionPool
                    .filter((act) => orderMap.has(act.id))
                    .sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
            };

            // Fixed button layout based on typical in-game stat flow, not live usage.
            const primaryActions = getActionsByOrder(['pts_2', 'pts_3', 'fg2m_miss', 'fg3m_miss']);
            const secondaryActions = getActionsByOrder(['reb', 'ast']);
            const tertiaryActions = getActionsByOrder(['pts_1', 'ft_miss', 'to', 'stl', 'blk']);
            const foulActions = getActionsByOrder(['pf', 'pf_offensive', 'pf_technical']);

            const liveHomeTeam = teams.find(t => t.id === teamAId);
            const liveAwayTeam = teams.find(t => t.id === teamBId);
            const homeTeamLabel = liveHomeTeam?.name || 'HOME';
            const awayTeamLabel = liveAwayTeam?.name || 'AWAY';
            const getFocusOptionLabel = (optionId) => {
                if (optionId === 'home') return homeTeamLabel;
                if (optionId === 'away') return awayTeamLabel;
                return 'BOTH';
            };
            const getFocusOptionActiveStyle = (optionId) => {
                const optionColor = optionId === 'home'
                    ? (liveHomeTeam?.color || '#06b6d4')
                    : optionId === 'away'
                        ? (liveAwayTeam?.color || '#ef4444')
                        : '#f59e0b';
                return {
                    backgroundColor: `${optionColor}40`,
                    borderColor: optionColor,
                    color: '#ffffff',
                    boxShadow: `0 0 0 1px ${optionColor}55`
                };
            };
            const isTieGame = teamAScore === teamBScore;
            const canStartOvertime = isTieGame;
            const homepageGameSummaries = [
                ...(isGameLive && liveHomeTeam && liveAwayTeam
                    ? [{
                        id: `live_${teamAId}_${teamBId}`,
                        status: 'LIVE',
                        date: new Date().toLocaleString(),
                        homeTeam: liveHomeTeam.name,
                        homeScore: teamAScore,
                        awayTeam: liveAwayTeam.name,
                        awayScore: teamBScore
                    }]
                    : []),
                ...games.map(g => ({
                    id: g.id,
                    status: 'ENDED',
                    date: g.date,
                    homeTeam: g.teamAName,
                    homeScore: g.teamAScore,
                    awayTeam: g.teamBName,
                    awayScore: g.teamBScore,
                    writeupSnippet: String(g.gameWriteup || '').trim().slice(0, 140)
                }))
            ];
            const teamStandings = teams.map((team) => {
                const rec = {
                    id: team.id,
                    name: team.name,
                    color: team.color,
                    wins: 0,
                    losses: 0,
                    gamesPlayed: 0,
                    pointsFor: 0,
                    pointsAgainst: 0
                };

                games.forEach((g) => {
                    if (g.teamAId !== team.id && g.teamBId !== team.id) return;
                    const teamScore = g.teamAId === team.id ? (g.teamAScore || 0) : (g.teamBScore || 0);
                    const oppScore = g.teamAId === team.id ? (g.teamBScore || 0) : (g.teamAScore || 0);
                    rec.gamesPlayed += 1;
                    rec.pointsFor += teamScore;
                    rec.pointsAgainst += oppScore;
                    if (teamScore > oppScore) rec.wins += 1;
                    if (teamScore < oppScore) rec.losses += 1;
                });

                const q = rec.pointsAgainst > 0
                    ? rec.pointsFor / rec.pointsAgainst
                    : (rec.pointsFor > 0 ? Number.POSITIVE_INFINITY : 1);

                return {
                    ...rec,
                    quotient: q
                };
            }).sort((a, b) => {
                if (b.wins !== a.wins) return b.wins - a.wins;
                if (a.losses !== b.losses) return a.losses - b.losses;
                if (b.quotient !== a.quotient) return b.quotient - a.quotient;
                return b.pointsFor - a.pointsFor;
            });
            const standingsLeaderDefs = [
                { id: 'pts', label: 'PTS' },
                { id: 'reb', label: 'REB' },
                { id: 'ast', label: 'AST' },
                { id: 'stl', label: 'STL' },
                { id: 'blk', label: 'BLK' },
                { id: 'to', label: 'TO' },
                { id: 'fgPct', label: 'FG%' },
                { id: 'fg3Pct', label: '3P%' },
                { id: 'pf', label: 'PF' }
            ];
            const getTeamTotalValue = (team, key) => {
                const players = Array.isArray(team?.players) ? team.players : [];
                const totals = players.reduce((acc, player) => {
                    const s = player?.totalStats || {};
                    acc.pts += Number(s.pts || 0);
                    acc.reb += Number(s.reb || 0);
                    acc.ast += Number(s.ast || 0);
                    acc.stl += Number(s.stl || 0);
                    acc.blk += Number(s.blk || 0);
                    acc.to += Number(s.to || 0);
                    acc.pf += Number(s.pf || 0);
                    acc.fg2m += Number(s.fg2m || 0);
                    acc.fg2m_miss += Number(s.fg2m_miss || 0);
                    acc.fg3m += Number(s.fg3m || 0);
                    acc.fg3m_miss += Number(s.fg3m_miss || 0);
                    return acc;
                }, {
                    pts: 0,
                    reb: 0,
                    ast: 0,
                    stl: 0,
                    blk: 0,
                    to: 0,
                    pf: 0,
                    fg2m: 0,
                    fg2m_miss: 0,
                    fg3m: 0,
                    fg3m_miss: 0
                });

                if (key === 'fgPct') {
                    const made = totals.fg2m + totals.fg3m;
                    const att = made + totals.fg2m_miss + totals.fg3m_miss;
                    return att > 0 ? (made / att) * 100 : 0;
                }
                if (key === 'fg3Pct') {
                    const made = totals.fg3m;
                    const att = made + totals.fg3m_miss;
                    return att > 0 ? (made / att) * 100 : 0;
                }
                return Number(totals[key] || 0);
            };
            const teamStatTotals = teams.map((team) => {
                const players = Array.isArray(team.players) ? team.players : [];
                const totalsByCategory = standingsLeaderDefs.reduce((acc, def) => {
                    acc[def.id] = getTeamTotalValue(team, def.id);
                    return acc;
                }, {});
                const standingRow = teamStandings.find((row) => row.id === team.id);
                return {
                    id: team.id,
                    name: team.name,
                    color: team.color,
                    players,
                    gamesPlayed: standingRow?.gamesPlayed || 0,
                    totalsByCategory
                };
            });
            const statCategoryLeaders = standingsLeaderDefs.map((def) => {
                const sorted = [...teamStatTotals].sort((a, b) => {
                    const bRaw = Number(b.totalsByCategory[def.id] || 0);
                    const aRaw = Number(a.totalsByCategory[def.id] || 0);
                    const isPct = def.id === 'fgPct' || def.id === 'fg3Pct';
                    const bGp = Math.max(1, Number(b.gamesPlayed || 0));
                    const aGp = Math.max(1, Number(a.gamesPlayed || 0));
                    const bVal = standingsStatMode === 'perGame' && !isPct ? (bRaw / bGp) : bRaw;
                    const aVal = standingsStatMode === 'perGame' && !isPct ? (aRaw / aGp) : aRaw;
                    if (bVal !== aVal) return bVal - aVal;
                    return a.name.localeCompare(b.name);
                });
                const top = sorted[0] || null;
                const topRaw = Number(top?.totalsByCategory?.[def.id] || 0);
                const isPct = def.id === 'fgPct' || def.id === 'fg3Pct';
                const topGp = Math.max(1, Number(top?.gamesPlayed || 0));
                return {
                    id: def.id,
                    label: def.label,
                    teamId: top?.id || '',
                    teamName: top?.name || '-',
                    teamColor: top?.color || '#94a3b8',
                    value: standingsStatMode === 'perGame' && !isPct ? (topRaw / topGp) : topRaw
                };
            });
            const selectedHistoryGame = selectedHistoryGameId
                ? (games.find(g => g.id === selectedHistoryGameId) || null)
                : null;
            const currentLiveGameLog = getCurrentGameLogSegment(gameLog);
            const liveQuarterStats = computeQuarterTeamStatsFromLog(currentLiveGameLog);
            const liveTimeouts = computeTimeoutsFromLog(currentLiveGameLog);
            const timeoutUsage = computeTimeoutUsage(currentLiveGameLog, currentQuarter);
            const timeoutLimit = currentQuarter > 4 ? 1 : 5;
            const teamATimeoutUsed = currentQuarter > 4 ? timeoutUsage.teamA.currentOvertime : timeoutUsage.teamA.regulation;
            const teamBTimeoutUsed = currentQuarter > 4 ? timeoutUsage.teamB.currentOvertime : timeoutUsage.teamB.regulation;
            const hasMatchStarted = currentLiveGameLog.some((event) => event.kind === 'meta' && event.metaType === 'matchStart');
            const hasCurrentQuarterStarted = currentLiveGameLog.some(
                (event) => event.kind === 'meta' && event.metaType === 'quarterStart' && getQuarterFromEvent(event) === currentQuarter
            );
            const latestPeriodMetaEvent = currentLiveGameLog.find(
                (event) => event?.kind === 'meta' && (event.metaType === 'matchStart' || event.metaType === 'quarterStart' || event.metaType === 'quarterEnd')
            );
            const awaitingPeriodStartFromLog = latestPeriodMetaEvent
                ? (latestPeriodMetaEvent.metaType === 'matchStart' || latestPeriodMetaEvent.metaType === 'quarterEnd')
                : false;
            const isAwaitingPeriodStart = awaitingPeriodStart || awaitingPeriodStartFromLog;
            const nextPeriodToStart = hasCurrentQuarterStarted ? currentQuarter + 1 : currentQuarter;
            const nextPeriodStartLabel = getPeriodLabel(nextPeriodToStart);
            const timeoutIsActive = isTimeoutCurrentlyActive(currentLiveGameLog);
            const periodActionLabel = !hasMatchStarted
                ? 'Start Match'
                : timeoutIsActive
                    ? `Resume ${getPeriodLabel(currentQuarter)}`
                : isAwaitingPeriodStart
                    ? `Start ${nextPeriodStartLabel}`
                : currentQuarter >= 4 && awaitingOvertimeDecision
                    ? (isTieGame ? `Start ${getPeriodLabel(currentQuarter + 1)}` : 'End Game')
                    : `End ${getPeriodLabel(currentQuarter)}`;
            const periodActionIsStart = periodActionLabel.startsWith('Start');
            const canTriggerStatLogging = hasMatchStarted && !timeoutIsActive && !isAwaitingPeriodStart;
            const teamACanTimeout = teamATimeoutUsed < timeoutLimit;
            const teamBCanTimeout = teamBTimeoutUsed < timeoutLimit;
            const teamATimeoutEnabled = hasMatchStarted && !timeoutIsActive && teamACanTimeout;
            const teamBTimeoutEnabled = hasMatchStarted && !timeoutIsActive && teamBCanTimeout;
            const teamAFoulsForDisplay = currentQuarter <= 4
                ? Number((liveQuarterStats.find((row) => row.quarter === currentQuarter)?.teamA?.pf) || 0)
                : liveQuarterStats
                    .filter((row) => row.quarter >= 4 && row.quarter <= currentQuarter)
                    .reduce((sum, row) => sum + Number(row.teamA?.pf || 0), 0);
            const teamBFoulsForDisplay = currentQuarter <= 4
                ? Number((liveQuarterStats.find((row) => row.quarter === currentQuarter)?.teamB?.pf) || 0)
                : liveQuarterStats
                    .filter((row) => row.quarter >= 4 && row.quarter <= currentQuarter)
                    .reduce((sum, row) => sum + Number(row.teamB?.pf || 0), 0);
            const foulBarMax = 5;
            const foulPeriodLabel = currentQuarter <= 4 ? getPeriodLabel(currentQuarter) : `${getPeriodLabel(4)}+`;
            const timeoutScopeLabel = currentQuarter > 4 ? getPeriodLabel(currentQuarter) : 'Reg';
            const homeCanClearOnCourt = isGameLive && teamALineup.length > 0;
            const awayCanClearOnCourt = isGameLive && teamBLineup.length > 0;
            const homeCanAddOnCourt = isGameLive && teamALineup.length < 5 && hasAvailableBenchPlayer(true);
            const awayCanAddOnCourt = isGameLive && teamBLineup.length < 5 && hasAvailableBenchPlayer(false);

            useEffect(() => {
                if (!selectedHistoryGameId) {
                    setHistoryVideoInput('');
                    return;
                }
                setHistoryVideoInput(selectedHistoryGame?.youtubeUrl || '');
            }, [selectedHistoryGameId, selectedHistoryGame ? selectedHistoryGame.youtubeUrl : '']);

            useEffect(() => {
                if (!selectedHistoryGameId) {
                    setHistoryWriteupInput('');
                    return;
                }
                setHistoryWriteupInput(selectedHistoryGame?.gameWriteup || '');
            }, [selectedHistoryGameId, selectedHistoryGame ? selectedHistoryGame.gameWriteup : '']);

            /* Managing body scrolling locks */
            useEffect(() => {
                const isAnyModalOpen = showNewTeamModal || showNewPlayerModal || showSubstitutionModal || showAddFromBenchModal || showLoggingModal || !!advancedEditingPlayer || !!confirmDialog || !!foulAlert || showAuthModal;
                if (isAnyModalOpen) {
                    document.body.style.overflow = 'hidden';
                    document.body.style.position = 'fixed';
                    document.body.style.width = '100%';
                } else {
                    document.body.style.overflow = '';
                    document.body.style.position = '';
                    document.body.style.width = '';
                }
                return () => {
                    document.body.style.overflow = '';
                    document.body.style.position = '';
                    document.body.style.width = '';
                };
            }, [showNewTeamModal, showNewPlayerModal, showSubstitutionModal, showAddFromBenchModal, showLoggingModal, advancedEditingPlayer, confirmDialog, foulAlert, showAuthModal]);

            const handleImportCSV = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.readAsText(file);
                reader.onload = (event) => {
                    try {
                        const text = event.target.result;
                        const lines = text.split('\n')
                            .map(line => line.split(',')
                                .map(cell => cell.trim().replace(/^["']|["']$/g, ''))
                            )
                            .filter(row => row.length > 1 && row.some(cell => cell !== ""));
                        
                        if (lines.length < 2) {
                            showToast("CSV file is empty or invalid.", "error");
                            return;
                        }
                        
                        const headers = lines[0].map(h => h.toLowerCase().trim().replace(/^["']|["']$/g, ''));
                        const teamIndex = headers.findIndex(h => h.includes('team'));
                        const nameIndex = headers.findIndex(h => 
                            h.includes('player') || 
                            h.includes('athlete') || 
                            h.includes('member') || 
                            (h.includes('name') && !h.includes('team'))
                        );
                        const numberIndex = headers.findIndex(h => h.includes('number') || h.includes('jersey') || h.includes('no') || h === '#');

                        if (teamIndex === -1 || nameIndex === -1) {
                            showToast("CSV must have 'Team' and 'Player Name' columns.", "error");
                            return;
                        }

                        const teamMap = {};
                        const colors = ["#e2e8f0", "#3b82f6", "#475569", "#991b1b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
                        let colorIdx = 0;

                        for (let i = 1; i < lines.length; i++) {
                            const row = lines[i];
                            if (row.length < Math.max(teamIndex, nameIndex) + 1 || !row[teamIndex] || !row[nameIndex]) continue;

                            const teamName = row[teamIndex];
                            const playerName = row[nameIndex];
                            const playerNo = numberIndex !== -1 && row[numberIndex] ? row[numberIndex] : "0";

                            if (!teamMap[teamName]) {
                                teamMap[teamName] = {
                                    id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                    name: teamName,
                                    color: colors[colorIdx % colors.length],
                                    players: []
                                };
                                colorIdx++;
                            }

                            teamMap[teamName].players.push({
                                id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                name: playerName,
                                number: playerNo,
                                positions: [],
                                gamesPlayed: 0,
                                totalStats: { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }
                            });
                        }

                        const parsedTeams = Object.values(teamMap);
                        if (parsedTeams.length === 0) {
                            showToast("No valid rosters found in CSV.", "error");
                            return;
                        }

                        saveTeamState(parsedTeams);
                        showToast(`Imported ${parsedTeams.length} teams from CSV successfully!`, "success");
                    } catch (err) {
                        showToast("Failed to parse CSV file.", "error");
                    }
                };
            };

            useEffect(() => {
                const loadState = async () => {
                    try {
                        const bootstrap = await apiRequest('/api/bootstrap');
                        const loadedTeams = Array.isArray(bootstrap?.state?.teams) ? bootstrap.state.teams : [];
                        const loadedGames = Array.isArray(bootstrap?.state?.games) ? bootstrap.state.games : [];
                        const loadedActions = Array.isArray(bootstrap?.statActions) ? bootstrap.statActions : [];

                        setTeams(normalizeTeamsForStorage(loadedTeams));
                        setGames(loadedGames.sort((a, b) => b.id.localeCompare(a.id)));
                        setStatActions(loadedActions);
                    } catch (e) {
                        console.error('Failed to load persisted state, using defaults.', e);
                        setTeams([]);
                        setGames([]);
                        setStatActions([]);
                    }
                };

                loadState();
            }, []);

            useEffect(() => {
                const hydrateSession = (session) => {
                    if (!session) return;
                    applyRemoteLiveSession(session);
                };

                try {
                    const savedPending = localStorage.getItem(LIVE_EVENTS_QUEUE_KEY);
                    const parsedPending = savedPending ? JSON.parse(savedPending) : [];
                    pendingLiveEventsRef.current = Array.isArray(parsedPending) ? parsedPending : [];
                } catch (e) {
                    pendingLiveEventsRef.current = [];
                }

                try {
                    const savedSessionSync = localStorage.getItem(ACTIVE_SESSION_SYNC_KEY);
                    const parsedSessionSync = savedSessionSync ? JSON.parse(savedSessionSync) : null;
                    pendingActiveSessionSyncRef.current = parsedSessionSync && typeof parsedSessionSync === 'object' ? parsedSessionSync : null;
                } catch (e) {
                    pendingActiveSessionSyncRef.current = null;
                }

                try {
                    const savedSeq = Number.parseInt(localStorage.getItem(LIVE_EVENTS_LAST_SEQ_KEY) || '0', 10) || 0;
                    lastLiveSeqRef.current = savedSeq;
                } catch (e) {
                    lastLiveSeqRef.current = 0;
                }

                const loadActiveSession = async () => {
                    let hydratedFromRemote = false;
                    try {
                        const payload = await apiRequest('/api/active-session');
                        if (payload?.session) {
                            hydrateSession(payload.session);
                            hydratedFromRemote = true;
                        }
                    } catch (e) {
                        // Fall back to local browser cache if DB temp cache is unavailable.
                    }

                    if (!hydratedFromRemote) {
                        try {
                            const activeSession = localStorage.getItem('active_live_session');
                            if (activeSession) {
                                hydrateSession(JSON.parse(activeSession));
                            }
                        } catch (e) {}
                    }

                    const runSyncWarmup = () => {
                        fetchMissingLiveEvents();
                        flushPendingLiveEvents();
                        flushPendingActiveSessionSync();
                    };

                    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
                        window.requestIdleCallback(() => runSyncWarmup(), { timeout: 1500 });
                    } else {
                        setTimeout(runSyncWarmup, 0);
                    }
                };

                loadActiveSession();
            }, []);

            useEffect(() => {
                const socketProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const socket = new WebSocket(`${socketProtocol}//${window.location.host}`);
                syncSocketRef.current = socket;

                socket.addEventListener('message', (event) => {
                    try {
                        const payload = JSON.parse(event.data);
                        if (payload?.type === 'live_event') {
                            if (payload.sourceClientId && payload.sourceClientId === syncClientIdRef.current) {
                                return;
                            }
                            applyIncomingLiveEvent(payload);
                            return;
                        }

                        if (payload?.type === 'sync') {
                            if (payload.sourceClientId && payload.sourceClientId === syncClientIdRef.current) {
                                return;
                            }

                            if (payload.statActions) {
                                setStatActions(Array.isArray(payload.statActions) ? payload.statActions : []);
                            }

                            if (payload.state) {
                                setTeams(normalizeTeamsForStorage(Array.isArray(payload.state.teams) ? payload.state.teams : []));
                                setGames(Array.isArray(payload.state.games) ? payload.state.games.sort((a, b) => b.id.localeCompare(a.id)) : []);
                            }

                            if ('session' in payload) {
                                if (payload.session) {
                                    applyRemoteLiveSession(payload.session);
                                } else {
                                    clearRemoteLiveSession();
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Failed to process websocket sync payload.', error);
                    }
                });

                socket.addEventListener('open', () => {
                    fetchMissingLiveEvents();
                    flushPendingLiveEvents();
                    flushPendingActiveSessionSync();
                });

                socket.addEventListener('error', () => {
                    // Keep the app functional even if realtime is unavailable.
                });

                return () => {
                    socket.close();
                };
            }, []);

            useEffect(() => {
                const handleOnline = () => {
                    fetchMissingLiveEvents();
                    flushPendingLiveEvents();
                    flushPendingActiveSessionSync();
                };

                window.addEventListener('online', handleOnline);
                return () => {
                    window.removeEventListener('online', handleOnline);
                };
            }, []);

            useEffect(() => {
                if (!isGameLive) {
                    liveEventQueueReadyRef.current = false;
                    return;
                }

                if (!liveEventQueueReadyRef.current) {
                    (gameLog || []).forEach((log) => {
                        if (log?.id) processedGameLogIdsRef.current.add(log.id);
                    });
                    liveEventQueueReadyRef.current = true;
                    flushPendingLiveEvents();
                    return;
                }

                (gameLog || []).forEach((log) => {
                    if (!log?.id) return;
                    if (processedGameLogIdsRef.current.has(log.id)) return;

                    processedGameLogIdsRef.current.add(log.id);

                    if (remoteEventIdsRef.current.has(log.id)) {
                        remoteEventIdsRef.current.delete(log.id);
                        return;
                    }

                    enqueueLiveEvent(log);
                });
            }, [isGameLive, gameLog]);

            useEffect(() => {
                if (!isGameLive) {
                    prevLiveStatsRef.current = cloneStatsMap(liveStats);
                    return;
                }

                const previous = prevLiveStatsRef.current || {};
                const next = liveStats || {};
                if (Object.keys(previous).length === 0) {
                    prevLiveStatsRef.current = cloneStatsMap(next);
                    return;
                }

                const watchedFields = ['pts', 'ast', 'reb', 'stl', 'blk', 'to', 'pf', 'fg2m', 'fg3m', 'fg2m_miss', 'fg3m_miss', 'ftm', 'ft_miss'];
                const changedPlayers = new Set();

                new Set([...Object.keys(previous), ...Object.keys(next)]).forEach((playerId) => {
                    const prevStats = previous[playerId] || {};
                    const nextStats = next[playerId] || {};
                    const changed = watchedFields.some((field) => Number(prevStats[field] || 0) !== Number(nextStats[field] || 0));
                    if (changed) {
                        changedPlayers.add(playerId);
                    }
                });

                prevLiveStatsRef.current = cloneStatsMap(next);

                changedPlayers.forEach(triggerPlayerFlash);
            }, [isGameLive, liveStats]);

            useEffect(() => {
                if (!isGameLive) {
                    prevLiveScoresRef.current = { teamA: teamAScore, teamB: teamBScore };
                    return;
                }

                const prevScores = prevLiveScoresRef.current || { teamA: null, teamB: null };
                const hasBaseline = prevScores.teamA !== null && prevScores.teamB !== null;
                if (hasBaseline) {
                    if (Number(prevScores.teamA) !== Number(teamAScore)) {
                        triggerScoreFlash('teamA');
                    }
                    if (Number(prevScores.teamB) !== Number(teamBScore)) {
                        triggerScoreFlash('teamB');
                    }
                }

                prevLiveScoresRef.current = { teamA: teamAScore, teamB: teamBScore };
            }, [isGameLive, teamAScore, teamBScore]);

            useEffect(() => {
                if (!isGameLive || !Array.isArray(gameLog) || gameLog.length === 0) return;

                const latestEvent = gameLog[0];
                if (!latestEvent?.id) return;

                if (!lastObservedLogIdRef.current) {
                    lastObservedLogIdRef.current = latestEvent.id;
                    return;
                }

                if (lastObservedLogIdRef.current === latestEvent.id) return;
                lastObservedLogIdRef.current = latestEvent.id;

                const isSubEvent = latestEvent.kind === 'sub' || (typeof latestEvent.text === 'string' && latestEvent.text.includes('SUB:'));
                if (!isSubEvent) return;

                triggerSubLogGlow(latestEvent.id);
                triggerSubGlow(latestEvent.outId);
                triggerSubGlow(latestEvent.inId);
                flashPlayerElements(latestEvent.outId);
                flashPlayerElements(latestEvent.inId);
            }, [isGameLive, gameLog]);

            useEffect(() => {
                teamsRef.current = teams;
                isGameLiveRef.current = isGameLive;
                teamALineupRef.current = teamALineup;
                teamABenchRef.current = teamABench;
                teamBLineupRef.current = teamBLineup;
                teamBBenchRef.current = teamBBench;
                gameLogRef.current = gameLog;
                liveGameSnapshotRef.current = liveGameSnapshot;
                loggedHistoryRef.current = loggedHistory;
                lineupRevisionRef.current = lineupRevision;
            }, [teams, isGameLive, teamALineup, teamABench, teamBLineup, teamBBench, gameLog, liveGameSnapshot, loggedHistory, lineupRevision]);

            useEffect(() => {
                if (suppressLiveSessionSyncRef.current) {
                    const hasPendingLocalEvents = (pendingLiveEventsRef.current || []).length > 0;
                    const remoteLogIds = lastRemoteGameLogIdsRef.current || new Set();
                    const hasLocalOnlyLogEvents = (gameLog || []).some((event) => event?.id && !remoteLogIds.has(event.id));

                    setSyncDebug((prev) => ({
                        ...prev,
                        pendingQueue: (pendingLiveEventsRef.current || []).length,
                        hasLocalOnly: hasLocalOnlyLogEvents
                    }));

                    if (!hasPendingLocalEvents && !hasLocalOnlyLogEvents) {
                        suppressLiveSessionSyncRef.current = false;
                        return;
                    }

                    // Do not swallow legitimate local updates that happen during remote apply.
                    suppressLiveSessionSyncRef.current = false;
                }

                if (isGameLive) {
                    const persistedLineupRevision = Math.max(lineupRevision || 0, getLineupRevisionFromLog(gameLog));
                    const session = { teamAId, teamBId, teamAScore, teamBScore, currentQuarter, teamALineup, teamABench, teamBLineup, teamBBench, lineupRevision: persistedLineupRevision, liveStats, liveGameSnapshot, gameLog, loggedHistory, playedPlayers, dnpPlayers, awaitingPeriodStart };
                    localStorage.setItem('active_live_session', JSON.stringify(session));
                    hadLiveSessionRef.current = true;
                    setSyncDebug((prev) => ({
                        ...prev,
                        pendingQueue: (pendingLiveEventsRef.current || []).length,
                        lastPersist: `PUT QUEUED ${new Date().toLocaleTimeString()}`,
                        persistError: ''
                    }));
                    queueActiveSessionSync('put', session);
                    flushPendingActiveSessionSync();
                } else {
                    localStorage.removeItem('active_live_session');
                    if (hadLiveSessionRef.current) {
                        hadLiveSessionRef.current = false;
                        setSyncDebug((prev) => ({
                            ...prev,
                            lastPersist: `DELETE QUEUED ${new Date().toLocaleTimeString()}`,
                            persistError: ''
                        }));
                        queueActiveSessionSync('delete');
                        flushPendingActiveSessionSync();
                    }
                }
            }, [isGameLive, teamAId, teamBId, teamAScore, teamBScore, currentQuarter, teamALineup, teamABench, teamBLineup, teamBBench, lineupRevision, liveStats, liveGameSnapshot, gameLog, loggedHistory, playedPlayers, dnpPlayers, awaitingPeriodStart]);

            const showToast = (message, type = 'success') => {
                setToast({ message, type });
                setTimeout(() => setToast(null), 3500);
            };

            const getWallClockTime = () => {
                return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            };

            const hasAnyTrackedLiveStat = (playerId) => {
                const stats = liveStats[playerId] || {};
                return Object.values(stats).some(val => Number(val || 0) > 0);
            };

            const normalizePlayerForStorage = (player) => {
                const safePlayer = player || {};
                return {
                    ...safePlayer,
                    pictureUrl: safePlayer.pictureUrl || '',
                    birthday: safePlayer.birthday || '',
                    email: safePlayer.email || '',
                    social: safePlayer.social || '',
                    contact: safePlayer.contact || '',
                    positions: Array.isArray(safePlayer.positions)
                        ? safePlayer.positions.filter((pos) => PLAYER_POSITIONS.includes(pos))
                        : [],
                    totalStats: {
                        pts: 0,
                        ast: 0,
                        reb: 0,
                        stl: 0,
                        blk: 0,
                        to: 0,
                        pf: 0,
                        fg2m: 0,
                        fg3m: 0,
                        fg2m_miss: 0,
                        fg3m_miss: 0,
                        ftm: 0,
                        ft_miss: 0,
                        ...(safePlayer.totalStats || {})
                    }
                };
            };

            const normalizeTeamsForStorage = (teamList) => {
                return (Array.isArray(teamList) ? teamList : []).map((team) => ({
                    ...team,
                    players: (Array.isArray(team?.players) ? team.players : []).map(normalizePlayerForStorage)
                }));
            };

            const togglePlayerDidNotPlay = (playerId) => {
                const currentlyMarked = dnpPlayers.includes(playerId);
                const alreadyPlayed = hasAnyTrackedLiveStat(playerId);
                if (!currentlyMarked && alreadyPlayed) {
                    showToast('Cannot mark DNP after a player has recorded stats.', 'info');
                    return;
                }
                setDnpPlayers(prev => currentlyMarked ? prev.filter(id => id !== playerId) : [...prev, playerId]);
            };

            const saveFullState = async (updatedTeams, updatedGames) => {
                const normalizedTeams = normalizeTeamsForStorage(updatedTeams);
                await apiRequest('/api/state', {
                    method: 'PUT',
                    body: JSON.stringify({ teams: normalizedTeams, games: updatedGames })
                });
            };

            const saveTeamState = async (updatedTeams) => {
                const normalizedTeams = normalizeTeamsForStorage(updatedTeams);
                setTeams(normalizedTeams);
                await apiRequest('/api/teams', {
                    method: 'PUT',
                    body: JSON.stringify({ teams: normalizedTeams })
                });
            };

            const saveNewGameState = async (newGame, updatedTeams) => {
                const updatedGames = [newGame, ...games];
                setGames(updatedGames);
                setTeams(normalizeTeamsForStorage(updatedTeams));
                await saveFullState(updatedTeams, updatedGames);
            };

            const handleSaveGameVideoLink = async (gameId) => {
                if (!gameId) return;
                const normalizedUrl = normalizeYouTubeUrl(historyVideoInput);

                if (historyVideoInput.trim() && !normalizedUrl) {
                    showToast('Please enter a valid YouTube link.', 'error');
                    return;
                }

                const updatedGames = games.map((existingGame) => {
                    if (existingGame.id !== gameId) return existingGame;
                    const nextGame = { ...existingGame };
                    if (normalizedUrl) {
                        nextGame.youtubeUrl = normalizedUrl;
                    } else {
                        delete nextGame.youtubeUrl;
                    }
                    return nextGame;
                });

                setGames(updatedGames);
                await saveFullState(teams, updatedGames);
                showToast(normalizedUrl ? 'YouTube link saved for this game.' : 'YouTube link removed.', 'success');
            };

            const handleSaveGameWriteup = async (gameId) => {
                if (!gameId) return;
                const writeupText = String(historyWriteupInput || '');

                const updatedGames = games.map((existingGame) => {
                    if (existingGame.id !== gameId) return existingGame;
                    const nextGame = { ...existingGame };
                    if (writeupText.trim()) {
                        nextGame.gameWriteup = writeupText;
                    } else {
                        delete nextGame.gameWriteup;
                    }
                    return nextGame;
                });

                setGames(updatedGames);
                await saveFullState(teams, updatedGames);
                showToast(writeupText.trim() ? 'Game recap saved.' : 'Game recap removed.', 'success');
            };

            const handleGenerateGameWriteup = async ({ game, teamAObj, teamBObj, playerOfTheGame, topTeamAPerformers, topTeamBPerformers }) => {
                if (!game || !canOperateLive) return;
                setGeneratingWriteupGameId(game.id);

                try {
                    const bestPerformers = [...(topTeamAPerformers || []), ...(topTeamBPerformers || [])]
                        .map((entry) => {
                            const belongsToTeamA = !!teamAObj?.players?.some((p) => p.id === entry.id);
                            return {
                                name: entry.name,
                                number: entry.number,
                                teamName: belongsToTeamA ? game.teamAName : game.teamBName,
                                perScore: Number(entry.perScore || 0),
                                stats: {
                                    pts: Number(entry.stats?.pts || 0),
                                    reb: Number(entry.stats?.reb || 0),
                                    ast: Number(entry.stats?.ast || 0),
                                    stl: Number(entry.stats?.stl || 0),
                                    blk: Number(entry.stats?.blk || 0),
                                    to: Number(entry.stats?.to || 0)
                                }
                            };
                        })
                        .sort((a, b) => b.perScore - a.perScore || b.stats.pts - a.stats.pts)
                        .slice(0, 8);

                    const orderedGameLog = [...(Array.isArray(game.gameLog) ? game.gameLog : [])].reverse();

                    const pbpForPrompt = orderedGameLog
                        .slice(-220)
                        .map((entry) => ({
                            time: String(entry?.time || ''),
                            team: entry?.isTeamA === true ? game.teamAName : entry?.isTeamA === false ? game.teamBName : 'Neutral',
                            text: String(entry?.text || '')
                        }))
                        .filter((entry) => entry.text.trim());

                    const finalMomentsForPrompt = orderedGameLog
                        .slice(-45)
                        .map((entry) => ({
                            time: String(entry?.time || ''),
                            team: entry?.isTeamA === true ? game.teamAName : entry?.isTeamA === false ? game.teamBName : 'Neutral',
                            text: String(entry?.text || '')
                        }))
                        .filter((entry) => entry.text.trim());

                    const response = await apiRequest('/api/generate-writeup', {
                        method: 'POST',
                        body: JSON.stringify({
                            game: {
                                id: game.id,
                                date: game.date,
                                teamAName: game.teamAName,
                                teamBName: game.teamBName,
                                teamAScore: Number(game.teamAScore || 0),
                                teamBScore: Number(game.teamBScore || 0)
                            },
                            playerOfTheGame: playerOfTheGame ? {
                                name: playerOfTheGame.name,
                                number: playerOfTheGame.number,
                                teamName: playerOfTheGame.teamName,
                                perScore: Number(playerOfTheGame.perScore || 0),
                                stats: playerOfTheGame.stats || {}
                            } : null,
                            bestPerformers,
                            playByPlay: pbpForPrompt,
                            finalMoments: finalMomentsForPrompt
                        })
                    });

                    const generated = String(response?.writeup || '').trim();
                    if (!generated) {
                        showToast('Could not generate a writeup for this game.', 'error');
                        return;
                    }

                    setHistoryWriteupInput(generated);
                    showToast('Writeup generated. Review and save when ready.', 'success');
                } catch (error) {
                    showToast(error?.message || 'Failed to generate writeup.', 'error');
                } finally {
                    setGeneratingWriteupGameId(null);
                }
            };

            const handleExportData = () => {
                try {
                    const backupData = { teams, games };
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", `league_stats_backup_${new Date().toISOString().split('T')[0]}.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                    showToast("Database backup file downloaded!", "success");
                } catch (e) {
                    showToast("Failed to export database.", "error");
                }
            };

            const handleImportData = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fileReader = new FileReader();
                fileReader.readAsText(file, "UTF-8");
                fileReader.onload = async (event) => {
                    try {
                        const parsedData = JSON.parse(event.target.result);
                        if (parsedData && Array.isArray(parsedData.teams)) {
                            const normalizedTeams = normalizeTeamsForStorage(parsedData.teams);
                            const importedGames = Array.isArray(parsedData.games) ? parsedData.games : [];
                            setTeams(normalizedTeams);
                            setGames(importedGames);
                            await saveFullState(normalizedTeams, importedGames);
                            showToast("Database backup successfully restored!", "success");
                        }
                    } catch (err) {
                        showToast("Failed to parse system backup file.", "error");
                    }
                };
            };

            const handleMergeData = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fileReader = new FileReader();
                fileReader.readAsText(file, "UTF-8");
                fileReader.onload = async (event) => {
                    try {
                        const parsedData = JSON.parse(event.target.result);
                        if (!parsedData || !Array.isArray(parsedData.teams) || !Array.isArray(parsedData.games)) {
                            showToast("Invalid backup file format for merging.", "error");
                            return;
                        }

                        let localTeamsCopy = JSON.parse(JSON.stringify(teams));
                        let localGamesCopy = JSON.parse(JSON.stringify(games));

                        const newGamesToMerge = parsedData.games.filter(ig => !localGamesCopy.some(lg => lg.id === ig.id));
                        if (newGamesToMerge.length === 0) {
                            showToast("No new game records found to merge. All imported matches already exist.", "info");
                            return;
                        }

                        let mergeCount = 0;

                        newGamesToMerge.forEach(game => {
                            let localTeamA = localTeamsCopy.find(t => t.name.toLowerCase().trim() === game.teamAName.toLowerCase().trim());
                            if (!localTeamA) {
                                const impTeam = parsedData.teams.find(t => t.id === game.teamAId) || { color: "#e2e8f0" };
                                localTeamA = {
                                    id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                    name: game.teamAName,
                                    color: impTeam.color,
                                    players: []
                                };
                                localTeamsCopy.push(localTeamA);
                            }

                            let localTeamB = localTeamsCopy.find(t => t.name.toLowerCase().trim() === game.teamBName.toLowerCase().trim());
                            if (!localTeamB) {
                                const impTeam = parsedData.teams.find(t => t.id === game.teamBId) || { color: "#3b82f6" };
                                localTeamB = {
                                    id: `team_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                    name: game.teamBName,
                                    color: impTeam.color,
                                    players: []
                                };
                                localTeamsCopy.push(localTeamB);
                            }

                            const mappedPlayerStats = {};

                            Object.entries(game.playerStats).forEach(([impPlayerId, stats]) => {
                                let impPlayerObj = null;
                                for (let t of parsedData.teams) {
                                    impPlayerObj = t.players.find(p => p.id === impPlayerId);
                                    if (impPlayerObj) break;
                                }

                                if (!impPlayerObj) {
                                    impPlayerObj = { name: `Unknown Player (${impPlayerId})`, number: "0" };
                                }

                                const importedTeamWithPlayer = parsedData.teams.find(t => t.players.some(p => p.id === impPlayerId));
                                const isTeamA = importedTeamWithPlayer && (importedTeamWithPlayer.name.toLowerCase().trim() === game.teamAName.toLowerCase().trim());
                                const targetLocalTeam = isTeamA ? localTeamA : localTeamB;

                                const impNameClean = impPlayerObj.name.toLowerCase().trim();
                                let localPlayer = targetLocalTeam.players.find(p => p.name.toLowerCase().trim() === impNameClean);
                                
                                if (!localPlayer) {
                                    const getLastName = name => name.split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                                    const impLastName = getLastName(impPlayerObj.name);
                                    localPlayer = targetLocalTeam.players.find(p => {
                                        const localLastName = getLastName(p.name);
                                        return localLastName === impLastName && impLastName.length >= 2;
                                    });
                                }

                                if (!localPlayer) {
                                    const cleanString = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                                    const impClean = cleanString(impPlayerObj.name);
                                    localPlayer = targetLocalTeam.players.find(p => {
                                        const localClean = cleanString(p.name);
                                        return (localClean.includes(impClean) || impClean.includes(localClean)) && impClean.length >= 2;
                                    });
                                }
                                
                                if (!localPlayer) {
                                    localPlayer = {
                                        id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                                        name: impPlayerObj.name,
                                        number: impPlayerObj.number,
                                        positions: Array.isArray(impPlayerObj.positions) ? impPlayerObj.positions.filter((pos) => PLAYER_POSITIONS.includes(pos)) : [],
                                        gamesPlayed: 0,
                                        totalStats: { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }
                                    };
                                    targetLocalTeam.players.push(localPlayer);
                                }

                                localPlayer.gamesPlayed = (localPlayer.gamesPlayed || 0) + 1;
                                localPlayer.totalStats.pts = (localPlayer.totalStats.pts || 0) + (stats.pts || 0);
                                localPlayer.totalStats.ast = (localPlayer.totalStats.ast || 0) + (stats.ast || 0);
                                localPlayer.totalStats.reb = (localPlayer.totalStats.reb || 0) + (stats.reb || 0);
                                localPlayer.totalStats.stl = (localPlayer.totalStats.stl || 0) + (stats.stl || 0);
                                localPlayer.totalStats.blk = (localPlayer.totalStats.blk || 0) + (stats.blk || 0);
                                localPlayer.totalStats.to = (localPlayer.totalStats.to || 0) + (stats.to || 0);
                                localPlayer.totalStats.pf = (localPlayer.totalStats.pf || 0) + (stats.pf || 0);
                                localPlayer.totalStats.fg2m = (localPlayer.totalStats.fg2m || 0) + (stats.fg2m || 0);
                                localPlayer.totalStats.fg3m = (localPlayer.totalStats.fg3m || 0) + (stats.fg3m || 0);
                                localPlayer.totalStats.fg2m_miss = (localPlayer.totalStats.fg2m_miss || 0) + (stats.fg2m_miss || 0);
                                localPlayer.totalStats.fg3m_miss = (localPlayer.totalStats.fg3m_miss || 0) + (stats.fg3m_miss || 0);
                                localPlayer.totalStats.ftm = (localPlayer.totalStats.ftm || 0) + (stats.ftm || 0);
                                localPlayer.totalStats.ft_miss = (localPlayer.totalStats.ft_miss || 0) + (stats.ft_miss || 0);

                                mappedPlayerStats[localPlayer.id] = stats;
                            });

                            const mappedGame = {
                                ...game,
                                teamAId: localTeamA.id,
                                teamBId: localTeamB.id,
                                playerStats: mappedPlayerStats
                            };

                            localGamesCopy.push(mappedGame);
                            mergeCount++;
                        });

                        localGamesCopy.sort((a, b) => b.id.localeCompare(a.id));

                        setTeams(localTeamsCopy);
                        setGames(localGamesCopy);
                        await saveFullState(localTeamsCopy, localGamesCopy);

                        showToast(`Successfully merged ${mergeCount} match(es)! Career stats matched continuously by Name.`, "success");
                    } catch (err) {
                        console.error(err);
                        showToast("Failed to complete data merge.", "error");
                    }
                };
            };

            const handleExportRostersOnly = () => {
                try {
                    const rostersOnly = teams.map(t => ({
                        id: t.id,
                        name: t.name,
                        color: t.color,
                        players: t.players.map(p => ({
                            id: p.id,
                            name: p.name,
                            number: p.number,
                            positions: Array.isArray(p.positions) ? p.positions.filter((pos) => PLAYER_POSITIONS.includes(pos)) : [],
                            gamesPlayed: 0,
                            totalStats: { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }
                        }))
                    }));
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rostersOnly));
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute("href", dataStr);
                    downloadAnchor.setAttribute("download", `league_rosters_${new Date().toISOString().split('T')[0]}.json`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                    showToast("Roster templates exported!", "success");
                } catch (e) {
                    showToast("Failed to compile roster export.", "error");
                }
            };

            const handleImportRostersOnly = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fileReader = new FileReader();
                fileReader.readAsText(file, "UTF-8");
                fileReader.onload = (event) => {
                    try {
                        const parsedRosters = JSON.parse(event.target.result);
                        if (parsedRosters && Array.isArray(parsedRosters)) {
                            saveTeamState(parsedRosters);
                            showToast("Team rosters imported!", "success");
                        }
                    } catch (err) {
                        showToast("Failed to process roster upload.", "error");
                    }
                };
            };

            const handleExportGamesCSV = () => {
                try {
                    if (homepageGameSummaries.length === 0) {
                        showToast("No game records available to export.", "info");
                        return;
                    }

                    const escapeCsv = (value) => {
                        return `"${String(value ?? '').replace(/"/g, '""')}"`;
                    };

                    const headers = ['game_id', 'status', 'date', 'home_team', 'home_score', 'away_team', 'away_score', 'winner', 'margin'];
                    const rows = homepageGameSummaries.map(game => {
                        const margin = Math.abs((game.homeScore || 0) - (game.awayScore || 0));
                        const winner = game.homeScore === game.awayScore
                            ? 'Draw'
                            : (game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam);

                        return [
                            game.id,
                            game.status,
                            game.date,
                            game.homeTeam,
                            game.homeScore,
                            game.awayTeam,
                            game.awayScore,
                            winner,
                            margin
                        ];
                    });

                    const csvContent = [
                        headers.join(','),
                        ...rows.map(row => row.map(escapeCsv).join(','))
                    ].join('\n');

                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const downloadAnchor = document.createElement('a');
                    downloadAnchor.setAttribute('href', url);
                    downloadAnchor.setAttribute('download', `wknd_games_${new Date().toISOString().split('T')[0]}.csv`);
                    document.body.appendChild(downloadAnchor);
                    downloadAnchor.click();
                    downloadAnchor.remove();
                    URL.revokeObjectURL(url);

                    showToast("Games summary exported to CSV.", "success");
                } catch (e) {
                    showToast("Failed to export games CSV.", "error");
                }
            };

            const handleStartMatch = (e) => {
                e.preventDefault();
                if (!canOperateLive) {
                    showToast('Operator/Admin access required for live game operation.', 'info');
                    return;
                }
                if (!teamAId || !teamBId || teamAId === teamBId) return;

                const teamAObj = teams.find(t => t.id === teamAId);
                const teamBObj = teams.find(t => t.id === teamBId);
                if (!teamAObj || !teamBObj || teamAObj.players.length === 0 || teamBObj.players.length === 0) return;

                const startersA = teamAObj.players.slice(0, 5).map(p => p.id);
                const benchA = teamAObj.players.slice(5).map(p => p.id);
                const startersB = teamBObj.players.slice(0, 5).map(p => p.id);
                const benchB = teamBObj.players.slice(5).map(p => p.id);

                setTeamALineup(startersA);
                setTeamABench(benchA);
                setTeamBLineup(startersB);
                setTeamBBench(benchB);

                setPlayedPlayers([...startersA, ...startersB]);
                setDnpPlayers([]);

                const initializedStats = {};
                teamAObj.players.forEach(p => { initializedStats[p.id] = { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }; });
                teamBObj.players.forEach(p => { initializedStats[p.id] = { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }; });

                const initialLiveSnapshot = {
                    teamAId,
                    teamBId,
                    teamAScore: 0,
                    teamBScore: 0,
                    currentQuarter: 1,
                    teamALineup: startersA,
                    teamABench: benchA,
                    teamBLineup: startersB,
                    teamBBench: benchB,
                    liveStats: initializedStats,
                    playedPlayers: [...startersA, ...startersB]
                };

                setLiveStats(initializedStats);
                setTeamAScore(0);
                setTeamBScore(0);
                setCurrentQuarter(1);
                setAwaitingOvertimeDecision(false);
                setAwaitingPeriodStart(false);
                setActiveAction(null);
                setCorrectionMode(false);
                setLoggedHistory([]);
                setGameLog([{ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, time: getWallClockTime(), text: `Match initialized: ${teamAObj.name} vs ${teamBObj.name}`, kind: 'meta' }]);
                setLiveGameSnapshot(initialLiveSnapshot);
                setLineupRevision(0);
                lineupRevisionRef.current = 0;
                setIsGameLive(true);
            };

            const handlePlayerClick = (playerId, isTeamA) => {
                if (!canOperateLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'log stats for this team')) return;
                if (!activeAction) return;
                if (!hasMatchStarted) {
                    showToast('Press Start Match before logging stats.', 'info');
                    return;
                }
                if (isAwaitingPeriodStart) {
                    showToast(`Press Start ${nextPeriodStartLabel} before logging stats.`, 'info');
                    return;
                }
                if (timeoutIsActive) {
                    showToast('Play is paused for timeout. Press Resume Play first.', 'info');
                    return;
                }

                const currentFouls = liveStats[playerId]?.pf || 0;
                if (currentFouls >= 5) {
                    const playerObj = teams.flatMap(t => t.players).find(p => p.id === playerId);
                    if (playerObj) {
                        showToast(`${playerObj.name} is already disqualified with 5 fouls.`, 'info');
                    }
                    return;
                }

                const multiplier = correctionMode ? -1 : 1;
                const changeAmount = activeAction.val * multiplier;
                const statField = activeAction.stat;
                const attachedTrackingStat = activeAction.trackingStat;
                const countsTeamFoul = activeAction.stat !== 'pf' ? true : activeAction.countsTeamFoul !== false;

                const playerObj = teams.flatMap(t => t.players).find(p => p.id === playerId);
                let logText = "";
                if (playerObj) {
                    if (correctionMode) {
                        logText = `🔄 CORRECTION: ${playerObj.name} stat adjusted`;
                    } else {
                        logText = `⚡ ${playerObj.name}: ${activeAction.label}`;
                    }
                }

                const isPointOrFieldGoalAction =
                    statField === 'pts' ||
                    /^fg|^ft/.test(String(statField || '')) ||
                    /^fg|^ft/.test(String(attachedTrackingStat || ''));

                const projectedTeamAScore = statField === 'pts' && isTeamA
                    ? Math.max(0, teamAScore + changeAmount)
                    : teamAScore;
                const projectedTeamBScore = statField === 'pts' && !isTeamA
                    ? Math.max(0, teamBScore + changeAmount)
                    : teamBScore;

                const scoreSuffix = isPointOrFieldGoalAction
                    ? ` [${projectedTeamAScore}-${projectedTeamBScore}]`
                    : '';

                // Foul warnings & DQ logic
                if (statField === 'pf' && !correctionMode) {
                    const currentFouls = liveStats[playerId]?.pf || 0;
                    const nextFouls = currentFouls + changeAmount;
                    if (nextFouls === 4) {
                        setFoulAlert({ playerName: playerObj.name, number: playerObj.number, fouls: 4, type: 'warning' });
                    } else if (nextFouls >= 5) {
                        setFoulAlert({ playerName: playerObj.name, number: playerObj.number, fouls: 5, type: 'disqualified' });
                    }
                }

                const logWithTag = `${logText}${scoreSuffix}`;

                const logEntryId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const historyEntry = { id: logEntryId, playerId, statField, changeAmount, attachedTrackingStat, trackingDelta: 1 * multiplier, previousTeamAScore: teamAScore, previousTeamBScore: teamBScore, logText: logWithTag, kind: 'stat' };
                historyEntry.actionId = activeAction.id;
                historyEntry.countsTeamFoul = countsTeamFoul;

                setLoggedHistory(prev => [historyEntry, ...prev]);

                if (!playedPlayers.includes(playerId)) {
                    setPlayedPlayers(prev => [...prev, playerId]);
                }
                if (dnpPlayers.includes(playerId)) {
                    setDnpPlayers(prev => prev.filter(id => id !== playerId));
                }

                setLiveStats(prev => {
                    const currentVal = prev[playerId]?.[statField] || 0;
                    const newVal = Math.max(0, currentVal + changeAmount);
                    let playerUpdate = { ...prev[playerId], [statField]: newVal };

                    if (attachedTrackingStat) {
                        const currentTrackVal = prev[playerId]?.[attachedTrackingStat] || 0;
                        playerUpdate[attachedTrackingStat] = Math.max(0, currentTrackVal + (1 * multiplier));
                    }

                    const updated = { ...prev, [playerId]: playerUpdate };
                    let totalA = 0, totalB = 0;
                    const teamAObj = teams.find(t => t.id === teamAId);
                    const teamBObj = teams.find(t => t.id === teamBId);

                    if (teamAObj) teamAObj.players.forEach(p => { totalA += updated[p.id]?.pts || 0; });
                    if (teamBObj) teamBObj.players.forEach(p => { totalB += updated[p.id]?.pts || 0; });

                    setTeamAScore(totalA);
                    setTeamBScore(totalB);
                    return updated;
                });

                setGameLog(prev => [{
                    id: logEntryId,
                    time: getWallClockTime(),
                    text: logWithTag,
                    kind: 'stat',
                    quarter: currentQuarter,
                    isTeamA,
                    actionId: activeAction.id,
                    countsTeamFoul,
                    playerId,
                    statField,
                    changeAmount,
                    attachedTrackingStat,
                    trackingDelta: 1 * multiplier
                }, ...prev.slice(0, 300)]);
                triggerPlayerFlash(playerId);
                flashPlayerElements(playerId);
                setActiveAction(null);
                setCorrectionMode(false);
                setShowLoggingModal(false);
            };

            const handleUndo = () => {
                if (loggedHistory.length === 0) return;
                const [lastAction, ...remainingHistory] = loggedHistory;
                const remainingGameLog = gameLog.filter(log => log.id !== lastAction.id);
                const replayed = buildLiveStateFromEvents(liveGameSnapshot, remainingGameLog);
                if (!replayed) return;

                setLoggedHistory(remainingHistory);
                setLiveStats(replayed.liveStats);
                setTeamAScore(replayed.teamAScore);
                setTeamBScore(replayed.teamBScore);
                setCurrentQuarter(replayed.currentQuarter || 1);
                setTeamALineup(replayed.teamALineup);
                setTeamABench(replayed.teamABench);
                setTeamBLineup(replayed.teamBLineup);
                setTeamBBench(replayed.teamBBench);
                setPlayedPlayers(replayed.playedPlayers);
                setGameLog(remainingGameLog);
                if (lastAction.playerId) {
                    triggerPlayerFlash(lastAction.playerId);
                    flashPlayerElements(lastAction.playerId);
                }
            };

            const handleDeleteLogEntry = (logId) => {
                const entry = gameLog.find(log => log.id === logId);
                if (!entry) return;

                const remainingGameLog = gameLog.filter(log => log.id !== logId);
                const remainingHistory = loggedHistory.filter(item => item.id !== logId);

                const historyMatch = loggedHistory.find(item => item.id === logId) || loggedHistory.find(item => item.logText === entry.text);
                const statSource = (entry.kind === 'stat' && entry.playerId && entry.statField)
                    ? entry
                    : (historyMatch && historyMatch.playerId && historyMatch.statField ? historyMatch : null);

                if (statSource) {
                    setLiveStats(prev => {
                        const currentPlayerStats = prev[statSource.playerId] || {};
                        const revertedValue = Math.max(0, (currentPlayerStats[statSource.statField] || 0) - (statSource.changeAmount || 0));
                        const revertedPlayerStats = {
                            ...currentPlayerStats,
                            [statSource.statField]: revertedValue
                        };

                        if (statSource.attachedTrackingStat) {
                            const trackingDelta = Number.isFinite(statSource.trackingDelta)
                                ? statSource.trackingDelta
                                : ((statSource.changeAmount || 0) > 0 ? 1 : -1);
                            revertedPlayerStats[statSource.attachedTrackingStat] = Math.max(
                                0,
                                (currentPlayerStats[statSource.attachedTrackingStat] || 0) - trackingDelta
                            );
                        }

                        const updated = {
                            ...prev,
                            [statSource.playerId]: revertedPlayerStats
                        };

                        let totalA = 0;
                        let totalB = 0;
                        const teamAObj = teams.find(t => t.id === teamAId);
                        const teamBObj = teams.find(t => t.id === teamBId);
                        if (teamAObj) teamAObj.players.forEach(p => { totalA += updated[p.id]?.pts || 0; });
                        if (teamBObj) teamBObj.players.forEach(p => { totalB += updated[p.id]?.pts || 0; });
                        setTeamAScore(totalA);
                        setTeamBScore(totalB);

                        return updated;
                    });

                    setGameLog(remainingGameLog);
                    setLoggedHistory(remainingHistory);
                    triggerPlayerFlash(statSource.playerId);
                    flashPlayerElements(statSource.playerId);
                    return;
                }

                const replayed = buildLiveStateFromEvents(liveGameSnapshot, remainingGameLog);

                if (!replayed) {
                    setGameLog(remainingGameLog);
                    setLoggedHistory(remainingHistory);
                    showToast('Removed log entry. Full state replay unavailable for this legacy session.', 'info');
                    return;
                }

                setGameLog(remainingGameLog);
                setLoggedHistory(remainingHistory);
                setLiveStats(replayed.liveStats);
                setTeamAScore(replayed.teamAScore);
                setTeamBScore(replayed.teamBScore);
                setCurrentQuarter(replayed.currentQuarter || 1);
                setTeamALineup(replayed.teamALineup);
                setTeamABench(replayed.teamABench);
                setTeamBLineup(replayed.teamBLineup);
                setTeamBBench(replayed.teamBBench);
                setPlayedPlayers(replayed.playedPlayers);
            };

            const handleAdvanceQuarter = () => {
                if (!canOperateLive) return;
                if (!isGameLive) return;

                if (currentQuarter >= 4) {
                    setAwaitingOvertimeDecision(true);
                    if (teamAScore === teamBScore) {
                        showToast(`${getPeriodLabel(currentQuarter)} complete. Scores are tied, start overtime to continue.`, 'info');
                    } else {
                        showToast(`${getPeriodLabel(currentQuarter)} complete. Overtime unavailable because game is not tied.`, 'info');
                    }
                    return;
                }

                const nextQuarter = currentQuarter + 1;
                const quarterLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                setAwaitingPeriodStart(true);
                setAwaitingOvertimeDecision(false);
                setGameLog(prev => [{
                    id: quarterLogId,
                    time: getWallClockTime(),
                    text: `End ${getPeriodLabel(currentQuarter)}`,
                    kind: 'meta',
                    metaType: 'quarterEnd',
                    quarter: currentQuarter
                }, ...prev.slice(0, 300)]);
                showToast(`${getPeriodLabel(currentQuarter)} ended. Press Start ${getPeriodLabel(nextQuarter)} to continue.`, 'info');
            };

            const handleStartNextQuarter = () => {
                if (!canOperateLive) return;
                if (!isGameLive) return;
                if (!isAwaitingPeriodStart) return;

                const nextQuarter = nextPeriodToStart;
                const nextLabel = getPeriodLabel(nextQuarter);
                const quarterLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                setCurrentQuarter(nextQuarter);
                setAwaitingPeriodStart(false);
                setAwaitingOvertimeDecision(false);
                setGameLog(prev => [{
                    id: quarterLogId,
                    time: getWallClockTime(),
                    text: `Start ${nextLabel}`,
                    kind: 'meta',
                    metaType: 'quarterStart',
                    quarter: nextQuarter
                }, ...prev.slice(0, 300)]);
                showToast(`${nextLabel} started.`, 'success');
            };

            const handleStartOvertime = () => {
                if (!canOperateLive) return;
                if (!isGameLive) return;
                if (currentQuarter < 4) return;
                if (teamAScore !== teamBScore) {
                    showToast(`Overtime is only available when scores are tied after ${getPeriodLabel(currentQuarter)}.`, 'info');
                    return;
                }

                const nextQuarter = currentQuarter + 1;
                const nextLabel = getPeriodLabel(nextQuarter);
                const quarterLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                setCurrentQuarter(nextQuarter);
                setAwaitingPeriodStart(false);
                setAwaitingOvertimeDecision(false);
                setGameLog(prev => [{
                    id: quarterLogId,
                    time: getWallClockTime(),
                    text: `Start ${nextLabel}`,
                    kind: 'meta',
                    metaType: 'quarterStart',
                    quarter: nextQuarter
                }, ...prev.slice(0, 300)]);
                showToast(`Overtime started: ${nextLabel}.`, 'success');
            };

            const triggerSubModal = (playerId, isTeamA) => {
                if (!canOperateLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'manage substitutions for this team')) return;
                const playerObj = teams.flatMap(t => t.players).find(p => p.id === playerId);
                if (!playerObj) return;
                setSubTargetPlayer({ id: playerId, name: playerObj.name, number: playerObj.number, team: isTeamA ? 'A' : 'B' });
                setShowSubstitutionModal(true);
            };

            const executeSubstitution = (outId, inId, isTeamA) => {
                if (!canOperateLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'manage substitutions for this team')) return;
                const teamObj = isTeamA ? teams.find(t => t.id === teamAId) : teams.find(t => t.id === teamBId);
                const outPlayer = teamObj?.players.find(p => p.id === outId);
                const inPlayer = teamObj?.players.find(p => p.id === inId);

                if ((liveStats[inId]?.pf || 0) >= 5) {
                    const fouledOutPlayer = teamObj?.players.find(p => p.id === inId);
                    if (fouledOutPlayer) {
                        showToast(`${fouledOutPlayer.name} cannot return with 5 fouls.`, 'info');
                    }
                    return;
                }

                const currentLineup = isTeamA ? teamALineup : teamBLineup;
                const currentBench = isTeamA ? teamABench : teamBBench;
                if (!currentLineup.includes(outId)) {
                    showToast('Substitution failed: player to sub out is not on court.', 'error');
                    return;
                }

                let nextLineup = currentLineup.map((id) => id === outId ? inId : id);
                let nextBench = currentBench.map((id) => id === inId ? outId : id);
                if (!nextBench.includes(outId)) {
                    nextBench = [...nextBench, outId];
                }
                nextBench = nextBench.filter((id) => id !== inId);

                const sanitized = sanitizeTeamRotation(isTeamA ? teamAId : teamBId, nextLineup, nextBench, { fillToFive: true });

                if (isTeamA) {
                    setTeamALineup(sanitized.lineup);
                    setTeamABench(sanitized.bench);
                } else {
                    setTeamBLineup(sanitized.lineup);
                    setTeamBBench(sanitized.bench);
                }
                
                if (!playedPlayers.includes(inId)) {
                    setPlayedPlayers(prev => [...prev, inId]);
                }
                if (dnpPlayers.includes(inId)) {
                    setDnpPlayers(prev => prev.filter(id => id !== inId));
                }

                triggerPlayerFlash(outId);
                triggerPlayerFlash(inId);
                triggerSubGlow(outId);
                triggerSubGlow(inId);
                flashPlayerElements(outId);
                flashPlayerElements(inId);

                const subLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const subRevision = getLineupRevisionFromEventId(subLogId);
                if (subRevision > 0) {
                    setLineupRevision((prev) => {
                        const next = Math.max(prev, subRevision);
                        lineupRevisionRef.current = next;
                        return next;
                    });
                }
                triggerSubLogGlow(subLogId);
                setGameLog(prev => [{
                    id: subLogId,
                    time: getWallClockTime(),
                    text: `SUB: ${outPlayer ? `${outPlayer.name} (#${outPlayer.number})` : outId} -> ${inPlayer ? `${inPlayer.name} (#${inPlayer.number})` : inId}`,
                    kind: 'sub',
                    quarter: currentQuarter,
                    outId,
                    inId,
                    isTeamA
                }, ...prev.slice(0, 300)]);

                setShowSubstitutionModal(false);
                setSubTargetPlayer(null);
            };

            const handleClearOnCourtPlayers = (isTeamA) => {
                if (!canOperateLive) return;
                if (!isGameLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'clear on-court players for this team')) return;

                const teamId = isTeamA ? teamAId : teamBId;
                const currentLineup = isTeamA ? teamALineup : teamBLineup;
                const currentBench = isTeamA ? teamABench : teamBBench;
                if (!teamId || currentLineup.length === 0) return;

                const sanitized = sanitizeTeamRotation(teamId, [], [...currentBench, ...currentLineup], { fillToFive: false });
                if (isTeamA) {
                    setTeamALineup(sanitized.lineup);
                    setTeamABench(sanitized.bench);
                    setShowHomeBenchAdder(true);
                } else {
                    setTeamBLineup(sanitized.lineup);
                    setTeamBBench(sanitized.bench);
                    setShowAwayBenchAdder(true);
                }

                const clearLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const clearEvent = {
                    id: clearLogId,
                    time: getWallClockTime(),
                    text: `Cleared on-court players (${isTeamA ? 'HOME' : 'AWAY'})`,
                    kind: 'meta',
                    metaType: 'onCourtClear',
                    quarter: currentQuarter,
                    isTeamA
                };
                const clearRevision = getLineupRevisionFromEventId(clearLogId);
                if (clearRevision > 0) {
                    setLineupRevision((prev) => {
                        const next = Math.max(prev, clearRevision);
                        lineupRevisionRef.current = next;
                        return next;
                    });
                }
                processedGameLogIdsRef.current.add(clearEvent.id);
                enqueueLiveEvent(clearEvent);
                setGameLog((prev) => [clearEvent, ...prev.slice(0, 300)]);

                showToast(`On-court cleared for ${isTeamA ? 'home' : 'away'} team.`, 'info');
            };

            const handleToggleBenchAdder = (isTeamA) => {
                if (!canOperateLive) return;
                const lineup = isTeamA ? teamALineup : teamBLineup;
                if (lineup.length >= 5) {
                    showToast('On-court already has 5 players.', 'info');
                    return;
                }
                if (isTeamA) {
                    setShowHomeBenchAdder((prev) => !prev);
                } else {
                    setShowAwayBenchAdder((prev) => !prev);
                }
            };

            const handleOpenAddFromBenchModal = (isTeamA) => {
                if (!canOperateLive) return;
                if (!isGameLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'add bench players for this team')) return;

                const teamId = isTeamA ? teamAId : teamBId;
                const teamObj = teams.find((t) => t.id === teamId);
                const lineup = isTeamA ? teamALineup : teamBLineup;
                const bench = isTeamA ? teamABench : teamBBench;
                const rosterIds = (teamObj?.players || []).map((p) => p.id);
                const fallbackCandidates = rosterIds.filter((id) => !lineup.includes(id));
                const addCandidates = bench.length > 0 ? bench : fallbackCandidates;
                if (lineup.length >= 5) {
                    showToast('On-court already has 5 players.', 'info');
                    return;
                }
                if (!addCandidates.length) {
                    showToast('No bench players available to add.', 'info');
                    return;
                }

                setAddFromBenchTeam(isTeamA ? 'A' : 'B');
                setAddFromBenchSelection([]);
                setShowAddFromBenchModal(true);
            };

            const handleAddOnCourtPlayer = (playerId, isTeamA) => {
                if (!canOperateLive) return;
                if (!isGameLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'add players for this team')) return;

                const teamId = isTeamA ? teamAId : teamBId;
                const teamObj = teams.find((t) => t.id === teamId);
                const playerObj = teamObj?.players.find((p) => p.id === playerId);
                const currentLineup = isTeamA ? teamALineup : teamBLineup;
                const currentBench = isTeamA ? teamABench : teamBBench;
                if (!teamId || !playerObj) return;

                if (currentLineup.includes(playerId)) return;

                if (currentLineup.length >= 5) {
                    showToast('On-court limit reached (5 players).', 'info');
                    return;
                }

                if ((liveStats[playerId]?.pf || 0) >= 5) {
                    showToast(`${playerObj.name} cannot return with 5 fouls.`, 'info');
                    return;
                }

                const sanitized = sanitizeTeamRotation(
                    teamId,
                    [...currentLineup, playerId],
                    currentBench.filter((id) => id !== playerId),
                    { fillToFive: false }
                );

                if (isTeamA) {
                    setTeamALineup(sanitized.lineup);
                    setTeamABench(sanitized.bench);
                    if (sanitized.lineup.length >= 5) {
                        setShowHomeBenchAdder(false);
                    }
                } else {
                    setTeamBLineup(sanitized.lineup);
                    setTeamBBench(sanitized.bench);
                    if (sanitized.lineup.length >= 5) {
                        setShowAwayBenchAdder(false);
                    }
                }

                if (!playedPlayers.includes(playerId)) {
                    setPlayedPlayers((prev) => [...prev, playerId]);
                }
                if (dnpPlayers.includes(playerId)) {
                    setDnpPlayers((prev) => prev.filter((id) => id !== playerId));
                }

                triggerPlayerFlash(playerId);
                flashPlayerElements(playerId);

                const addLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const addEvent = {
                    id: addLogId,
                    time: getWallClockTime(),
                    text: `Added on-court: ${playerObj.name} (#${playerObj.number})`,
                    kind: 'meta',
                    metaType: 'onCourtAdd',
                    quarter: currentQuarter,
                    isTeamA,
                    playerId
                };
                const addRevision = getLineupRevisionFromEventId(addLogId);
                if (addRevision > 0) {
                    setLineupRevision((prev) => {
                        const next = Math.max(prev, addRevision);
                        lineupRevisionRef.current = next;
                        return next;
                    });
                }
                processedGameLogIdsRef.current.add(addEvent.id);
                enqueueLiveEvent(addEvent);
                setGameLog((prev) => [addEvent, ...prev.slice(0, 300)]);

                showToast(`${playerObj.name} added on-court.`, 'success');
            };

            const handleAddMultipleOnCourtPlayers = (playerIds, isTeamA) => {
                if (!canOperateLive) return;
                if (!isGameLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'add players for this team')) return;

                const teamId = isTeamA ? teamAId : teamBId;
                const teamObj = teams.find((t) => t.id === teamId);
                const currentLineup = isTeamA ? teamALineup : teamBLineup;
                const currentBench = isTeamA ? teamABench : teamBBench;
                if (!teamId || !teamObj) return;

                const availableSlots = Math.max(0, 5 - currentLineup.length);
                if (availableSlots <= 0) {
                    showToast('On-court already has 5 players.', 'info');
                    return;
                }

                const uniqueRequested = Array.from(new Set(playerIds || []));
                const validCandidates = uniqueRequested.filter((playerId) => {
                    if (currentLineup.includes(playerId)) return false;
                    const playerObj = teamObj.players.find((p) => p.id === playerId);
                    if (!playerObj) return false;
                    return (liveStats[playerId]?.pf || 0) < 5;
                });

                const selectedToAdd = validCandidates.slice(0, availableSlots);
                if (selectedToAdd.length === 0) {
                    showToast('No eligible players selected to add.', 'info');
                    return;
                }

                const sanitized = sanitizeTeamRotation(
                    teamId,
                    [...currentLineup, ...selectedToAdd],
                    currentBench.filter((id) => !selectedToAdd.includes(id)),
                    { fillToFive: false }
                );

                if (isTeamA) {
                    setTeamALineup(sanitized.lineup);
                    setTeamABench(sanitized.bench);
                    if (sanitized.lineup.length >= 5) {
                        setShowHomeBenchAdder(false);
                    }
                } else {
                    setTeamBLineup(sanitized.lineup);
                    setTeamBBench(sanitized.bench);
                    if (sanitized.lineup.length >= 5) {
                        setShowAwayBenchAdder(false);
                    }
                }

                setPlayedPlayers((prev) => {
                    const next = new Set(prev);
                    selectedToAdd.forEach((id) => next.add(id));
                    return Array.from(next);
                });
                setDnpPlayers((prev) => prev.filter((id) => !selectedToAdd.includes(id)));

                selectedToAdd.forEach((playerId) => {
                    triggerPlayerFlash(playerId);
                    flashPlayerElements(playerId);
                });

                const addLogs = selectedToAdd.map((playerId) => {
                    const playerObj = teamObj.players.find((p) => p.id === playerId);
                    return {
                        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        time: getWallClockTime(),
                        text: `Added on-court: ${playerObj ? `${playerObj.name} (#${playerObj.number})` : playerId}`,
                        kind: 'meta',
                        metaType: 'onCourtAdd',
                        quarter: currentQuarter,
                        isTeamA,
                        playerId
                    };
                });

                addLogs.forEach((event) => {
                    processedGameLogIdsRef.current.add(event.id);
                    enqueueLiveEvent(event);
                });
                const batchMaxRevision = addLogs.reduce((maxRevision, event) => {
                    const rev = getLineupRevisionFromEventId(event.id);
                    return rev > maxRevision ? rev : maxRevision;
                }, 0);
                if (batchMaxRevision > 0) {
                    setLineupRevision((prev) => {
                        const next = Math.max(prev, batchMaxRevision);
                        lineupRevisionRef.current = next;
                        return next;
                    });
                }
                setGameLog((prev) => [...addLogs, ...prev].slice(0, 300));

                setAddFromBenchSelection([]);
                setShowAddFromBenchModal(false);
                setAddFromBenchTeam(null);
                showToast(`${selectedToAdd.length} player${selectedToAdd.length > 1 ? 's' : ''} added on-court.`, 'success');
            };

            const handleEndGame = async () => {
                if (!canOperateLive) return;
                if (!teamAId || !teamBId) return;

                const teamAObj = teams.find(t => t.id === teamAId);
                const teamBObj = teams.find(t => t.id === teamBId);
                if (!teamAObj || !teamBObj) return;

                const gameId = `game_${Date.now()}`;
                const gameDate = `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

                const participantStats = {};

                const updatedTeams = teams.map(team => {
                    if (team.id !== teamAId && team.id !== teamBId) return team;

                    const updatedPlayers = team.players.map(player => {
                        const statsLive = liveStats[player.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                        const hasStatLine = Object.values(statsLive).some(val => Number(val || 0) > 0);
                        const didParticipate = !dnpPlayers.includes(player.id) && (playedPlayers.includes(player.id) || hasStatLine);

                        if (!didParticipate) return player;

                        participantStats[player.id] = { ...statsLive };

                        return {
                            ...player,
                            gamesPlayed: (player.gamesPlayed || 0) + 1,
                            totalStats: {
                                pts: (player.totalStats.pts || 0) + (statsLive.pts || 0),
                                ast: (player.totalStats.ast || 0) + (statsLive.ast || 0),
                                reb: (player.totalStats.reb || 0) + (statsLive.reb || 0),
                                stl: (player.totalStats.stl || 0) + (statsLive.stl || 0),
                                blk: (player.totalStats.blk || 0) + (statsLive.blk || 0),
                                to: (player.totalStats.to || 0) + (statsLive.to || 0),
                                pf: (player.totalStats.pf || 0) + (statsLive.pf || 0),
                                fg2m: (player.totalStats.fg2m || 0) + (statsLive.fg2m || 0),
                                fg3m: (player.totalStats.fg3m || 0) + (statsLive.fg3m || 0),
                                fg2m_miss: (player.totalStats.fg2m_miss || 0) + (statsLive.fg2m_miss || 0),
                                fg3m_miss: (player.totalStats.fg3m_miss || 0) + (statsLive.fg3m_miss || 0),
                                ftm: (player.totalStats.ftm || 0) + (statsLive.ftm || 0),
                                ft_miss: (player.totalStats.ft_miss || 0) + (statsLive.ft_miss || 0)
                            }
                        };
                    });

                    return { ...team, players: updatedPlayers };
                });

                const newGame = {
                    id: gameId,
                    date: gameDate,
                    teamAId,
                    teamBId,
                    teamAName: teamAObj.name,
                    teamBName: teamBObj.name,
                    teamAScore,
                    teamBScore,
                    playerStats: participantStats,
                    dnpPlayers: [...dnpPlayers],
                    gameLog: [...gameLog]
                };

                await saveNewGameState(newGame, updatedTeams);

                setIsGameLive(false);
                setTeamAId("");
                setTeamBId("");
                setTeamAScore(0);
                setTeamBScore(0);
                setCurrentQuarter(1);
                setAwaitingOvertimeDecision(false);
                setAwaitingPeriodStart(false);
                setTeamALineup([]);
                setTeamABench([]);
                setTeamBLineup([]);
                setTeamBBench([]);
                setLiveStats({});
                setLiveGameSnapshot(null);
                setGameLog([]);
                setLoggedHistory([]);
                setPlayedPlayers([]);
                setDnpPlayers([]);
                setLineupRevision(0);
                lineupRevisionRef.current = 0;

                setActiveTab('history');
                setSelectedHistoryGameId(newGame.id);
                showToast("Live statistics committed to system database successfully!", "success");
            };

            const openEndGameConfirm = () => {
                setConfirmDialog({
                    title: 'End Match?',
                    text: 'Lock boxscores permanently.',
                    onConfirm: () => {
                        handleEndGame();
                        setConfirmDialog(null);
                    }
                });
            };

            const handlePeriodAction = () => {
                if (!canOperateLive) return;
                if (!isGameLive) return;

                if (!hasMatchStarted) {
                    const startLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    setGameLog((prev) => [{
                        id: startLogId,
                        time: getWallClockTime(),
                        text: 'Start Match',
                        kind: 'meta',
                        metaType: 'matchStart',
                        quarter: 1
                    }, ...prev.slice(0, 300)]);
                    setAwaitingPeriodStart(true);
                    setAwaitingOvertimeDecision(false);
                    showToast('Match started. Press Start Q1 to begin period play.', 'success');
                    return;
                }

                if (timeoutIsActive) {
                    const resumeLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    setGameLog((prev) => [{
                        id: resumeLogId,
                        time: getWallClockTime(),
                        text: 'Resume Play',
                        kind: 'meta',
                        metaType: 'timeoutResume',
                        quarter: currentQuarter
                    }, ...prev.slice(0, 300)]);
                    showToast('Play resumed.', 'success');
                    return;
                }

                if (currentQuarter >= 4 && awaitingOvertimeDecision) {
                    if (isTieGame) {
                        handleStartOvertime();
                    } else {
                        openEndGameConfirm();
                    }
                    return;
                }

                if (isAwaitingPeriodStart) {
                    handleStartNextQuarter();
                    return;
                }

                handleAdvanceQuarter();
            };

            const handleLogTimeout = (isTeamA) => {
                if (!canOperateLive) return;
                if (!isGameLive) return;
                if (!ensureTeamOperationAccess(isTeamA, 'call timeout for this team')) return;
                if (!hasMatchStarted) {
                    showToast('Press Start Match before calling timeout.', 'info');
                    return;
                }
                if (isAwaitingPeriodStart) {
                    showToast(`Press Start ${nextPeriodStartLabel} before calling timeout.`, 'info');
                    return;
                }
                if (timeoutIsActive) {
                    showToast('Timeout already active. Press Resume Play to continue.', 'info');
                    return;
                }

                const usage = computeTimeoutUsage(getCurrentGameLogSegment(gameLog), currentQuarter);
                const limit = currentQuarter > 4 ? 1 : 5;
                const used = isTeamA
                    ? (currentQuarter > 4 ? usage.teamA.currentOvertime : usage.teamA.regulation)
                    : (currentQuarter > 4 ? usage.teamB.currentOvertime : usage.teamB.regulation);

                if (used >= limit) {
                    const teamLabel = isTeamA ? 'Home' : 'Away';
                    const scopeLabel = currentQuarter > 4 ? getPeriodLabel(currentQuarter) : 'regulation';
                    showToast(`${teamLabel} timeout limit reached for ${scopeLabel}.`, 'info');
                    return;
                }

                const teamObj = teams.find((t) => t.id === (isTeamA ? teamAId : teamBId));
                const timeoutLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                const teamName = teamObj?.name || (isTeamA ? 'HOME' : 'AWAY');

                setGameLog((prev) => [{
                    id: timeoutLogId,
                    time: getWallClockTime(),
                    text: `TIMEOUT: ${teamName}`,
                    kind: 'meta',
                    metaType: 'timeout',
                    quarter: currentQuarter,
                    isTeamA
                }, ...prev.slice(0, 300)]);

                showToast(`Timeout called: ${teamName}`, 'info');
            };

            const handleSaveHistoricEdit = async (e) => {
                e.preventDefault();
                if (!editingGame) return;

                let newTeamAScore = 0;
                let newTeamBScore = 0;
                const teamAObj = teams.find(t => t.id === editingGame.teamAId);
                const teamBObj = teams.find(t => t.id === editingGame.teamBId);

                if (teamAObj) {
                    teamAObj.players.forEach(p => {
                        newTeamAScore += parseInt(editStatsTemp[p.id]?.pts || 0, 10);
                    });
                }
                if (teamBObj) {
                    teamBObj.players.forEach(p => {
                        newTeamBScore += parseInt(editStatsTemp[p.id]?.pts || 0, 10);
                    });
                }

                const updatedTeams = teams.map(t => {
                    if (t.id !== editingGame.teamAId && t.id !== editingGame.teamBId) return t;

                    const updatedPlayers = t.players.map(p => {
                        const oldPStats = editingGame.playerStats[p.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                        const newPStats = editStatsTemp[p.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };

                        const delta = (field) => parseInt(newPStats[field] || 0, 10) - parseInt(oldPStats[field] || 0, 10);

                        return {
                            ...p,
                            totalStats: {
                                pts: Math.max(0, (p.totalStats.pts || 0) + delta('pts')),
                                ast: Math.max(0, (p.totalStats.ast || 0) + delta('ast')),
                                reb: Math.max(0, (p.totalStats.reb || 0) + delta('reb')),
                                stl: Math.max(0, (p.totalStats.stl || 0) + delta('stl')),
                                blk: Math.max(0, (p.totalStats.blk || 0) + delta('blk')),
                                to: Math.max(0, (p.totalStats.to || 0) + delta('to')),
                                pf: Math.max(0, (p.totalStats.pf || 0) + delta('pf')),
                                fg2m: Math.max(0, (p.totalStats.fg2m || 0) + delta('fg2m')),
                                fg3m: Math.max(0, (p.totalStats.fg3m || 0) + delta('fg3m')),
                                fg2m_miss: Math.max(0, (p.totalStats.fg2m_miss || 0) + delta('fg2m_miss')),
                                fg3m_miss: Math.max(0, (p.totalStats.fg3m_miss || 0) + delta('fg3m_miss')),
                                ftm: Math.max(0, (p.totalStats.ftm || 0) + delta('ftm')),
                                ft_miss: Math.max(0, (p.totalStats.ft_miss || 0) + delta('ft_miss'))
                            }
                        };
                    });
                    return { ...t, players: updatedPlayers };
                });

                const updatedGames = games.map(g => {
                    if (g.id === editingGame.id) {
                        return {
                            ...g,
                            teamAScore: newTeamAScore,
                            teamBScore: newTeamBScore,
                            playerStats: editStatsTemp
                        };
                    }
                    return g;
                });

                setGames(updatedGames);
                setTeams(updatedTeams);
                await saveFullState(updatedTeams, updatedGames);

                setEditingGame(null);
                setExpandedEditPlayerId(null);
                showToast("Box score updated and career averages recalculated!", "success");
            };

            const handleResetMatch = () => {
                setConfirmDialog({
                    title: "Clear & Restart Match?",
                    text: "This will permanently wipe all current scores, timeline logs, and active stats back to 0. Competing teams will remain selected.",
                    onConfirm: async () => {
                        const teamAObj = teams.find(t => t.id === teamAId);
                        const teamBObj = teams.find(t => t.id === teamBId);
                        if (!teamAObj || !teamBObj) return;

                        const startersA = teamAObj.players.slice(0, 5).map(p => p.id);
                        const benchA = teamAObj.players.slice(5).map(p => p.id);
                        const startersB = teamBObj.players.slice(0, 5).map(p => p.id);
                        const benchB = teamBObj.players.slice(5).map(p => p.id);

                        const initializedStats = {};
                        teamAObj.players.forEach(p => { initializedStats[p.id] = { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }; });
                        teamBObj.players.forEach(p => { initializedStats[p.id] = { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }; });
                        // Reset event/sync queue state so old stats cannot replay after restart.
                        pendingLiveEventsRef.current = [];
                        persistPendingLiveEvents();
                        lastLiveSeqRef.current = 0;
                        try {
                            localStorage.setItem(LIVE_EVENTS_LAST_SEQ_KEY, '0');
                        } catch (e) {}
                        processedGameLogIdsRef.current = new Set();
                        remoteEventIdsRef.current = new Set();
                        liveEventQueueReadyRef.current = false;
                        lastRemoteGameLogIdsRef.current = new Set();
                        lastObservedLogIdRef.current = null;

                        try {
                            await apiRequest('/api/live-events/reset', {
                                method: 'POST',
                                body: JSON.stringify({ sourceClientId: syncClientIdRef.current })
                            });
                        } catch (error) {
                            console.error('Failed to clear live event history during match reset.', error);
                        }

                        setTeamALineup(startersA);
                        setTeamABench(benchA);
                        setTeamBLineup(startersB);
                        setLiveGameSnapshot({
                            teamAId,
                            teamBId,
                            teamAScore: 0,
                            teamBScore: 0,
                            currentQuarter: 1,
                            teamALineup: startersA,
                            teamABench: benchA,
                            teamBLineup: startersB,
                            teamBBench: benchB,
                            liveStats: initializedStats,
                            playedPlayers: []
                        });
                        setTeamBBench(benchB);
                        setPlayedPlayers([]);
                        setDnpPlayers([]);
                        setShowHomeBenchAdder(false);
                        setShowAwayBenchAdder(false);
                        setShowSubstitutionModal(false);
                        setSubTargetPlayer(null);
                        setShowAddFromBenchModal(false);
                        setAddFromBenchTeam(null);
                        setAddFromBenchSelection([]);
                        setFoulAlert(null);

                        setLiveStats(initializedStats);
                        setTeamAScore(0);
                        setTeamBScore(0);
                        setCurrentQuarter(1);
                        setAwaitingOvertimeDecision(false);
                        setAwaitingPeriodStart(false);
                        setActiveAction(null);
                        setCorrectionMode(false);
                        setLoggedHistory([]);
                        const resetLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        const resetEvent = {
                            id: resetLogId,
                            time: getWallClockTime(),
                            text: 'Game reset to fresh start',
                            kind: 'meta',
                            metaType: 'hardReset',
                            quarter: 1
                        };
                        processedGameLogIdsRef.current.add(resetEvent.id);
                        enqueueLiveEvent(resetEvent);
                        setGameLog([resetEvent]);
                        setLineupRevision(0);
                        lineupRevisionRef.current = 0;
                        setConfirmDialog(null);
                        showToast("Current game stats cleared! Ready to restart.", "info");
                    }
                });
            };

            const handleDeleteTeam = (teamId) => {
                setConfirmDialog({
                    title: "Delete Team?",
                    text: "Are you sure you want to delete this team? This will remove all its players and cannot be undone.",
                    onConfirm: async () => {
                        const updatedTeams = teams.filter(t => t.id !== teamId);
                        setTeams(updatedTeams);
                        await apiRequest(`/api/teams/${teamId}`, { method: 'DELETE' });
                        setConfirmDialog(null);
                        showToast("Team deleted successfully.", "success");
                    }
                });
            };

            const handleDeletePlayer = (teamId, playerId) => {
                setConfirmDialog({
                    title: "Delete Player?",
                    text: "Are you sure you want to remove this player from the team roster?",
                    onConfirm: async () => {
                        const updatedTeams = teams.map(t => {
                            if (t.id === teamId) {
                                return {
                                    ...t,
                                    players: t.players.filter(p => p.id !== playerId)
                                };
                            }
                            return t;
                        });

                        await saveTeamState(updatedTeams);
                        setConfirmDialog(null);
                        showToast("Player removed from roster.", "success");
                    }
                });
            };

            const handleDeleteGame = (gameId) => {
                setConfirmDialog({
                    title: "Delete Game Record?",
                    text: "This will permanently delete this game record and subtract its stats from all players' career averages. This cannot be undone.",
                    onConfirm: async () => {
                        const gameToDelete = games.find(g => g.id === gameId);
                        if (!gameToDelete) return;

                        // Subtract game stats from players to keep career records continuous and accurate
                        const updatedTeams = teams.map(team => {
                            if (team.id !== gameToDelete.teamAId && team.id !== gameToDelete.teamBId) return team;

                            const updatedPlayers = team.players.map(player => {
                                const pstats = gameToDelete.playerStats[player.id];
                                if (!pstats) return player; // Player didn't participate in this specific game

                                return {
                                    ...player,
                                    gamesPlayed: Math.max(0, (player.gamesPlayed || 0) - 1),
                                    totalStats: {
                                        pts: Math.max(0, (player.totalStats.pts || 0) - (pstats.pts || 0)),
                                        ast: Math.max(0, (player.totalStats.ast || 0) - (pstats.ast || 0)),
                                        reb: Math.max(0, (player.totalStats.reb || 0) - (pstats.reb || 0)),
                                        stl: Math.max(0, (player.totalStats.stl || 0) - (pstats.stl || 0)),
                                        blk: Math.max(0, (player.totalStats.blk || 0) - (pstats.blk || 0)),
                                        to: Math.max(0, (player.totalStats.to || 0) - (pstats.to || 0)),
                                        pf: Math.max(0, (player.totalStats.pf || 0) - (pstats.pf || 0)),
                                        fg2m: Math.max(0, (player.totalStats.fg2m || 0) - (pstats.fg2m || 0)),
                                        fg3m: Math.max(0, (player.totalStats.fg3m || 0) - (pstats.fg3m || 0)),
                                        fg2m_miss: Math.max(0, (player.totalStats.fg2m_miss || 0) - (pstats.fg2m_miss || 0)),
                                        fg3m_miss: Math.max(0, (player.totalStats.fg3m_miss || 0) - (pstats.fg3m_miss || 0)),
                                        ftm: Math.max(0, (player.totalStats.ftm || 0) - (pstats.ftm || 0)),
                                        ft_miss: Math.max(0, (player.totalStats.ft_miss || 0) - (pstats.ft_miss || 0))
                                    }
                                };
                            });

                            return { ...team, players: updatedPlayers };
                        });

                        const updatedGames = games.filter(g => g.id !== gameId);

                        setGames(updatedGames);
                        setTeams(updatedTeams);
                        await saveFullState(updatedTeams, updatedGames);

                        setConfirmDialog(null);
                        showToast("Game record deleted and career averages recalculated!", "success");
                    }
                });
            };

            const handleCreateTeam = (e) => {
                e.preventDefault();
                if (!newTeamName.trim()) return;
                const newTeam = { id: `team_${Date.now()}`, name: newTeamName.trim(), color: newTeamColor, players: [] };
                saveTeamState([...teams, newTeam]);
                setNewTeamName("");
                setShowNewTeamModal(false);
            };

            const handleCreatePlayer = (e) => {
                e.preventDefault();
                if (!canEditPlayers) return;
                if (!newPlayerName.trim() || !newPlayerNumber.trim() || !selectedTeamIdForPlayer) return;
                const newPlayer = {
                    id: `player_${Date.now()}`,
                    name: newPlayerName.trim(),
                    number: newPlayerNumber.trim(),
                    positions: [],
                    pictureUrl: '',
                    birthday: '',
                    email: '',
                    social: '',
                    contact: '',
                    writeup: '',
                    gamesPlayed: 0,
                    totalStats: { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 }
                };
                const updatedTeams = teams.map(t => t.id === selectedTeamIdForPlayer ? { ...t, players: [...t.players, newPlayer] } : t);
                saveTeamState(updatedTeams);
                setNewPlayerName("");
                setNewPlayerNumber("");
                setShowNewPlayerModal(false);
            };

            const handleStartAdvancedEditPlayer = (teamId, player) => {
                if (!canEditPlayers) return;
                setAdvancedEditingPlayer({
                    teamId,
                    playerId: player.id,
                    name: player.name,
                    number: player.number,
                    positions: Array.isArray(player.positions) ? player.positions.filter((pos) => PLAYER_POSITIONS.includes(pos)) : [],
                    pictureUrl: player.pictureUrl || '',
                    birthday: player.birthday || '',
                    email: player.email || '',
                    social: player.social || '',
                    contact: player.contact || '',
                    writeup: player.writeup || ''
                });
            };

            const handleSaveAdvancedPlayerProfile = async (e) => {
                e.preventDefault();
                if (!advancedEditingPlayer) return;

                const updatedTeams = teams.map(team => {
                    if (team.id !== advancedEditingPlayer.teamId) return team;
                    return {
                        ...team,
                        players: team.players.map(player => (
                            player.id === advancedEditingPlayer.playerId
                                ? {
                                    ...player,
                                    positions: Array.isArray(advancedEditingPlayer.positions)
                                        ? advancedEditingPlayer.positions.filter((pos) => PLAYER_POSITIONS.includes(pos))
                                        : [],
                                    pictureUrl: (advancedEditingPlayer.pictureUrl || '').trim(),
                                    birthday: (advancedEditingPlayer.birthday || '').trim(),
                                    email: (advancedEditingPlayer.email || '').trim(),
                                    social: (advancedEditingPlayer.social || '').trim(),
                                    contact: (advancedEditingPlayer.contact || '').trim(),
                                    writeup: (advancedEditingPlayer.writeup || '').trim()
                                }
                                : player
                        ))
                    };
                });

                await saveTeamState(updatedTeams);
                setAdvancedEditingPlayer(null);
                showToast('Advanced player profile updated.', 'success');
            };

            const handleStartEditPlayer = (teamId, player) => {
                if (!canEditPlayers) return;
                setEditingPlayer({
                    teamId,
                    playerId: player.id,
                    name: player.name,
                    number: player.number
                });
            };

            const handleCancelEditPlayer = () => {
                setEditingPlayer(null);
            };

            const handleSaveEditPlayer = async () => {
                if (!editingPlayer) return;

                const nextName = editingPlayer.name.trim();
                const nextNumber = String(editingPlayer.number).trim();
                if (!nextName || !nextNumber) {
                    showToast("Player name and number are required.", "error");
                    return;
                }

                const updatedTeams = teams.map(team => {
                    if (team.id !== editingPlayer.teamId) return team;
                    return {
                        ...team,
                        players: team.players.map(player => (
                            player.id === editingPlayer.playerId
                                ? { ...player, name: nextName, number: nextNumber }
                                : player
                        ))
                    };
                });

                await saveTeamState(updatedTeams);
                setEditingPlayer(null);
                showToast("Player updated.", "success");
            };

            const computeShootingPercentages = (stats) => {
                const totalMade = (stats.fg2m || 0) + (stats.fg3m || 0);
                const totalAttempts = totalMade + (stats.fg2m_miss || 0) + (stats.fg3m_miss || 0);
                const total3PtAttempts = (stats.fg3m || 0) + (stats.fg3m_miss || 0);
                const ftAttempts = (stats.ftm || 0) + (stats.ft_miss || 0);
                return {
                    fgPct: totalAttempts === 0 ? "0%" : `${Math.round((totalMade / totalAttempts) * 100)}%`,
                    fg3Pct: total3PtAttempts === 0 ? "0%" : `${Math.round(((stats.fg3m || 0) / total3PtAttempts) * 100)}%`,
                    ftPct: ftAttempts === 0 ? "0%" : `${Math.round(((stats.ftm || 0) / ftAttempts) * 100)}%`,
                    ftm: stats.ftm || 0,
                    fta: ftAttempts
                };
            };

            const getAverages = (player) => {
                const gp = player.gamesPlayed || 0;
                const stats = player.totalStats || {};
                if (gp === 0) return { pts: '0.0', ast: '0.0', reb: '0.0', stl: '0.0', blk: '0.0', to: '0.0', pf: '0.0', fgPct: '0%', fg3Pct: '0%', ftPct: '0%', spg: '0.0', bpg: '0.0' };
                const pctSummary = computeShootingPercentages(stats);
                return {
                    pts: ((stats.pts || 0) / gp).toFixed(1),
                    ast: ((stats.ast || 0) / gp).toFixed(1),
                    reb: ((stats.reb || 0) / gp).toFixed(1),
                    stl: ((stats.stl || 0) / gp).toFixed(1),
                    blk: ((stats.blk || 0) / gp).toFixed(1),
                    to: ((stats.to || 0) / gp).toFixed(1),
                    pf: ((stats.pf || 0) / gp).toFixed(1),
                    fgPct: pctSummary.fgPct,
                    fg3Pct: pctSummary.fg3Pct,
                    ftPct: pctSummary.ftPct,
                    spg: ((stats.stl || 0) / gp).toFixed(1),
                    bpg: ((stats.blk || 0) / gp).toFixed(1)
                };
            };

            const getGameRecencyValue = (game) => {
                const idValue = Number(String(game?.id || '').replace(/\D+/g, '')) || 0;
                if (idValue > 0) return idValue;
                const dateValue = Date.parse(game?.date || '');
                return Number.isFinite(dateValue) ? dateValue : 0;
            };

            const getPlayerLatestGameSummary = (teamId, playerId) => {
                if (!teamId || !playerId) return null;

                const latestGame = [...games]
                    .filter((g) => g.teamAId === teamId || g.teamBId === teamId)
                    .sort((a, b) => getGameRecencyValue(b) - getGameRecencyValue(a))[0];

                if (!latestGame) return null;

                const isHome = latestGame.teamAId === teamId;
                const opponentName = isHome ? latestGame.teamBName : latestGame.teamAName;
                const teamScore = isHome ? latestGame.teamAScore : latestGame.teamBScore;
                const opponentScore = isHome ? latestGame.teamBScore : latestGame.teamAScore;
                const explicitDnp = Array.isArray(latestGame.dnpPlayers) && latestGame.dnpPlayers.includes(playerId);
                const playerStats = latestGame.playerStats?.[playerId] || null;
                const didPlay = !!playerStats && !explicitDnp;

                return {
                    gameId: latestGame.id,
                    date: latestGame.date,
                    opponentName,
                    teamScore,
                    opponentScore,
                    didPlay,
                    explicitDnp,
                    stats: playerStats
                };
            };

            const getPlayerRecentGamesSummaries = (teamId, playerId, limit = 5) => {
                if (!teamId || !playerId) return [];

                return [...games]
                    .filter((g) => g.teamAId === teamId || g.teamBId === teamId)
                    .sort((a, b) => getGameRecencyValue(b) - getGameRecencyValue(a))
                    .slice(0, limit)
                    .map((game) => {
                        const isHome = game.teamAId === teamId;
                        const opponentName = isHome ? game.teamBName : game.teamAName;
                        const teamScore = isHome ? game.teamAScore : game.teamBScore;
                        const opponentScore = isHome ? game.teamBScore : game.teamAScore;
                        const explicitDnp = Array.isArray(game.dnpPlayers) && game.dnpPlayers.includes(playerId);
                        const playerStats = game.playerStats?.[playerId] || null;
                        const didPlay = !!playerStats && !explicitDnp;

                        return {
                            gameId: game.id,
                            date: game.date,
                            opponentName,
                            teamScore,
                            opponentScore,
                            didPlay,
                            explicitDnp,
                            stats: playerStats
                        };
                    });
            };

            const selectedRosterTeam = selectedRosterPlayer
                ? teams.find((team) => team.id === selectedRosterPlayer.teamId)
                : null;
            const selectedRosterAthlete = selectedRosterTeam
                ? selectedRosterTeam.players.find((player) => player.id === selectedRosterPlayer.playerId)
                : null;
            const selectedRosterAthleteAverages = selectedRosterAthlete ? getAverages(selectedRosterAthlete) : null;
            const selectedRosterAthleteRecentGames = selectedRosterPlayer
                ? getPlayerRecentGamesSummaries(selectedRosterPlayer.teamId, selectedRosterPlayer.playerId, 5)
                : null;

            const getLeaderMetric = (player, metricKey, mode) => {
                const stats = player?.totalStats || {};
                const avg = getAverages(player);
                const isPctMetric = metricKey === 'fgPct' || metricKey === 'fg3Pct';
                if (mode === 'perGame') {
                    return parseFloat(avg[metricKey] || 0);
                }
                if (isPctMetric) {
                    return parseFloat(avg[metricKey] || 0);
                }
                return Number(stats[metricKey] || 0);
            };

            const formatLeaderMetric = (player, metricKey, mode) => {
                const avg = getAverages(player);
                const stats = player?.totalStats || {};
                const isPctMetric = metricKey === 'fgPct' || metricKey === 'fg3Pct';
                if (mode === 'perGame') {
                    return isPctMetric ? (avg[metricKey] || '0%') : (avg[metricKey] || '0.0');
                }
                if (isPctMetric) {
                    return avg[metricKey] || '0%';
                }
                return String(Number(stats[metricKey] || 0));
            };

            const summarizeGameTeamStats = (team, game) => {
                const totals = {
                    pts: 0,
                    reb: 0,
                    ast: 0,
                    stl: 0,
                    blk: 0,
                    to: 0,
                    pf: 0,
                    fg2m: 0,
                    fg3m: 0,
                    fg2m_miss: 0,
                    fg3m_miss: 0,
                    ftm: 0,
                    ft_miss: 0
                };

                (team?.players || []).forEach(player => {
                    const pstats = game?.playerStats?.[player.id];
                    if (!pstats) return;
                    totals.pts += pstats.pts || 0;
                    totals.reb += pstats.reb || 0;
                    totals.ast += pstats.ast || 0;
                    totals.stl += pstats.stl || 0;
                    totals.blk += pstats.blk || 0;
                    totals.to += pstats.to || 0;
                    totals.pf += pstats.pf || 0;
                    totals.fg2m += pstats.fg2m || 0;
                    totals.fg3m += pstats.fg3m || 0;
                    totals.fg2m_miss += pstats.fg2m_miss || 0;
                    totals.fg3m_miss += pstats.fg3m_miss || 0;
                    totals.ftm += pstats.ftm || 0;
                    totals.ft_miss += pstats.ft_miss || 0;
                });

                const fgMade = totals.fg2m + totals.fg3m;
                const fgAtt = fgMade + totals.fg2m_miss + totals.fg3m_miss;
                const fg3Att = totals.fg3m + totals.fg3m_miss;
                const ftAtt = totals.ftm + totals.ft_miss;

                return {
                    ...totals,
                    fgPct: fgAtt === 0 ? '0%' : `${Math.round((fgMade / fgAtt) * 100)}%`,
                    fg3Pct: fg3Att === 0 ? '0%' : `${Math.round((totals.fg3m / fg3Att) * 100)}%`,
                    ftPct: ftAtt === 0 ? '0%' : `${Math.round((totals.ftm / ftAtt) * 100)}%`
                };
            };

            const getPlayerOfTheGame = (game, teamAObj, teamBObj) => {
                const computePerStyleScore = (stats = {}) => {
                    const fgMade = Number(stats.fg2m || 0) + Number(stats.fg3m || 0);
                    const fgAtt = fgMade + Number(stats.fg2m_miss || 0) + Number(stats.fg3m_miss || 0);
                    const ftMade = Number(stats.ftm || 0);
                    const ftAtt = ftMade + Number(stats.ft_miss || 0);
                    return (
                        Number(stats.pts || 0) +
                        (0.4 * fgMade) -
                        (0.7 * fgAtt) -
                        (0.4 * (ftAtt - ftMade)) +
                        (0.7 * Number(stats.reb || 0)) +
                        Number(stats.stl || 0) +
                        (0.7 * Number(stats.ast || 0)) +
                        (0.7 * Number(stats.blk || 0)) -
                        (0.4 * Number(stats.pf || 0)) -
                        Number(stats.to || 0)
                    );
                };

                const teamAScoreValue = Number(game?.teamAScore || 0);
                const teamBScoreValue = Number(game?.teamBScore || 0);
                const winnerTeamId = teamAScoreValue === teamBScoreValue
                    ? null
                    : (teamAScoreValue > teamBScoreValue ? game?.teamAId : game?.teamBId);

                const candidateTeams = winnerTeamId
                    ? [teamAObj, teamBObj].filter((team) => team?.id === winnerTeamId)
                    : [teamAObj, teamBObj].filter(Boolean);

                const candidates = candidateTeams
                    .filter(Boolean)
                    .flatMap(team => (team.players || []).map(player => {
                        const pstats = game?.playerStats?.[player.id];
                        if (!pstats) return null;

                        const perScore = computePerStyleScore(pstats);

                        return {
                            id: player.id,
                            name: player.name,
                            number: player.number,
                            pictureUrl: player.pictureUrl || '',
                            teamName: team.name,
                            teamColor: team.color,
                            stats: pstats,
                            perScore
                        };
                    }))
                    .filter(Boolean);

                if (candidates.length === 0) return null;
                return candidates.sort((a, b) => b.perScore - a.perScore || (b.stats.pts || 0) - (a.stats.pts || 0))[0];
            };

            const getDefaultHistoryDetailTab = (game) => {
                if (!game) return 'scoring';
                const teamAObj = teams.find((t) => t.id === game.teamAId);
                const teamBObj = teams.find((t) => t.id === game.teamBId);
                return getPlayerOfTheGame(game, teamAObj, teamBObj) ? 'potg' : 'scoring';
            };

            const openHistoryGame = (gameId) => {
                const targetGame = games.find((game) => game.id === gameId);
                setSelectedHistoryGameId(gameId);
                setHistoryDetailTab(getDefaultHistoryDetailTab(targetGame));
            };

            const getTopTeamPerformers = (team, game, limit = 3) => {
                if (!team || !game) return [];

                const computePerStyleScore = (stats = {}) => {
                    const fgMade = Number(stats.fg2m || 0) + Number(stats.fg3m || 0);
                    const fgAtt = fgMade + Number(stats.fg2m_miss || 0) + Number(stats.fg3m_miss || 0);
                    const ftMade = Number(stats.ftm || 0);
                    const ftAtt = ftMade + Number(stats.ft_miss || 0);
                    return (
                        Number(stats.pts || 0) +
                        (0.4 * fgMade) -
                        (0.7 * fgAtt) -
                        (0.4 * (ftAtt - ftMade)) +
                        (0.7 * Number(stats.reb || 0)) +
                        Number(stats.stl || 0) +
                        (0.7 * Number(stats.ast || 0)) +
                        (0.7 * Number(stats.blk || 0)) -
                        (0.4 * Number(stats.pf || 0)) -
                        Number(stats.to || 0)
                    );
                };

                return (team.players || [])
                    .map((player) => {
                        const stats = game?.playerStats?.[player.id];
                        if (!stats) return null;
                        return {
                            id: player.id,
                            name: player.name,
                            number: player.number,
                            stats,
                            perScore: computePerStyleScore(stats)
                        };
                    })
                    .filter(Boolean)
                    .filter((entry) => Number(entry.perScore || 0) > 0)
                    .sort((a, b) => Number(b.perScore || 0) - Number(a.perScore || 0) || Number(b.stats?.pts || 0) - Number(a.stats?.pts || 0))
                    .slice(0, limit);
            };

            const getGameTeamLeaders = (team, game) => {
                const leaderDefs = [
                    { key: 'pts', label: 'PTS', higherIsBetter: true },
                    { key: 'reb', label: 'REB', higherIsBetter: true },
                    { key: 'ast', label: 'AST', higherIsBetter: true },
                    { key: 'stl', label: 'STL', higherIsBetter: true },
                    { key: 'blk', label: 'BLK', higherIsBetter: true },
                    { key: 'to', label: 'TO', higherIsBetter: false }
                ];

                const playerEntries = (team?.players || [])
                    .map((player) => {
                        const stats = game?.playerStats?.[player.id];
                        if (!stats) return null;
                        return {
                            id: player.id,
                            name: player.name,
                            number: player.number,
                            pictureUrl: player.pictureUrl || '',
                            stats
                        };
                    })
                    .filter(Boolean);

                return leaderDefs.map((def) => {
                    const sorted = [...playerEntries].sort((a, b) => {
                        const aValue = Number(a.stats?.[def.key] || 0);
                        const bValue = Number(b.stats?.[def.key] || 0);
                        if (aValue !== bValue) {
                            return def.higherIsBetter ? (bValue - aValue) : (aValue - bValue);
                        }
                        return a.name.localeCompare(b.name);
                    });
                    const top = sorted[0] || null;
                    const topValue = top ? Number(top.stats?.[def.key] || 0) : 0;
                    const leaders = top
                        ? sorted.filter((entry) => Number(entry.stats?.[def.key] || 0) === topValue)
                        : [];
                    return {
                        label: def.label,
                        value: topValue,
                        leaders,
                        playerName: leaders.length ? leaders.map((entry) => entry.name).join(' / ') : '-',
                        playerNumber: leaders.length ? leaders.map((entry) => entry.number).join(' / ') : '-',
                        pictureUrl: leaders[0]?.pictureUrl || ''
                    };
                });
            };

            const compileTeamStatistics = (players, teamId) => {
                const totals = {
                    gp: games.filter(g => g.teamAId === teamId || g.teamBId === teamId).length,
                    pts: 0,
                    ast: 0,
                    reb: 0,
                    stl: 0,
                    blk: 0,
                    to: 0,
                    pf: 0,
                    fg2m: 0,
                    fg3m: 0,
                    fg2m_miss: 0,
                    fg3m_miss: 0,
                    ftm: 0,
                    ft_miss: 0
                };

                players.forEach(p => {
                    const stats = p.totalStats || {};
                    totals.pts += stats.pts || 0;
                    totals.ast += stats.ast || 0;
                    totals.reb += stats.reb || 0;
                    totals.stl += stats.stl || 0;
                    totals.blk += stats.blk || 0;
                    totals.to += stats.to || 0;
                    totals.pf += stats.pf || 0;
                    totals.fg2m += stats.fg2m || 0;
                    totals.fg3m += stats.fg3m || 0;
                    totals.fg2m_miss += stats.fg2m_miss || 0;
                    totals.fg3m_miss += stats.fg3m_miss || 0;
                    totals.ftm += stats.ftm || 0;
                    totals.ft_miss += stats.ft_miss || 0;
                });

                // Fall back to max individual player games if official game logs don't exist yet
                if (totals.gp === 0) {
                    totals.gp = Math.max(...players.map(p => p.gamesPlayed || 0), 0);
                }

                const gp = totals.gp || 1;
                const shooters = computeShootingPercentages(totals);

                return {
                    totals,
                    shooters,
                    avgs: {
                        pts: (totals.pts / gp).toFixed(1),
                        ast: (totals.ast / gp).toFixed(1),
                        reb: (totals.reb / gp).toFixed(1),
                        stl: (totals.stl / gp).toFixed(1),
                        blk: (totals.blk / gp).toFixed(1),
                        to: (totals.to / gp).toFixed(1),
                        pf: (totals.pf / gp).toFixed(1)
                    }
                };
            };

            const renderPlayerCompactRow = (playerId, isTeamA) => {
                const teamObj = isTeamA ? teams.find(t => t.id === teamAId) : teams.find(t => t.id === teamBId);
                const player = teams.flatMap(t => t.players).find(p => p.id === playerId);
                if (!player) return null;
                const onCourtLastName = (typeof player.name === 'string' ? player.name.split(',')[0] : '').trim() || player.name;
                const stats = liveStats[playerId] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                const hasActionArmed = activeAction !== null;

                const performancePool = [
                    { label: 'PTS', value: stats.pts || 0 },
                    { label: 'REB', value: stats.reb || 0 },
                    { label: 'AST', value: stats.ast || 0 },
                    { label: 'STL', value: stats.stl || 0 },
                    { label: 'BLK', value: stats.blk || 0 }
                ];
                const topThreeStats = performancePool
                    .slice()
                    .sort((a, b) => {
                        if (b.value === a.value) {
                            return performancePool.findIndex((item) => item.label === a.label) - performancePool.findIndex((item) => item.label === b.label);
                        }
                        return b.value - a.value;
                    })
                    .slice(0, 3);
                const oneLineStats = [...topThreeStats, { label: 'PF', value: stats.pf || 0 }];
                const pfValue = stats.pf || 0;

                const isDisqualified = stats.pf >= 5;
                const teamAccessAllowed = canOperateTeam(isTeamA);
                const canSelect = hasActionArmed && teamAccessAllowed && !isDisqualified;
                const canSubstitute = !hasActionArmed && canOperateLive && teamAccessAllowed && !isDisqualified;

                return (
                    <div 
                        key={player.id} 
                        data-player-id={player.id}
                        onClick={() => {
                            if (isDisqualified) return;
                            if (hasActionArmed) {
                                if (canSelect) handlePlayerClick(player.id, isTeamA);
                                return;
                            }
                            if (!canOperateLive) return;
                            triggerSubModal(player.id, isTeamA);
                        }}
                        className={`bg-slate-955/90 border p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-stretch justify-between gap-2 transition-all duration-300 ${
                            hasActionArmed && teamAccessAllowed
                                ? 'armed-target hover:bg-slate-900 border-emerald-500/50' 
                                : 'border-slate-800 hover:border-slate-700/60'
                        } ${isDisqualified ? 'bg-red-950/25 border-red-700/55 opacity-80 pointer-events-none' : ''} ${isLoggedIn && !teamAccessAllowed ? 'opacity-55 saturate-50' : ''} ${isDisqualified ? 'cursor-not-allowed' : (canSubstitute ? 'cursor-pointer' : (canSelect ? 'cursor-pointer' : 'cursor-default'))} ${flashPlayers[player.id] ? 'animate-pulse ring-2 ring-emerald-400/70 shadow-[0_0_24px_rgba(16,185,129,0.32)]' : ''} ${subFlashPlayers[player.id] ? 'sub-glow-flash ring-4 ring-amber-300/80 border-amber-300/70 shadow-[0_0_36px_rgba(251,191,36,0.45)]' : ''}`}
                    >
                        <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-12 md:w-14 text-center font-mono text-xl md:text-2xl font-black text-slate-100 bg-slate-900 px-2 py-1 rounded border border-slate-700 leading-none shrink-0">{player.number}</span>
                            <div className="min-w-0">
                                <span className="font-extrabold text-xs text-white block whitespace-normal leading-tight md:hidden">{player.name}</span>
                                <span className="font-extrabold text-xs text-white hidden md:block whitespace-normal leading-tight">{onCourtLastName}</span>
                                <div className="flex gap-2 mt-1 items-center">
                                    {isLoggedIn && !hasActionArmed && <span className="text-[9px] text-orange-400 font-bold bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 uppercase">Sub</span>}
                                    {isLoggedIn && !teamAccessAllowed && <span className="text-[9px] text-slate-400 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 uppercase">Locked</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-stretch gap-1.5 sm:gap-2 flex-shrink-0 whitespace-nowrap overflow-x-auto max-w-full self-stretch">
                            {oneLineStats.map((item) => {
                                const isPfStat = item.label === 'PF';
                                const valueClass = isPfStat
                                    ? (pfValue >= 5 ? 'text-red-300' : pfValue >= 4 ? 'text-orange-300' : pfValue >= 3 ? 'text-amber-300' : 'text-white')
                                    : 'text-white';
                                const labelClass = isPfStat
                                    ? (pfValue >= 5 ? 'text-red-400' : pfValue >= 4 ? 'text-orange-400' : pfValue >= 3 ? 'text-amber-400' : 'text-slate-400')
                                    : 'text-slate-400';
                                return (
                                    <div key={`line-${item.label}`} className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-center min-w-[48px] min-h-[52px] h-full flex flex-col justify-between">
                                        <div className={`text-[9px] uppercase tracking-wider font-bold leading-none ${labelClass}`}>{item.label}</div>
                                        <div className={`mt-1 font-mono font-black text-lg md:text-xl leading-none ${valueClass}`}>{item.value}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            };

            return (
                <div className="max-w-7xl mx-auto px-4 py-4 md:py-8">
                    
                    {/* TOAST SYSTEM */}
                    {toast && (
                        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl transition-all duration-300 border ${
                            toast.type === 'error' ? 'bg-red-955 text-red-400 border-red-800' : 
                            toast.type === 'info' ? 'bg-blue-955 text-blue-400 border-blue-800' : 
                            'bg-emerald-955 text-emerald-400 border-emerald-800'
                        }`}>
                            {toast.message}
                        </div>
                    )}

                    {SHOW_LIVE_SYNC_DEBUG && isGameLive && (
                        <div className="fixed bottom-3 right-3 z-40 w-[320px] max-w-[92vw] rounded-xl border border-cyan-500/40 bg-slate-950/95 text-[10px] text-cyan-100 font-mono p-2.5 space-y-1 shadow-2xl">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-cyan-300 uppercase tracking-wider">Live Sync Debug</span>
                                <span className="text-[9px] text-cyan-500">client {syncClientIdRef.current.slice(-6)}</span>
                            </div>
                            <div>lineupRev local/remote: <strong>{lineupRevision}</strong> / <strong>{syncDebug.lastRemoteLineupRevision || 0}</strong></div>
                            <div>keepLocalRotation: <strong>{String(syncDebug.keepLocalRotation)}</strong></div>
                            <div>pending queue: <strong>{syncDebug.pendingQueue || 0}</strong> | localOnlyLogs: <strong>{String(syncDebug.hasLocalOnly)}</strong></div>
                            <div>incoming seq/event: <strong>{syncDebug.lastIncomingSeq || 0}</strong> / <span className="text-cyan-300">{syncDebug.lastIncomingEventId || '-'}</span></div>
                            <div>persist: <span className="text-cyan-300">{syncDebug.lastPersist}</span></div>
                            {syncDebug.persistError ? <div className="text-rose-300 break-words">error: {syncDebug.persistError}</div> : null}
                            <div>home lineup: <span className="text-cyan-300">{(teamALineup || []).join(', ') || '-'}</span></div>
                            <div>away lineup: <span className="text-cyan-300">{(teamBLineup || []).join(', ') || '-'}</span></div>
                        </div>
                    )}

                    {showAuthModal && (
                        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
                            <form onSubmit={handleAuthLogin} className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-950 p-5 space-y-3">
                                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Operator/Admin Login</h3>
                                <div>
                                    <label className="block text-[11px] text-slate-400 font-bold mb-1 uppercase">Role</label>
                                    <select value={authFormRole} onChange={(e) => setAuthFormRole(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white text-xs">
                                        <option value="operator">Operator</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] text-slate-400 font-bold mb-1 uppercase">Password</label>
                                    <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-white text-xs" required />
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-1">
                                    <button type="button" onClick={() => { setShowAuthModal(false); setAuthPassword(''); }} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">Cancel</button>
                                    <button type="submit" className="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold">Login</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* LEAGUE HEADER */}
                    <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 border-b border-slate-800 pb-4">
                        <div>
                            <h1 className="text-xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">WKND League Stats</h1>
                        </div>

                        {/* MOBILE NAV DROPDOWN */}
                        <div className="md:hidden relative">
                            <button
                                type="button"
                                onClick={() => setMobileNavOpen((prev) => !prev)}
                                className="w-full bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-100 flex items-center justify-between shadow-lg"
                                aria-haspopup="menu"
                                aria-expanded={mobileNavOpen}
                                aria-label="Open navigation menu"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <activeNavTab.icon />
                                    {activeNavTab.label}
                                </span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${mobileNavOpen ? 'rotate-180 text-orange-300' : 'text-slate-400'}`}>
                                    <path d="m6 9 6 6 6-6" />
                                </svg>
                            </button>

                            {mobileNavOpen && (
                                <div className="absolute left-0 right-0 mt-2 z-40 rounded-xl border border-slate-700 bg-slate-950/95 backdrop-blur-md shadow-2xl overflow-hidden">
                                    {navTabs.map((tab) => {
                                        const TabIcon = tab.icon;
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={`mobile-nav-${tab.id}`}
                                                type="button"
                                                onClick={() => {
                                                    setActiveTab(tab.id);
                                                    setMobileNavOpen(false);
                                                }}
                                                className={`w-full px-3 py-2.5 text-sm font-semibold flex items-center justify-between border-b border-slate-800/70 last:border-b-0 transition-colors cursor-pointer ${isActive ? 'bg-orange-500/20 text-orange-200' : 'text-slate-300 hover:bg-slate-900'}`}
                                            >
                                                <span className="inline-flex items-center gap-2">
                                                    <TabIcon />
                                                    {tab.label}
                                                </span>
                                                {isActive && <span className="text-[10px] font-black uppercase tracking-wide text-orange-300">Active</span>}
                                            </button>
                                        );
                                    })}

                                    {canOperateLive && (
                                        <div className="border-t border-slate-800/70 px-3 py-2.5 space-y-2">
                                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Account: <span className="text-orange-300">{authRole.toUpperCase()}</span></div>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {operatorFocusOptions.map((option) => (
                                                    <button
                                                        key={`focus-mobile-${option.id}`}
                                                        type="button"
                                                        onClick={() => setOperatorFocus(option.id)}
                                                        className={`rounded-md border px-2 py-1 text-[9px] font-black tracking-wide transition-all cursor-pointer ${operatorFocus === option.id ? '' : 'border-slate-700 text-slate-400 bg-slate-900 hover:bg-slate-800 hover:text-slate-200'}`}
                                                        style={operatorFocus === option.id ? getFocusOptionActiveStyle(option.id) : undefined}
                                                    >
                                                        {getFocusOptionLabel(option.id)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (authRole === 'viewer') {
                                                setShowAuthModal(true);
                                            } else {
                                                handleAuthLogout();
                                            }
                                            setMobileNavOpen(false);
                                        }}
                                        className={`w-full px-3 py-2.5 text-sm font-semibold flex items-center justify-between border-t border-slate-800/70 transition-colors cursor-pointer ${authRole === 'viewer' ? 'text-orange-300 hover:bg-orange-500/10' : 'text-slate-300 hover:bg-slate-900'}`}
                                    >
                                        <span className="inline-flex items-center gap-2">
                                            <Icons.ShieldAlert />
                                            {authRole === 'viewer' ? 'Login' : 'Logout'}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* DESKTOP NAV CONTROL TABS */}
                        <nav className="hidden md:flex bg-slate-900 p-1 rounded-xl border border-slate-800 gap-0.5">
                            <button onClick={() => setActiveTab('live')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'live' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400'}`}><Icons.Activity /> Live</button>
                            <button onClick={() => setActiveTab('teams')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'teams' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400'}`}><Icons.Users /> Rosters</button>
                            <button onClick={() => setActiveTab('standings')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'standings' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400'}`}><Icons.Trophy /> Standings</button>
                            <button onClick={() => setActiveTab('history')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'history' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400'}`}><Icons.History /> Game Log</button>
                            <button onClick={() => setActiveTab('leaders')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'leaders' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-400'}`}><Icons.Trophy /> Stats</button>
                            <div className="relative">
                                <button
                                    onClick={() => {
                                        if (authRole === 'viewer') {
                                            setShowAuthModal(true);
                                            return;
                                        }
                                        setShowAccountMenu((prev) => !prev);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${authRole === 'viewer' ? 'text-orange-300 border border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25' : 'text-slate-300 border border-slate-700 hover:bg-slate-800'}`}
                                >
                                    <Icons.ShieldAlert /> {authRole === 'viewer' ? 'Login' : authRole.toUpperCase()}
                                </button>
                                {authRole !== 'viewer' && showAccountMenu && (
                                    <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-950/95 backdrop-blur-md shadow-2xl p-3 z-50">
                                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Account</div>
                                        <div className="text-xs font-bold text-orange-300 mt-0.5">{authRole.toUpperCase()}</div>
                                        <div className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Operator Focus</div>
                                        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                                            {operatorFocusOptions.map((option) => (
                                                <button
                                                    key={`focus-account-${option.id}`}
                                                    type="button"
                                                    onClick={() => setOperatorFocus(option.id)}
                                                    className={`rounded-md border px-2 py-1 text-[9px] font-black tracking-wide transition-all cursor-pointer ${operatorFocus === option.id ? '' : 'border-slate-700 text-slate-400 bg-slate-900 hover:bg-slate-800 hover:text-slate-200'}`}
                                                    style={operatorFocus === option.id ? getFocusOptionActiveStyle(option.id) : undefined}
                                                >
                                                    {getFocusOptionLabel(option.id)}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleAuthLogout();
                                            }}
                                            className="w-full mt-3 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-700 text-slate-200 hover:bg-slate-900 cursor-pointer"
                                        >
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </div>
                        </nav>

                    </header>

                    {/* MAIN DECK */}
                    <main>
                        {/* TAB 1: DUAL CONSOLE WITH TIERED BUTTON HIERARCHY */}
                        {activeTab === 'live' && (
                            <div>
                                {!isGameLive ? (
                                    <div className="space-y-4 mt-4">
                                        {canOperateLive && (
                                            <div className="max-w-xl mx-auto bg-slate-900/65 rounded-2xl border border-slate-800 p-6 shadow-2xl">
                                                <form onSubmit={handleStartMatch} className="space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-slate-400 text-xs font-bold mb-1 uppercase">Home (A)</label>
                                                            <select value={teamAId} onChange={(e) => setTeamAId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:outline-none" required>
                                                                <option value="">-- Select --</option>
                                                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-slate-400 text-xs font-bold mb-1 uppercase">Away (B)</label>
                                                            <select value={teamBId} onChange={(e) => setTeamBId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white text-xs focus:outline-none" required>
                                                                <option value="">-- Select --</option>
                                                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                            </select>
                                                        </div>
                                                    </div>
                                                    <button type="submit" className="w-full bg-orange-500 font-bold py-2.5 rounded-xl text-xs text-white cursor-pointer shadow-lg">Start Live Tracking Match</button>
                                                </form>
                                            </div>
                                        )}

                                        <div className="max-w-4xl mx-auto bg-slate-900/65 rounded-2xl border border-slate-800 p-4 shadow-2xl">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
                                                <h3 className="text-sm font-extrabold text-white uppercase tracking-wide">Game Log</h3>
                                                <button onClick={() => setActiveTab('history')} className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-[11px] font-bold cursor-pointer border border-blue-500/30">Open Game Log</button>
                                            </div>
                                            <p className="text-xs text-slate-400 leading-relaxed">Archived games and detailed box scores live in Game Log. Use that tab for summaries, edits, and CSV export.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                        {/* MOBILE BOTTOM STICKY COMPACT 2-ROW SCOREBAR */}
                                        <div className="md:hidden col-span-12 sticky top-2 z-20">
                                            <div className="bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl p-1.5 backdrop-blur-sm">
                                                <div className="grid grid-cols-7 items-center px-1.5 py-1 rounded-lg bg-slate-950 border border-slate-900">
                                                    <div className="col-span-3 text-center">
                                                        <div className="flex items-center gap-1 mb-0.5">
                                                            {Array.from({ length: timeoutLimit }).map((_, idx) => (
                                                                <span key={`timeout-a-${idx}`} className={`w-1.5 h-1.5 rounded-full ${idx < teamATimeoutUsed ? 'bg-amber-300' : 'bg-slate-800'}`} />
                                                            ))}
                                                        </div>
                                                        <span className="text-[9px] text-slate-400 font-bold block truncate">{teams.find(t => t.id === teamAId)?.name}</span>
                                                        <div className={`mt-0.5 text-3xl font-mono font-black leading-none transition-all duration-300 ${scoreFlashTeams.teamA ? 'score-burst text-amber-200 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]' : 'text-white'}`}>{teamAScore}</div>
                                                    </div>
                                                    <div className="col-span-1 text-center">
                                                        <div className="text-slate-600 font-black font-mono text-[10px]">VS</div>
                                                        <div className="mt-0.5 text-[12px] font-black tracking-wide text-orange-300 uppercase leading-none">{getPeriodLabel(currentQuarter)}</div>
                                                    </div>
                                                    <div className="col-span-3 text-center">
                                                        <div className="flex items-center justify-end gap-1 mb-0.5">
                                                            {Array.from({ length: timeoutLimit }).map((_, idx) => (
                                                                <span key={`timeout-b-${idx}`} className={`w-1.5 h-1.5 rounded-full ${idx < teamBTimeoutUsed ? 'bg-amber-300' : 'bg-slate-800'}`} />
                                                            ))}
                                                        </div>
                                                        <span className="text-[9px] text-slate-400 font-bold block truncate">{teams.find(t => t.id === teamBId)?.name}</span>
                                                        <div className={`mt-0.5 text-3xl font-mono font-black leading-none transition-all duration-300 ${scoreFlashTeams.teamB ? 'score-burst text-amber-200 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]' : 'text-white'}`}>{teamBScore}</div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-7 items-center gap-1 mt-1 px-1.5">
                                                    <div className="col-span-3 flex gap-1">
                                                        {Array.from({ length: foulBarMax }).map((_, idx) => (
                                                            <span key={`foul-a-${idx}`} className={`h-1.5 flex-1 rounded ${idx < teamAFoulsForDisplay ? 'bg-rose-400' : 'bg-slate-800'}`} />
                                                        ))}
                                                    </div>
                                                    <div className="col-span-1 text-center text-[8px] font-bold uppercase tracking-wide text-slate-500">PF</div>
                                                    <div className="col-span-3 flex gap-1">
                                                        {Array.from({ length: foulBarMax }).map((_, idx) => (
                                                            <span key={`foul-b-${idx}`} className={`h-1.5 flex-1 rounded ${idx < teamBFoulsForDisplay ? 'bg-rose-400' : 'bg-slate-800'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* DESKTOP / TABLET TOP SCOREBAR */}
                                        <div className="hidden md:block col-span-12 sticky top-2 z-30 bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-xl">
                                            <div className="grid grid-cols-7 items-center bg-slate-950 border border-slate-900 px-3 py-1.5 rounded-lg">
                                                <div className="col-span-3 relative text-center pb-4">
                                                    <div className="absolute top-0 left-0 flex items-center gap-1 pointer-events-none">
                                                        {Array.from({ length: timeoutLimit }).map((_, idx) => (
                                                            <span
                                                                key={`timeout-a-${idx}`}
                                                                className={`w-2 h-2 rounded-full ${idx < teamATimeoutUsed ? 'bg-amber-300' : 'bg-slate-800'}`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-bold block truncate">{teams.find(t => t.id === teamAId)?.name}</span>
                                                    <div className={`mt-1 text-4xl md:text-5xl font-mono font-black leading-none transition-all duration-300 ${scoreFlashTeams.teamA ? 'score-burst text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.75)]' : 'text-white'}`}>{teamAScore}</div>
                                                    <div className="absolute left-0 right-0 bottom-0 border-t border-slate-800/90 pt-1.5 px-0.5">
                                                        <div className="flex gap-1">
                                                            {Array.from({ length: foulBarMax }).map((_, idx) => (
                                                                <span
                                                                    key={`foul-a-${idx}`}
                                                                    className={`h-1.5 flex-1 rounded ${idx < teamAFoulsForDisplay ? 'bg-rose-400' : 'bg-slate-800'}`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="col-span-1 text-center">
                                                    <div className="text-slate-600 font-black font-mono text-xs">VS</div>
                                                    <div className="mt-1 text-[13px] md:text-[15px] font-black tracking-wide text-orange-300 uppercase leading-none">{getPeriodLabel(currentQuarter)}</div>
                                                </div>
                                                <div className="col-span-3 relative text-center pb-4">
                                                    <div className="absolute top-0 right-0 flex items-center gap-1 pointer-events-none">
                                                        {Array.from({ length: timeoutLimit }).map((_, idx) => (
                                                            <span
                                                                key={`timeout-b-${idx}`}
                                                                className={`w-2 h-2 rounded-full ${idx < teamBTimeoutUsed ? 'bg-amber-300' : 'bg-slate-800'}`}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 font-bold block truncate">{teams.find(t => t.id === teamBId)?.name}</span>
                                                    <div className={`mt-1 text-4xl md:text-5xl font-mono font-black leading-none transition-all duration-300 ${scoreFlashTeams.teamB ? 'score-burst text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.75)]' : 'text-white'}`}>{teamBScore}</div>
                                                    <div className="absolute left-0 right-0 bottom-0 border-t border-slate-800/90 pt-1.5 px-0.5">
                                                        <div className="flex gap-1">
                                                            {Array.from({ length: foulBarMax }).map((_, idx) => (
                                                                <span
                                                                    key={`foul-b-${idx}`}
                                                                    className={`h-1.5 flex-1 rounded ${idx < teamBFoulsForDisplay ? 'bg-rose-400' : 'bg-slate-800'}`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {canOperateLive && (
                                            <div className="col-span-12">
                                                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                                                    <button
                                                        onClick={() => handleLogTimeout(true)}
                                                            disabled={!teamATimeoutEnabled || !canOperateTeam(true)}
                                                        className="w-full font-black py-2.5 md:py-3 px-2 md:px-3 rounded-xl text-[9px] md:text-xs leading-tight tracking-wide border-2 transition-all cursor-pointer disabled:opacity-30 disabled:saturate-0 disabled:cursor-not-allowed"
                                                        style={{
                                                            backgroundColor: `${liveHomeTeam?.color || '#06b6d4'}${teamATimeoutEnabled ? '66' : '22'}`,
                                                            borderColor: liveHomeTeam?.color || '#06b6d4',
                                                            color: teamATimeoutEnabled ? '#ffffff' : (liveHomeTeam?.color || '#67e8f9')
                                                        }}
                                                    >
                                                        {`${(liveHomeTeam?.name || 'Home').toUpperCase()} TIMEOUT (${teamATimeoutUsed}/${timeoutLimit})`}
                                                    </button>
                                                    <button
                                                        onClick={handlePeriodAction}
                                                        className={`w-full font-black py-2.5 md:py-3 px-2 md:px-3 rounded-xl text-[9px] md:text-xs leading-tight tracking-wide border-2 transition-all cursor-pointer shadow-lg ${
                                                            periodActionIsStart
                                                                ? 'bg-emerald-600/25 hover:bg-emerald-600/35 border-emerald-400/70 text-emerald-100 animate-pulse'
                                                                : 'bg-red-600 hover:bg-red-500 border-red-400 text-white'
                                                        }`}
                                                    >
                                                        {periodActionLabel}
                                                    </button>
                                                    <button
                                                        onClick={() => handleLogTimeout(false)}
                                                        disabled={!teamBTimeoutEnabled || !canOperateTeam(false)}
                                                        className="w-full font-black py-2.5 md:py-3 px-2 md:px-3 rounded-xl text-[9px] md:text-xs leading-tight tracking-wide border-2 transition-all cursor-pointer disabled:opacity-30 disabled:saturate-0 disabled:cursor-not-allowed"
                                                        style={{
                                                            backgroundColor: `${liveAwayTeam?.color || '#06b6d4'}${teamBTimeoutEnabled ? '66' : '22'}`,
                                                            borderColor: liveAwayTeam?.color || '#06b6d4',
                                                            color: teamBTimeoutEnabled ? '#ffffff' : (liveAwayTeam?.color || '#67e8f9')
                                                        }}
                                                    >
                                                        {`${(liveAwayTeam?.name || 'Away').toUpperCase()} TIMEOUT (${teamBTimeoutUsed}/${timeoutLimit})`}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* QUICK ACTION DECK GRID WITH RESPONSIVE DISPLAY & TIERED PRIORITY */}
                                        {canOperateLive && <div className="col-span-12 bg-slate-900 border border-slate-800 p-2.5 md:p-4 rounded-xl shadow-xl space-y-2 md:space-y-4 max-h-[calc(100vh-245px)] overflow-y-auto md:max-h-none md:overflow-visible">
                                            <div className="flex items-center border-b border-slate-800 pb-1.5">
                                                <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-extrabold flex items-center gap-1"><Icons.Zap /> Tap action first, then select player on court</span>
                                            </div>
                                            {!canTriggerStatLogging && (
                                                <div className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2">
                                                    {hasMatchStarted
                                                        ? 'Stat triggers are locked during timeout. Press Resume Play.'
                                                        : 'Stat triggers are locked until you press Start Match.'}
                                                </div>
                                            )}

                                            {/* TIER 1: GIANT PRIMARY KEYS (Shooting metrics) */}
                                            <div>
                                                <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block mb-2">🏀 Primary Shooting Keys & Attempts</span>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-3">
                                                        {canOperateLive && primaryActions.map(act => (
                                                        <button 
                                                            key={act.id} 
                                                            disabled={!canTriggerStatLogging}
                                                            onClick={() => openActionForTeam(act, operatorFocus === 'away' ? false : true)}
                                                            title={!canTriggerStatLogging ? 'Press Start Match first' : undefined}
                                                            className={`py-3.5 md:py-6 px-1.5 md:px-4 rounded-lg md:rounded-2xl text-center text-[9px] md:text-sm font-black tracking-wide border transition-all active:scale-95 cursor-pointer shadow-lg uppercase disabled:opacity-40 disabled:saturate-0 disabled:cursor-not-allowed ${act.colorClass} border-transparent`}
                                                        >
                                                            {act.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* TIER 2 & TIER 3 COMBINED CONTAINER */}
                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                                {/* TIER 2: LARGE SECONDARY KEYS (Rebounds & Assists) */}
                                                <div className="lg:col-span-5">
                                                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block mb-2">🛡️ Transition Keys (Very Common)</span>
                                                    <div className="grid grid-cols-2 gap-1.5 md:gap-3">
                                                        {canOperateLive && secondaryActions.map(act => (
                                                            <button 
                                                                key={act.id} 
                                                                disabled={!canTriggerStatLogging}
                                                                onClick={() => openActionForTeam(act, operatorFocus === 'away' ? false : true)}
                                                                title={!canTriggerStatLogging ? 'Press Start Match first' : undefined}
                                                                className={`py-3.5 md:py-4 px-2 md:px-4 rounded-lg md:rounded-xl text-center text-[10px] md:text-xs font-black border transition-all active:scale-95 cursor-pointer shadow-md uppercase disabled:opacity-40 disabled:saturate-0 disabled:cursor-not-allowed ${act.colorClass} border-transparent`}
                                                            >
                                                                {act.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* TIER 3: COMPACT TERTIARY KEYS ("FT Miss" is neatly located here) */}
                                                <div className="lg:col-span-12">
                                                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block mb-2">⚙️ Auxiliary Game Events</span>
                                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-1.5 md:gap-2">
                                                        {canOperateLive && tertiaryActions.map(act => (
                                                            <button 
                                                                key={act.id} 
                                                                disabled={!canTriggerStatLogging}
                                                                onClick={() => openActionForTeam(act, operatorFocus === 'away' ? false : true)}
                                                                title={!canTriggerStatLogging ? 'Press Start Match first' : undefined}
                                                                className={`py-[11px] md:py-2.5 px-1.5 md:px-2 rounded-lg text-center text-[9px] md:text-[10px] font-bold border transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-40 disabled:saturate-0 disabled:cursor-not-allowed ${act.colorClass} border-transparent`}
                                                            >
                                                                {act.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            {canOperateLive && foulActions.length > 0 && (
                                                <div>
                                                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block mb-2">⚠️ Foul Actions</span>
                                                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                                                        {foulActions.map((act) => (
                                                            <button
                                                                key={act.id}
                                                                disabled={!canTriggerStatLogging}
                                                                onClick={() => openActionForTeam(act, operatorFocus === 'away' ? false : true)}
                                                                title={!canTriggerStatLogging ? 'Press Start Match first' : undefined}
                                                                className={`py-[11px] md:py-2.5 px-1.5 md:px-3 rounded-lg text-center text-[9px] md:text-[10px] font-bold border transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-40 disabled:saturate-0 disabled:cursor-not-allowed ${act.colorClass} border-transparent`}
                                                            >
                                                                {act.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>}

                                        {/* Mobile Tab Toggles */}
                                        <div className="col-span-12 md:hidden flex bg-slate-955 p-1 rounded-xl border border-slate-855 gap-1">
                                            <button onClick={() => setActiveMobileConsoleTab('home')} className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg ${activeMobileConsoleTab === 'home' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>🏠 Home lineup</button>
                                            <button onClick={() => setActiveMobileConsoleTab('away')} className={`flex-1 py-1.5 text-center text-xs font-bold rounded-lg ${activeMobileConsoleTab === 'away' ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>🚌 Away lineup</button>
                                        </div>

                                        {/* Main Courtside tracking zones */}
                                        <div className={`col-span-12 ${canOperateLive ? `lg:col-span-9 grid grid-cols-1 ${showHomeLivePanel && showAwayLivePanel ? 'md:grid-cols-2' : 'md:grid-cols-1'}` : 'lg:col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.62fr)_minmax(0,1fr)]'} gap-4`}>
                                            {showHomeLivePanel && <div className={`bg-slate-900/80 border border-slate-800 p-3 rounded-xl space-y-2 ${activeMobileConsoleTab === 'home' || !showAwayLivePanel ? 'block' : 'hidden md:block'}`}>
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">ON COURT - {homeTeamLabel}</div>
                                                    {canOperateLive && (
                                                        <div className="flex items-center gap-1">
                                                            {homeCanAddOnCourt && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenAddFromBenchModal(true)}
                                                                    disabled={!canOperateTeam(true)}
                                                                    className="px-2 py-0.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-[9px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                                                                >
                                                                    Add Player
                                                                </button>
                                                            )}
                                                            {homeCanClearOnCourt && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearOnCourtPlayers(true)}
                                                                    disabled={!canOperateTeam(true)}
                                                                    className="px-2 py-0.5 rounded-md border border-rose-500/35 bg-rose-500/10 text-[9px] font-black uppercase tracking-wide text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">{teamALineup.map(id => renderPlayerCompactRow(id, true))}</div>
                                                {canOperateLive && teamALineup.length < 5 && (
                                                    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                                                        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Available from bench ({teamALineup.length}/5)</div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(() => {
                                                                const teamObj = teams.find((t) => t.id === teamAId);
                                                                const rosterIds = (teamObj?.players || []).map((p) => p.id);
                                                                const fallbackCandidates = rosterIds.filter((id) => !teamALineup.includes(id));
                                                                const addCandidates = teamABench.length > 0 ? teamABench : fallbackCandidates;
                                                                if (!addCandidates.length) {
                                                                    return <span className="text-[10px] text-slate-500">No bench players available</span>;
                                                                }
                                                                return addCandidates.map((benchId) => {
                                                                    const p = teamObj?.players.find((x) => x.id === benchId);
                                                                    if (!p) return null;
                                                                    const isFouledOut = (liveStats[benchId]?.pf || 0) >= 5;
                                                                    return (
                                                                        <button
                                                                            key={`add-home-${benchId}`}
                                                                            type="button"
                                                                            disabled={isFouledOut || !canOperateTeam(true)}
                                                                            onClick={() => handleAddOnCourtPlayer(benchId, true)}
                                                                            className="px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                            title={isFouledOut ? 'Player has 5 fouls' : 'Add to on-court'}
                                                                        >
                                                                            #{p.number} {p.name}
                                                                        </button>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>}

                                            {!canOperateLive && <div className="hidden lg:flex bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-col max-h-[504px]">
                                                <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/80">
                                                    <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">PLAY-BY-PLAY</h4>
                                                </div>
                                                <div className="p-3 flex-1 min-h-0 overflow-y-auto font-mono text-[10px]">
                                                    {gameLog.map((log, idx) => {
                                                        const canRemove = canOperateLive && idx === 0 && !!log.id;
                                                        const isSubEvent = log?.kind === 'sub' || (typeof log.text === 'string' && log.text.includes('SUB:'));
                                                        const isSubFlash = isSubEvent && !!log?.id && subFlashLogId === log.id;
                                                        const hasHomeTag = typeof log.text === 'string' && log.text.startsWith('[HOME] ');
                                                        const hasAwayTag = typeof log.text === 'string' && log.text.startsWith('[AWAY] ');
                                                        const cleanText = typeof log.text === 'string' ? log.text.replace(/^\[(HOME|AWAY)\]\s*/, '') : log.text;
                                                        const dotColor = (log.isTeamA === true || hasHomeTag)
                                                            ? (liveHomeTeam?.color || '#10b981')
                                                            : (log.isTeamA === false || hasAwayTag)
                                                                ? (liveAwayTeam?.color || '#ef4444')
                                                                : '#64748b';
                                                        return (
                                                            <div
                                                                key={log.id || idx}
                                                                className={`py-1.5 px-1.5 text-slate-300 rounded border transition-all duration-300 ${idx % 2 === 0 ? 'bg-slate-950/45' : 'bg-slate-900/25'} ${isSubEvent ? 'border-amber-500/35 text-amber-100' : 'border-transparent'} ${isSubFlash ? 'sub-glow-flash border-amber-300/80 bg-amber-500/15 shadow-[0_0_22px_rgba(251,191,36,0.35)]' : ''}`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-amber-500">[{(log.time || '').split(' ')[0] || '--:--:--'}]</span>
                                                                    {canRemove && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteLogEntry(log.id)}
                                                                            className="shrink-0 w-5 h-5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 hover:text-white flex items-center justify-center"
                                                                            title="Remove log entry"
                                                                            aria-label="Remove log entry"
                                                                        >
                                                                            <Icons.Undo />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="mt-1 flex items-start gap-2">
                                                                    <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: dotColor }} />
                                                                    <span className="flex-1 min-w-0 break-words">{cleanText}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>}

                                            {showAwayLivePanel && <div className={`bg-slate-900/80 border border-slate-800 p-3 rounded-xl space-y-2 ${activeMobileConsoleTab === 'away' || !showHomeLivePanel ? 'block' : 'hidden md:block'}`}>
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">ON COURT - {awayTeamLabel}</div>
                                                    {canOperateLive && (
                                                        <div className="flex items-center gap-1">
                                                            {awayCanAddOnCourt && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenAddFromBenchModal(false)}
                                                                    disabled={!canOperateTeam(false)}
                                                                    className="px-2 py-0.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-[9px] font-black uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                                                                >
                                                                    Add Player
                                                                </button>
                                                            )}
                                                            {awayCanClearOnCourt && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearOnCourtPlayers(false)}
                                                                    disabled={!canOperateTeam(false)}
                                                                    className="px-2 py-0.5 rounded-md border border-rose-500/35 bg-rose-500/10 text-[9px] font-black uppercase tracking-wide text-rose-300 hover:bg-rose-500/20 cursor-pointer"
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">{teamBLineup.map(id => renderPlayerCompactRow(id, false))}</div>
                                                {canOperateLive && teamBLineup.length < 5 && (
                                                    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                                                        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Available from bench ({teamBLineup.length}/5)</div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(() => {
                                                                const teamObj = teams.find((t) => t.id === teamBId);
                                                                const rosterIds = (teamObj?.players || []).map((p) => p.id);
                                                                const fallbackCandidates = rosterIds.filter((id) => !teamBLineup.includes(id));
                                                                const addCandidates = teamBBench.length > 0 ? teamBBench : fallbackCandidates;
                                                                if (!addCandidates.length) {
                                                                    return <span className="text-[10px] text-slate-500">No bench players available</span>;
                                                                }
                                                                return addCandidates.map((benchId) => {
                                                                    const p = teamObj?.players.find((x) => x.id === benchId);
                                                                    if (!p) return null;
                                                                    const isFouledOut = (liveStats[benchId]?.pf || 0) >= 5;
                                                                    return (
                                                                        <button
                                                                            key={`add-away-${benchId}`}
                                                                            type="button"
                                                                            disabled={isFouledOut || !canOperateTeam(false)}
                                                                            onClick={() => handleAddOnCourtPlayer(benchId, false)}
                                                                            className="px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                            title={isFouledOut ? 'Player has 5 fouls' : 'Add to on-court'}
                                                                        >
                                                                            #{p.number} {p.name}
                                                                        </button>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>}
                                        </div>

                                        {/* Sidebar Action Logger */}
                                        <div className={`${canOperateLive ? 'col-span-12 lg:col-span-3' : 'col-span-12 lg:hidden'} flex flex-col gap-4 h-full min-h-0`}>
                                            <div className={`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col ${canOperateLive ? 'max-h-[360px] lg:max-h-[296px]' : 'max-h-[420px] md:max-h-[520px] lg:max-h-[504px]'}`}>
                                                <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/80">
                                                    <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">PLAY-BY-PLAY</h4>
                                                </div>
                                                <div className="p-3 flex-1 min-h-0 overflow-y-auto font-mono text-[10px]">
                                                    {gameLog.map((log, idx) => {
                                                        const canRemove = canOperateLive && idx === 0 && !!log.id;
                                                        const isSubEvent = log?.kind === 'sub' || (typeof log.text === 'string' && log.text.includes('SUB:'));
                                                        const isSubFlash = isSubEvent && !!log?.id && subFlashLogId === log.id;
                                                        const hasHomeTag = typeof log.text === 'string' && log.text.startsWith('[HOME] ');
                                                        const hasAwayTag = typeof log.text === 'string' && log.text.startsWith('[AWAY] ');
                                                        const cleanText = typeof log.text === 'string' ? log.text.replace(/^\[(HOME|AWAY)\]\s*/, '') : log.text;
                                                        const dotColor = (log.isTeamA === true || hasHomeTag)
                                                            ? (liveHomeTeam?.color || '#10b981')
                                                            : (log.isTeamA === false || hasAwayTag)
                                                                ? (liveAwayTeam?.color || '#ef4444')
                                                                : '#64748b';
                                                        return (
                                                            <div
                                                                key={log.id || idx}
                                                                className={`py-1.5 px-1.5 text-slate-300 rounded border transition-all duration-300 ${idx % 2 === 0 ? 'bg-slate-950/45' : 'bg-slate-900/25'} ${isSubEvent ? 'border-amber-500/35 text-amber-100' : 'border-transparent'} ${isSubFlash ? 'sub-glow-flash border-amber-300/80 bg-amber-500/15 shadow-[0_0_22px_rgba(251,191,36,0.35)]' : ''}`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-amber-500">[{(log.time || '').split(' ')[0] || '--:--:--'}]</span>
                                                                    {canRemove && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteLogEntry(log.id)}
                                                                            className="shrink-0 w-5 h-5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 hover:text-white flex items-center justify-center"
                                                                            title="Remove log entry"
                                                                            aria-label="Remove log entry"
                                                                        >
                                                                            <Icons.Undo />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                <div className="mt-1 flex items-start gap-2">
                                                                    <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: dotColor }} />
                                                                    <span className="flex-1 min-w-0 break-words">{cleanText}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            
                                            {canOperateLive && <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl md:rounded-2xl space-y-3">
                                                <div className="space-y-1.5">
                                                    {canOperateLive && <button onClick={handleResetMatch} className="w-full bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-400 font-bold py-2 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer">Clear & Restart Game</button>}
                                                    {canOperateLive && <button onClick={() => setConfirmDialog({ title: "Cancel Match?", text: "This deletes all active progress for this session. No logs will be saved to disk.", onConfirm: () => { setIsGameLive(false); setActiveAction(null); setAwaitingOvertimeDecision(false); setDnpPlayers([]); setLineupRevision(0); lineupRevisionRef.current = 0; setConfirmDialog(null); } })} className="w-full bg-slate-955/60 hover:text-red-300 hover:border-red-900 border border-slate-855 text-slate-500 text-xs py-1.5 rounded-xl transition-all cursor-pointer">Discard Match</button>}
                                                </div>
                                            </div>}
                                        </div>

                                        {/* COLLAPSIBLE QUARTER SCORING */}
                                        <div className="col-span-12 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl mt-4">
                                            <div
                                                onClick={() => setShowQuarterScoring(!showQuarterScoring)}
                                                className="p-4 bg-slate-950 flex items-center justify-between cursor-pointer select-none border-b border-slate-800"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs bg-orange-500/20 text-orange-300 font-bold px-2 py-0.5 rounded border border-orange-500/30">{getPeriodLabel(currentQuarter)}</span>
                                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Scoring by Quarter</h3>
                                                </div>
                                                <span className="text-xs font-extrabold text-orange-400 hover:text-orange-300">
                                                    {showQuarterScoring ? "Hide ▲" : "Show ▼"}
                                                </span>
                                            </div>

                                            {showQuarterScoring && (
                                                <div className="p-4 bg-slate-955/30 overflow-x-auto">
                                                    <table className="w-full min-w-[520px] text-[11px] font-mono border border-slate-800 rounded-lg overflow-hidden">
                                                        <thead>
                                                            <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                                                                <th className="py-2 px-3 text-left">Team</th>
                                                                {liveQuarterStats.map((row) => (
                                                                    <th key={`live-quarter-head-${row.quarter}`} className="py-2 px-3 text-center">{getPeriodLabel(row.quarter)}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                                                            <tr>
                                                                <td className="py-2 px-3 font-bold" style={{ color: teams.find(t => t.id === teamAId)?.color || '#10b981' }}>{teams.find(t => t.id === teamAId)?.name || 'Team A'}</td>
                                                                {liveQuarterStats.map((row) => (
                                                                    <td key={`live-quarter-a-${row.quarter}`} className="py-2 px-3 text-center font-black">{row.teamA.pts}</td>
                                                                ))}
                                                            </tr>
                                                            <tr>
                                                                <td className="py-2 px-3 font-bold" style={{ color: teams.find(t => t.id === teamBId)?.color || '#ef4444' }}>{teams.find(t => t.id === teamBId)?.name || 'Team B'}</td>
                                                                {liveQuarterStats.map((row) => (
                                                                    <td key={`live-quarter-b-${row.quarter}`} className="py-2 px-3 text-center font-black">{row.teamB.pts}</td>
                                                                ))}
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>

                                        {/* COLLAPSIBLE RUNNING GAME BOXSCORE (FOR BOTH TEAMS' ENTIRE ROSTER) */}
                                        <div className="col-span-12 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl mt-4">
                                            <div 
                                                onClick={() => setShowLiveRunningBoxscore(!showLiveRunningBoxscore)}
                                                className="p-4 bg-slate-950 flex items-center justify-between cursor-pointer select-none border-b border-slate-800"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/30">LIVE</span>
                                                    <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                                        📊 Active Running Game Boxscore (All Rostered Players)
                                                    </h3>
                                                </div>
                                                <span className="text-xs font-extrabold text-orange-400 hover:text-orange-300">
                                                    {showLiveRunningBoxscore ? "Hide Boxscore ▲" : "Show Running Boxscore ▼"}
                                                </span>
                                            </div>

                                            {showLiveRunningBoxscore && (
                                                <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-6 bg-slate-955/30">
                                                    {/* Home Team Live Boxscore */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: teams.find(t => t.id === teamAId)?.color || '#e2e8f0' }} />
                                                                <h4 className="text-xs font-black uppercase text-slate-200">{teams.find(t => t.id === teamAId)?.name} Live Stats</h4>
                                                            </div>
                                                            <span className="text-[10px] font-mono text-slate-500">Live Team Score: <strong className="text-white font-bold">{teamAScore}</strong></span>
                                                        </div>
                                                        <div className="overflow-x-auto rounded-xl border border-slate-850/80 bg-slate-950/40">
                                                            <table className="w-full text-left text-[11px] min-w-[550px]">
                                                                <thead>
                                                                    <tr className="bg-slate-950/80 text-slate-400 font-mono text-[9px] border-b border-slate-800">
                                                                        <th className="py-2 px-3">Player</th>
                                                                        <th className="py-2 px-2 text-center text-orange-400">PTS</th>
                                                                        <th className="py-2 px-2 text-center">FG</th>
                                                                        <th className="py-2 px-2 text-center">3PT</th>
                                                                        <th className="py-2 px-2 text-center">FT</th>
                                                                        <th className="py-2 px-2 text-center">REB</th>
                                                                        <th className="py-2 px-2 text-center">AST</th>
                                                                        <th className="py-2 px-2 text-center">STL</th>
                                                                        <th className="py-2 px-2 text-center">BLK</th>
                                                                        <th className="py-2 px-2 text-center">TO</th>
                                                                        <th className="py-2 px-2 text-center text-red-400">PF</th>
                                                                        <th className="py-2 px-2 text-center text-rose-300">GP Tag</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-800/50 font-mono text-slate-300">
                                                                    {(teams.find(t => t.id === teamAId)?.players || []).map(player => {
                                                                        const pstats = liveStats[player.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                                                                        const totalMade = (pstats.fg2m || 0) + (pstats.fg3m || 0);
                                                                        const totalAtt = totalMade + (pstats.fg2m_miss || 0) + (pstats.fg3m_miss || 0);
                                                                        const fg3Att = (pstats.fg3m || 0) + (pstats.fg3m_miss || 0);
                                                                        const ftAtt = (pstats.ftm || 0) + (pstats.ft_miss || 0);
                                                                        const onCourt = teamALineup.includes(player.id);
                                                                        const isMarkedDnp = dnpPlayers.includes(player.id);
                                                                        const dnpLocked = hasAnyTrackedLiveStat(player.id);

                                                                        return (
                                                                            <tr key={player.id} data-player-id={player.id} className={`hover:bg-slate-800/20 transition-all duration-300 ${onCourt ? 'bg-emerald-500/5 font-semibold text-white' : 'opacity-70'} ${flashPlayers[player.id] ? 'animate-pulse ring-2 ring-emerald-400/70 shadow-[0_0_26px_rgba(16,185,129,0.3)] bg-emerald-500/10' : ''} ${subFlashPlayers[player.id] ? 'sub-glow-flash ring-2 ring-amber-300/70 shadow-[0_0_30px_rgba(251,191,36,0.4)] bg-amber-500/10' : ''}`}>
                                                                                <td className="py-1.5 px-3 truncate font-sans">
                                                                                    <span className="font-mono text-slate-500 text-[10px] mr-1">#{player.number}</span>
                                                                                    {player.name}
                                                                                    {onCourt && <span className="ml-1 text-[8px] text-emerald-400 font-bold uppercase bg-emerald-500/10 px-1 rounded">On Court</span>}
                                                                                </td>
                                                                                <td className="py-1.5 px-2 text-center text-orange-400 font-bold">{pstats.pts}</td>
                                                                                <td className="py-1.5 px-2 text-center">{totalMade}/{totalAtt}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.fg3m || 0}/{fg3Att}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.ftm || 0}/{ftAtt}</td>
                                                                                <td className="py-1.5 px-2 text-center text-emerald-400">{pstats.reb}</td>
                                                                                <td className="py-1.5 px-2 text-center text-blue-400">{pstats.ast}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.stl || 0}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.blk || 0}</td>
                                                                                <td className="py-1.5 px-2 text-center text-amber-500">{pstats.to || 0}</td>
                                                                                <td className="py-1.5 px-2 text-center text-red-400 font-bold">{pstats.pf}</td>
                                                                                <td className="py-1.5 px-2 text-center">
                                                                                    {dnpLocked ? (
                                                                                        <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black border bg-emerald-500/10 text-emerald-300 border-emerald-500/40" title="Player has recorded stats; DNP not available">
                                                                                            Played
                                                                                        </span>
                                                                                    ) : (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => togglePlayerDidNotPlay(player.id)}
                                                                                            className={`px-2 py-0.5 rounded text-[9px] font-black border cursor-pointer ${isMarkedDnp ? 'bg-rose-500/20 text-rose-200 border-rose-500/60' : 'bg-slate-950/80 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500'}`}
                                                                                            title={isMarkedDnp ? 'Marked DNP: excluded from games played for this match' : 'Mark as DNP: exclude from games played for this match'}
                                                                                        >
                                                                                            {isMarkedDnp ? 'DNP' : 'Counted'}
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    {/* Away Team Live Boxscore */}
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: teams.find(t => t.id === teamBId)?.color || '#3b82f6' }} />
                                                                <h4 className="text-xs font-black uppercase text-slate-200">{teams.find(t => t.id === teamBId)?.name} Live Stats</h4>
                                                            </div>
                                                            <span className="text-[10px] font-mono text-slate-500">Live Team Score: <strong className="text-white font-bold">{teamBScore}</strong></span>
                                                        </div>
                                                        <div className="overflow-x-auto rounded-xl border border-slate-850/80 bg-slate-955/40">
                                                            <table className="w-full text-left text-[11px] min-w-[550px]">
                                                                <thead>
                                                                    <tr className="bg-slate-950/80 text-slate-400 font-mono text-[9px] border-b border-slate-800">
                                                                        <th className="py-2 px-3">Player</th>
                                                                        <th className="py-2 px-2 text-center text-orange-400">PTS</th>
                                                                        <th className="py-2 px-2 text-center">FG</th>
                                                                        <th className="py-2 px-2 text-center">3PT</th>
                                                                        <th className="py-2 px-2 text-center">FT</th>
                                                                        <th className="py-2 px-2 text-center">REB</th>
                                                                        <th className="py-2 px-2 text-center">AST</th>
                                                                        <th className="py-2 px-2 text-center">STL</th>
                                                                        <th className="py-2 px-2 text-center">BLK</th>
                                                                        <th className="py-2 px-2 text-center">TO</th>
                                                                        <th className="py-2 px-2 text-center text-red-400">PF</th>
                                                                        <th className="py-2 px-2 text-center text-rose-300">GP Tag</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-800/50 font-mono text-slate-300">
                                                                    {(teams.find(t => t.id === teamBId)?.players || []).map(player => {
                                                                        const pstats = liveStats[player.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                                                                        const totalMade = (pstats.fg2m || 0) + (pstats.fg3m || 0);
                                                                        const totalAtt = totalMade + (pstats.fg2m_miss || 0) + (pstats.fg3m_miss || 0);
                                                                        const fg3Att = (pstats.fg3m || 0) + (pstats.fg3m_miss || 0);
                                                                        const ftAtt = (pstats.ftm || 0) + (pstats.ft_miss || 0);
                                                                        const onCourt = teamBLineup.includes(player.id);
                                                                        const isMarkedDnp = dnpPlayers.includes(player.id);
                                                                        const dnpLocked = hasAnyTrackedLiveStat(player.id);

                                                                        return (
                                                                            <tr key={player.id} data-player-id={player.id} className={`hover:bg-slate-800/20 transition-all duration-300 ${onCourt ? 'bg-emerald-500/5 font-semibold text-white' : 'opacity-70'} ${flashPlayers[player.id] ? 'animate-pulse ring-2 ring-emerald-400/70 shadow-[0_0_26px_rgba(16,185,129,0.3)] bg-emerald-500/10' : ''} ${subFlashPlayers[player.id] ? 'sub-glow-flash ring-2 ring-amber-300/70 shadow-[0_0_30px_rgba(251,191,36,0.4)] bg-amber-500/10' : ''}`}>
                                                                                <td className="py-1.5 px-3 truncate font-sans">
                                                                                    <span className="font-mono text-slate-500 text-[10px] mr-1">#{player.number}</span>
                                                                                    {player.name}
                                                                                    {onCourt && <span className="ml-1 text-[8px] text-emerald-400 font-bold uppercase bg-emerald-500/10 px-1 rounded">On Court</span>}
                                                                                </td>
                                                                                <td className="py-1.5 px-2 text-center text-orange-400 font-bold">{pstats.pts}</td>
                                                                                <td className="py-1.5 px-2 text-center">{totalMade}/{totalAtt}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.fg3m || 0}/{fg3Att}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.ftm || 0}/{ftAtt}</td>
                                                                                <td className="py-1.5 px-2 text-center text-emerald-400">{pstats.reb}</td>
                                                                                <td className="py-1.5 px-2 text-center text-blue-400">{pstats.ast}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.stl || 0}</td>
                                                                                <td className="py-1.5 px-2 text-center">{pstats.blk || 0}</td>
                                                                                <td className="py-1.5 px-2 text-center text-amber-500">{pstats.to || 0}</td>
                                                                                <td className="py-1.5 px-2 text-center text-red-400 font-bold">{pstats.pf}</td>
                                                                                <td className="py-1.5 px-2 text-center">
                                                                                    {dnpLocked ? (
                                                                                        <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-black border bg-emerald-500/10 text-emerald-300 border-emerald-500/40" title="Player has recorded stats; DNP not available">
                                                                                            Played
                                                                                        </span>
                                                                                    ) : (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => togglePlayerDidNotPlay(player.id)}
                                                                                            className={`px-2 py-0.5 rounded text-[9px] font-black border cursor-pointer ${isMarkedDnp ? 'bg-rose-500/20 text-rose-200 border-rose-500/60' : 'bg-slate-950/80 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500'}`}
                                                                                            title={isMarkedDnp ? 'Marked DNP: excluded from games played for this match' : 'Mark as DNP: exclude from games played for this match'}
                                                                                        >
                                                                                            {isMarkedDnp ? 'DNP' : 'Counted'}
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 3: ROSTER LISTS (CLEAN DESIGN - SUPPORTING DUAL TEAM STAT TOTALS/AVERAGES) */}
                        {activeTab === 'teams' && (
                            <div className="space-y-4">
                                {selectedRosterTeam && selectedRosterAthlete ? (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between gap-2 bg-slate-955 p-3 rounded-xl border border-slate-850">
                                            <button
                                                onClick={() => setSelectedRosterPlayer(null)}
                                                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold cursor-pointer"
                                            >
                                                Back To Roster
                                            </button>
                                            <span className="text-[10px] text-slate-500 font-mono">Player Profile</span>
                                        </div>

                                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
                                            <div className="flex flex-col md:flex-row gap-4 md:items-stretch md:justify-between">
                                                <div className="flex items-center gap-3">
                                                    {selectedRosterAthlete.pictureUrl ? (
                                                        <img
                                                            src={selectedRosterAthlete.pictureUrl}
                                                            alt={selectedRosterAthlete.name}
                                                            className="w-28 h-28 md:w-32 md:h-32 rounded-2xl object-cover border border-slate-700"
                                                        />
                                                    ) : (
                                                        <div className="w-28 h-28 md:w-32 md:h-32 rounded-2xl border border-slate-700 bg-slate-950 text-slate-300 flex items-center justify-center text-3xl font-black">
                                                            {(selectedRosterAthlete.name || '?').slice(0, 1).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{selectedRosterTeam.name}</div>
                                                        <div className="flex items-start justify-between gap-2">
                                                            <h3 className="text-lg md:text-xl font-black text-white leading-tight">#{selectedRosterAthlete.number} {selectedRosterAthlete.name}</h3>
                                                            {isLoggedIn && canEditPlayers && (
                                                                <button onClick={() => handleStartAdvancedEditPlayer(selectedRosterPlayer.teamId, selectedRosterAthlete)} className="text-cyan-400 hover:text-cyan-300 p-1.5 rounded cursor-pointer shrink-0" title="Edit player profile" aria-label="Edit player profile">
                                                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="my-2 flex flex-wrap items-center justify-start gap-1.5">
                                                            {Array.isArray(selectedRosterAthlete.positions) && selectedRosterAthlete.positions.length > 0 ? (
                                                                selectedRosterAthlete.positions.map((pos) => (
                                                                    <span key={`profile-pos-${selectedRosterAthlete.id}-${pos}`} className="px-1.5 py-0.5 rounded-md text-[10px] font-black border border-cyan-500/35 bg-cyan-500/10 text-cyan-200 font-mono">
                                                                        {pos}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="text-[10px] text-slate-500 font-mono">No positions set</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-400">Games Played: {selectedRosterAthlete.gamesPlayed || 0}</div>
                                                        {selectedRosterAthlete.writeup && (
                                                            <p className="mt-2 text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{selectedRosterAthlete.writeup}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2 text-center font-mono md:w-[360px] lg:w-[420px]">
                                                    <div className="bg-slate-900/95 border border-orange-500/40 rounded-lg py-2.5 flex flex-col justify-center">
                                                        <div className="text-[9px] text-slate-500">PTS</div>
                                                        <div className="text-2xl md:text-3xl font-black text-orange-300 leading-none mt-1">{selectedRosterAthleteAverages?.pts || '0.0'}</div>
                                                    </div>
                                                    <div className="bg-slate-900/95 border border-emerald-500/35 rounded-lg py-2.5 flex flex-col justify-center">
                                                        <div className="text-[9px] text-slate-500">REB</div>
                                                        <div className="text-2xl md:text-3xl font-black text-emerald-300 leading-none mt-1">{selectedRosterAthleteAverages?.reb || '0.0'}</div>
                                                    </div>
                                                    <div className="bg-slate-900/95 border border-blue-500/35 rounded-lg py-2.5 flex flex-col justify-center">
                                                        <div className="text-[9px] text-slate-500">AST</div>
                                                        <div className="text-2xl md:text-3xl font-black text-blue-300 leading-none mt-1">{selectedRosterAthleteAverages?.ast || '0.0'}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                                                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Season Averages</div>
                                                <div className="space-y-2 font-mono">
                                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center">
                                                        <div className="bg-slate-900/80 border border-slate-800 rounded-md py-2"><div className="text-[9px] text-slate-500">STL</div><div className="text-sm font-black text-teal-300">{selectedRosterAthleteAverages?.stl || '0.0'}</div></div>
                                                        <div className="bg-slate-900/80 border border-slate-800 rounded-md py-2"><div className="text-[9px] text-slate-500">BLK</div><div className="text-sm font-black text-violet-300">{selectedRosterAthleteAverages?.blk || '0.0'}</div></div>
                                                        <div className="bg-slate-900/80 border border-slate-800 rounded-md py-2"><div className="text-[9px] text-slate-500">TO</div><div className="text-sm font-black text-amber-400">{selectedRosterAthleteAverages?.to || '0.0'}</div></div>
                                                        <div className="bg-slate-900/80 border border-slate-800 rounded-md py-2"><div className="text-[9px] text-slate-500">FG%</div><div className="text-sm font-black text-emerald-400">{selectedRosterAthleteAverages?.fgPct || '0%'}</div></div>
                                                        <div className="bg-slate-900/80 border border-slate-800 rounded-md py-2"><div className="text-[9px] text-slate-500">3P%</div><div className="text-sm font-black text-cyan-400">{selectedRosterAthleteAverages?.fg3Pct || '0%'}</div></div>
                                                        <div className="bg-slate-900/80 border border-slate-800 rounded-md py-2"><div className="text-[9px] text-slate-500">FT%</div><div className="text-sm font-black text-pink-400">{selectedRosterAthleteAverages?.ftPct || '0%'}</div></div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Last Games</div>
                                                <div className="text-[10px] text-slate-500 font-mono">Latest 5</div>
                                            </div>
                                            {selectedRosterAthleteRecentGames && selectedRosterAthleteRecentGames.length > 0 ? (
                                                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/20">
                                                    <table className="w-full min-w-[680px] text-[11px] font-mono text-slate-300">
                                                        <thead>
                                                            <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                                                                <th className="py-2 px-2 text-left">Date</th>
                                                                <th className="py-2 px-2 text-left">Opp</th>
                                                                <th className="py-2 px-2 text-center">Score</th>
                                                                <th className="py-2 px-2 text-center text-orange-400">PTS</th>
                                                                <th className="py-2 px-2 text-center">REB</th>
                                                                <th className="py-2 px-2 text-center">AST</th>
                                                                <th className="py-2 px-2 text-center">STL</th>
                                                                <th className="py-2 px-2 text-center">BLK</th>
                                                                <th className="py-2 px-2 text-center">TO</th>
                                                                <th className="py-2 px-2 text-center text-red-400">PF</th>
                                                                <th className="py-2 px-2 text-center">GP</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800/60">
                                                            {selectedRosterAthleteRecentGames.map((game) => (
                                                                <tr
                                                                    key={`profile-last-game-${game.gameId}`}
                                                                    className="hover:bg-slate-900/30 cursor-pointer"
                                                                    onClick={() => {
                                                                        setActiveTab('history');
                                                                        openHistoryGame(game.gameId);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                                            e.preventDefault();
                                                                            setActiveTab('history');
                                                                            openHistoryGame(game.gameId);
                                                                        }
                                                                    }}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    title="Open game details"
                                                                >
                                                                    <td className="py-2 px-2 text-slate-400 whitespace-nowrap">{game.date || '-'}</td>
                                                                    <td className="py-2 px-2 font-bold text-slate-200 whitespace-nowrap">vs {game.opponentName}</td>
                                                                    <td className="py-2 px-2 text-center text-slate-400 whitespace-nowrap">{selectedRosterTeam.name} {game.teamScore} - {game.opponentScore}</td>
                                                                    <td className="py-2 px-2 text-center font-black text-orange-400">{game.didPlay ? (game.stats?.pts || 0) : '-'}</td>
                                                                    <td className="py-2 px-2 text-center">{game.didPlay ? (game.stats?.reb || 0) : '-'}</td>
                                                                    <td className="py-2 px-2 text-center">{game.didPlay ? (game.stats?.ast || 0) : '-'}</td>
                                                                    <td className="py-2 px-2 text-center">{game.didPlay ? (game.stats?.stl || 0) : '-'}</td>
                                                                    <td className="py-2 px-2 text-center">{game.didPlay ? (game.stats?.blk || 0) : '-'}</td>
                                                                    <td className="py-2 px-2 text-center">{game.didPlay ? (game.stats?.to || 0) : '-'}</td>
                                                                    <td className="py-2 px-2 text-center text-red-400">{game.didPlay ? (game.stats?.pf || 0) : '-'}</td>
                                                                    <td className="py-2 px-2 text-center font-black">
                                                                        {game.didPlay ? (
                                                                            <span className="text-emerald-300">Played</span>
                                                                        ) : (
                                                                            <span className="text-rose-300">DNP</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-500 italic">No completed games recorded for this team yet.</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                <>
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-955 p-4 rounded-xl border border-slate-850">
                                    <div>
                                        <h3 className="text-base font-bold text-white font-sans">Division Rosters</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 text-xs font-bold font-sans">
                                        <button onClick={handleExportRostersOnly} className="bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-slate-300 cursor-pointer">Export Templates</button>
                                        <label className="bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-slate-300 cursor-pointer">Import Templates<input type="file" accept=".json" onChange={handleImportRostersOnly} className="hidden" /></label>
                                        
                                        {/* SMART CSV ROSTER IMPORTER DOCK BUTTON */}
                                        <label className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded cursor-pointer transition-colors">
                                            Import CSV Roster (Sheets)
                                            <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                                        </label>

                                        <button onClick={handleExportData} className="bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-slate-300 cursor-pointer">Export DB</button>
                                        <label className="bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-slate-300 cursor-pointer">Restore DB<input type="file" accept=".json" onChange={handleImportData} className="hidden" /></label>
                                        <label className="bg-slate-900 px-3 py-1.5 rounded border border-slate-855 text-emerald-400 cursor-pointer font-bold">Merge Matches<input type="file" accept=".json" onChange={handleMergeData} className="hidden" /></label>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs font-bold">
                                    {/* Dual-State View mode switch (Averages vs Totals) */}
                                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 gap-0.5">
                                        <button 
                                            onClick={() => setRosterViewMode('averages')} 
                                            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${rosterViewMode === 'averages' ? 'bg-orange-500 text-white shadow' : 'text-slate-400'}`}
                                        >
                                            Per Game (Averages)
                                        </button>
                                        <button 
                                            onClick={() => setRosterViewMode('totals')} 
                                            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${rosterViewMode === 'totals' ? 'bg-orange-500 text-white shadow' : 'text-slate-400'}`}
                                        >
                                            Accumulated Totals
                                        </button>
                                    </div>

                                    <div className="flex gap-2 self-stretch sm:self-auto justify-end">
                                        <button onClick={() => setShowNewTeamModal(true)} className="bg-slate-900 hover:bg-slate-855 text-white px-3 py-2 rounded-xl border border-slate-800 cursor-pointer">Create Team</button>
                                        {canEditPlayers && <button onClick={() => { if (teams.length === 0) return; setSelectedTeamIdForPlayer(teams[0].id); setShowNewPlayerModal(true); }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl cursor-pointer">Add Player</button>}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {teams.map(team => {
                                        const teamStats = compileTeamStatistics(team.players, team.id);
                                        return (
                                            <div key={team.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
                                                <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                                                    <span className="font-extrabold text-xs text-white flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: team.color }} /> {team.name}</span>
                                                    <button onClick={() => handleDeleteTeam(team.id)} className="text-slate-500 hover:text-red-400 cursor-pointer"><Icons.Trash /></button>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left text-[11px] min-w-[950px]">
                                                        {rosterViewMode === 'averages' ? (
                                                            // PER GAME AVERAGES VIEW
                                                            <>
                                                                <thead>
                                                                    <tr className="bg-slate-950/30 text-slate-400 font-mono border-b border-slate-855">
                                                                        <th className="py-2 px-4">No.</th>
                                                                        <th className="py-2 px-4">Name</th>
                                                                        <th className="py-2 px-2 text-center">GP</th>
                                                                        <th className="py-2 px-2 text-center text-orange-400">PPG</th>
                                                                        <th className="py-2 px-2 text-center text-emerald-400 font-bold">FG%</th>
                                                                        <th className="py-2 px-2 text-center text-cyan-400 font-bold">3P%</th>
                                                                        <th className="py-2 px-2 text-center text-pink-400 font-bold">FT%</th>
                                                                        <th className="py-2 px-2 text-center text-emerald-400">RPG</th>
                                                                        <th className="py-2 px-2 text-center text-blue-400">APG</th>
                                                                        <th className="py-2 px-2 text-center text-teal-400">SPG</th>
                                                                        <th className="py-2 px-2 text-center text-violet-400">BPG</th>
                                                                        <th className="py-2 px-2 text-center text-amber-500">TOPG</th>
                                                                        <th className="py-2 px-2 text-center text-red-400">Foul/G</th>
                                                                        {isLoggedIn && <th className="py-2 px-4 text-center">Action</th>}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-850/40 text-slate-300 font-medium font-mono">
                                                                    {team.players.map(p => {
                                                                        const gp = p.gamesPlayed || 0;
                                                                        const avgs = getAverages(p);
                                                                        const isEditingPlayer = editingPlayer && editingPlayer.teamId === team.id && editingPlayer.playerId === p.id;
                                                                        return (
                                                                            <tr key={p.id} className="hover:bg-slate-855/10">
                                                                                <td className="py-2.5 px-4 font-bold text-slate-400">
                                                                                    {isEditingPlayer ? (
                                                                                        <input
                                                                                            type="text"
                                                                                            value={editingPlayer.number}
                                                                                            onChange={(e) => setEditingPlayer({ ...editingPlayer, number: e.target.value })}
                                                                                            className="w-16 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                                                                                        />
                                                                                    ) : (
                                                                                        <>#{p.number}</>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-2.5 px-4 font-bold text-white font-sans">
                                                                                    {isEditingPlayer ? (
                                                                                        <input
                                                                                            type="text"
                                                                                            value={editingPlayer.name}
                                                                                            onChange={(e) => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
                                                                                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-sans"
                                                                                        />
                                                                                    ) : (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setSelectedRosterPlayer({ teamId: team.id, playerId: p.id })}
                                                                                            className="text-left text-white hover:text-cyan-300 underline decoration-dotted decoration-slate-500/50 underline-offset-2 cursor-pointer"
                                                                                        >
                                                                                            {p.name}
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-2.5 px-2 text-center">{gp}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-orange-400">{avgs.pts}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-emerald-400">{avgs.fgPct}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-cyan-400">{avgs.fg3Pct}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-pink-400">{avgs.ftPct}</td>
                                                                                <td className="py-2.5 px-2 text-center text-emerald-300">{avgs.reb}</td>
                                                                                <td className="py-2.5 px-2 text-center text-blue-300">{avgs.ast}</td>
                                                                                <td className="py-2.5 px-2 text-center text-teal-400 font-mono">{avgs.spg}</td>
                                                                                <td className="py-2.5 px-2 text-center text-violet-400 font-mono">{avgs.bpg}</td>
                                                                                <td className="py-2.5 px-2 text-center text-amber-500">{avgs.to}</td>
                                                                                <td className="py-2.5 px-2 text-center text-red-400">{avgs.pf}</td>
                                                                                {isLoggedIn && (
                                                                                    <td className="py-2.5 px-4 text-center">
                                                                                        {isEditingPlayer ? (
                                                                                            <div className="flex items-center justify-center gap-2">
                                                                                                <button onClick={handleSaveEditPlayer} className="text-emerald-400 hover:text-emerald-300 text-[11px] font-bold cursor-pointer">Save</button>
                                                                                                <button onClick={handleCancelEditPlayer} className="text-slate-400 hover:text-slate-200 text-[11px] font-bold cursor-pointer">Cancel</button>
                                                                                            </div>
                                                                                        ) : (
                                                                                            canEditPlayers ? <div className="flex items-center justify-center gap-2">
                                                                                                <button onClick={() => handleStartAdvancedEditPlayer(team.id, p)} className="text-cyan-400 hover:text-cyan-300 p-1 rounded cursor-pointer" title="Advanced profile" aria-label="Advanced profile">
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 9h3M15 13h3M7 16c.8-1.2 2-2 3.5-2s2.7.8 3.5 2"/></svg>
                                                                                                </button>
                                                                                                <button onClick={() => handleStartEditPlayer(team.id, p)} className="text-blue-400 hover:text-blue-300 p-1 rounded cursor-pointer" title="Edit player" aria-label="Edit player">
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                                                                </button>
                                                                                                <button onClick={() => handleDeletePlayer(team.id, p.id)} className="text-slate-500 hover:text-red-400 cursor-pointer"><Icons.Trash /></button>
                                                                                            </div> : <span className="text-slate-600">-</span>
                                                                                        )}
                                                                                    </td>
                                                                                )}
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                    {/* TEAM AVERAGES ROW */}
                                                                    <tr className="bg-slate-950/40 text-white font-sans font-bold border-t border-slate-700/80">
                                                                        <td className="py-3 px-4 font-mono text-slate-450">-</td>
                                                                        <td className="py-3 px-4 text-amber-400 tracking-wider font-extrabold text-[12px] uppercase">Team Averages</td>
                                                                        <td className="py-3 px-2 text-center font-mono">{teamStats.totals.gp}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-orange-400">{teamStats.avgs.pts}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-emerald-400">{teamStats.shooters.fgPct}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-cyan-400">{teamStats.shooters.fg3Pct}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-pink-400">{teamStats.shooters.ftPct}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-emerald-300">{teamStats.avgs.reb}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-blue-300">{teamStats.avgs.ast}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-teal-400">{teamStats.avgs.stl}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-violet-400">{teamStats.avgs.blk}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-amber-500">{teamStats.avgs.to}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-red-400">{teamStats.avgs.pf}</td>
                                                                        {isLoggedIn && <td className="py-3 px-4 text-center font-mono">-</td>}
                                                                    </tr>
                                                                </tbody>
                                                            </>
                                                        ) : (
                                                            // ACCUMULATED TOTALS VIEW
                                                            <>
                                                                <thead>
                                                                    <tr className="bg-slate-950/30 text-slate-400 font-mono border-b border-slate-855">
                                                                        <th className="py-2 px-4">No.</th>
                                                                        <th className="py-2 px-4">Name</th>
                                                                        <th className="py-2 px-2 text-center">GP</th>
                                                                        <th className="py-2 px-2 text-center text-orange-400">PTS</th>
                                                                        <th className="py-2 px-2 text-center text-emerald-400 font-bold">FG (M/A)</th>
                                                                        <th className="py-2 px-2 text-center text-cyan-400 font-bold">3P (M/A)</th>
                                                                        <th className="py-2 px-2 text-center text-pink-400 font-bold">FT (M/A)</th>
                                                                        <th className="py-2 px-2 text-center text-emerald-400">REB</th>
                                                                        <th className="py-2 px-2 text-center text-blue-400">AST</th>
                                                                        <th className="py-2 px-2 text-center text-teal-400">STL</th>
                                                                        <th className="py-2 px-2 text-center text-violet-400">BLK</th>
                                                                        <th className="py-2 px-2 text-center text-amber-500">TO</th>
                                                                        <th className="py-2 px-2 text-center text-red-400">PF</th>
                                                                        {isLoggedIn && <th className="py-2 px-4 text-center">Action</th>}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-850/40 text-slate-300 font-medium font-mono">
                                                                    {team.players.map(p => {
                                                                        const gp = p.gamesPlayed || 0;
                                                                        const ts = p.totalStats || {};
                                                                        const fgMade = (ts.fg2m || 0) + (ts.fg3m || 0);
                                                                        const fgAtt = fgMade + (ts.fg2m_miss || 0) + (ts.fg3m_miss || 0);
                                                                        const fg3Att = (ts.fg3m || 0) + (ts.fg3m_miss || 0);
                                                                        const ftAtt = (ts.ftm || 0) + (ts.ft_miss || 0);
                                                                        const isEditingPlayer = editingPlayer && editingPlayer.teamId === team.id && editingPlayer.playerId === p.id;

                                                                        return (
                                                                            <tr key={p.id} className="hover:bg-slate-855/10">
                                                                                <td className="py-2.5 px-4 font-bold text-slate-400">
                                                                                    {isEditingPlayer ? (
                                                                                        <input
                                                                                            type="text"
                                                                                            value={editingPlayer.number}
                                                                                            onChange={(e) => setEditingPlayer({ ...editingPlayer, number: e.target.value })}
                                                                                            className="w-16 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono"
                                                                                        />
                                                                                    ) : (
                                                                                        <>#{p.number}</>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-2.5 px-4 font-bold text-white font-sans">
                                                                                    {isEditingPlayer ? (
                                                                                        <input
                                                                                            type="text"
                                                                                            value={editingPlayer.name}
                                                                                            onChange={(e) => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
                                                                                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-sans"
                                                                                        />
                                                                                    ) : (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setSelectedRosterPlayer({ teamId: team.id, playerId: p.id })}
                                                                                            className="text-left text-white hover:text-cyan-300 underline decoration-dotted decoration-slate-500/50 underline-offset-2 cursor-pointer"
                                                                                        >
                                                                                            {p.name}
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-2.5 px-2 text-center">{gp}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-orange-400">{ts.pts || 0}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-emerald-400">{fgMade}/{fgAtt}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-cyan-400">{ts.fg3m || 0}/{fg3Att}</td>
                                                                                <td className="py-2.5 px-2 text-center font-bold text-pink-400">{ts.ftm || 0}/{ftAtt}</td>
                                                                                <td className="py-2.5 px-2 text-center text-emerald-300">{ts.reb || 0}</td>
                                                                                <td className="py-2.5 px-2 text-center text-blue-300">{ts.ast || 0}</td>
                                                                                <td className="py-2.5 px-2 text-center text-teal-400 font-mono">{ts.stl || 0}</td>
                                                                                <td className="py-2.5 px-2 text-center text-violet-400 font-mono">{ts.blk || 0}</td>
                                                                                <td className="py-2.5 px-2 text-center text-amber-500">{ts.to || 0}</td>
                                                                                <td className="py-2.5 px-2 text-center text-red-400">{ts.pf || 0}</td>
                                                                                {isLoggedIn && (
                                                                                    <td className="py-2.5 px-4 text-center">
                                                                                        {isEditingPlayer ? (
                                                                                            <div className="flex items-center justify-center gap-2">
                                                                                                <button onClick={handleSaveEditPlayer} className="text-emerald-400 hover:text-emerald-300 text-[11px] font-bold cursor-pointer">Save</button>
                                                                                                <button onClick={handleCancelEditPlayer} className="text-slate-400 hover:text-slate-200 text-[11px] font-bold cursor-pointer">Cancel</button>
                                                                                            </div>
                                                                                        ) : (
                                                                                            canEditPlayers ? <div className="flex items-center justify-center gap-2">
                                                                                                <button onClick={() => handleStartAdvancedEditPlayer(team.id, p)} className="text-cyan-400 hover:text-cyan-300 p-1 rounded cursor-pointer" title="Advanced profile" aria-label="Advanced profile">
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 9h3M15 13h3M7 16c.8-1.2 2-2 3.5-2s2.7.8 3.5 2"/></svg>
                                                                                                </button>
                                                                                                <button onClick={() => handleStartEditPlayer(team.id, p)} className="text-blue-400 hover:text-blue-300 p-1 rounded cursor-pointer" title="Edit player" aria-label="Edit player">
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                                                                </button>
                                                                                                <button onClick={() => handleDeletePlayer(team.id, p.id)} className="text-slate-500 hover:text-red-400 cursor-pointer"><Icons.Trash /></button>
                                                                                            </div> : <span className="text-slate-600">-</span>
                                                                                        )}
                                                                                    </td>
                                                                                )}
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                    {/* TEAM TOTALS ROW */}
                                                                    <tr className="bg-slate-955/60 text-white font-sans font-bold border-t border-slate-700/80">
                                                                        <td className="py-3 px-4 font-mono text-slate-450">-</td>
                                                                        <td className="py-3 px-4 text-emerald-450 tracking-wider font-extrabold text-[12px] uppercase">Team Totals</td>
                                                                        <td className="py-3 px-2 text-center font-mono">-</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-orange-400">{teamStats.totals.pts}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-emerald-400">
                                                                            {teamStats.totals.fg2m + teamStats.totals.fg3m}/
                                                                            {(teamStats.totals.fg2m + teamStats.totals.fg3m + teamStats.totals.fg2m_miss + teamStats.totals.fg3m_miss)}
                                                                        </td>
                                                                        <td className="py-3 px-2 text-center font-mono text-cyan-400">
                                                                            {teamStats.totals.fg3m}/
                                                                            {(teamStats.totals.fg3m + teamStats.totals.fg3m_miss)}
                                                                        </td>
                                                                        <td className="py-3 px-2 text-center font-mono text-pink-400">
                                                                            {teamStats.totals.ftm}/
                                                                            {(teamStats.totals.ftm + teamStats.totals.ft_miss)}
                                                                        </td>
                                                                        <td className="py-3 px-2 text-center font-mono text-emerald-300">{teamStats.totals.reb}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-blue-300">{teamStats.totals.ast}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-teal-400">{teamStats.totals.stl}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-violet-400">{teamStats.totals.blk}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-amber-500">{teamStats.totals.to}</td>
                                                                        <td className="py-3 px-2 text-center font-mono text-red-400">{teamStats.totals.pf}</td>
                                                                        {isLoggedIn && <td className="py-3 px-4 text-center font-mono">-</td>}
                                                                    </tr>
                                                                </tbody>
                                                            </>
                                                        )}
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                </>
                                )}
                            </div>
                        )}

                        {/* TAB: TEAM STANDINGS */}
                        {activeTab === 'standings' && (
                            <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <h3 className="text-xl font-bold text-white font-sans">Team Standings</h3>
                                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 gap-0.5 w-fit">
                                        <button
                                            onClick={() => setStandingsStatMode('totals')}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${standingsStatMode === 'totals' ? 'bg-orange-500 text-white shadow' : 'text-slate-400'}`}
                                        >
                                            Accumulated
                                        </button>
                                        <button
                                            onClick={() => setStandingsStatMode('perGame')}
                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${standingsStatMode === 'perGame' ? 'bg-orange-500 text-white shadow' : 'text-slate-400'}`}
                                        >
                                            Per Game
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400">Ordered by wins, then quotient ($pointsFor / pointsAgainst$) for tie-breaking. Points columns and stat leaders follow the selected mode.</p>

                                {games.length === 0 ? (
                                    <p className="text-center py-8 text-xs text-slate-500 italic bg-slate-900 rounded-xl border border-slate-800">No completed games yet. Standings will appear once games are logged.</p>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-[760px] text-xs font-mono">
                                                    <thead>
                                                        <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                                                            <th className="py-2.5 px-3 text-left">Rank</th>
                                                            <th className="py-2.5 px-3 text-left">Team</th>
                                                            <th className="py-2.5 px-3 text-center">W</th>
                                                            <th className="py-2.5 px-3 text-center">L</th>
                                                            <th className="py-2.5 px-3 text-center">{standingsStatMode === 'perGame' ? 'PPG' : 'PF'}</th>
                                                            <th className="py-2.5 px-3 text-center">{standingsStatMode === 'perGame' ? 'PAPG' : 'PA'}</th>
                                                            <th className="py-2.5 px-3 text-center">Quotient</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/20 text-slate-200">
                                                        {teamStandings.map((row, idx) => (
                                                            <tr key={`standings-${row.id}`} className="hover:bg-slate-855/20">
                                                                <td className="py-2.5 px-3 font-black text-orange-300">#{idx + 1}</td>
                                                                <td className="py-2.5 px-3 font-bold">
                                                                    <span className="inline-flex items-center gap-2">
                                                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color || '#94a3b8' }} />
                                                                        {row.name}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center font-black text-emerald-400">{row.wins}</td>
                                                                <td className="py-2.5 px-3 text-center font-black text-red-400">{row.losses}</td>
                                                                <td className="py-2.5 px-3 text-center">{standingsStatMode === 'perGame' ? ((row.pointsFor / Math.max(1, row.gamesPlayed || 0)).toFixed(1)) : row.pointsFor}</td>
                                                                <td className="py-2.5 px-3 text-center">{standingsStatMode === 'perGame' ? ((row.pointsAgainst / Math.max(1, row.gamesPlayed || 0)).toFixed(1)) : row.pointsAgainst}</td>
                                                                <td className="py-2.5 px-3 text-center font-black text-cyan-300">{Number.isFinite(row.quotient) ? row.quotient.toFixed(3) : 'INF'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                            <div className="px-3 py-2 border-b border-slate-800 bg-slate-950/80">
                                                <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-300">Stat Leaders By Team</h4>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-[760px] text-xs font-mono">
                                                    <thead>
                                                        <tr className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                                                            <th className="py-2.5 px-3 text-left">Stat</th>
                                                            <th className="py-2.5 px-3 text-left">Leading Team</th>
                                                            <th className="py-2.5 px-3 text-right">{standingsStatMode === 'perGame' ? 'Per Game' : 'Total'}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/60 bg-slate-950/20 text-slate-200">
                                                        {statCategoryLeaders.map((row) => (
                                                            <tr key={`category-team-leader-${row.id}`} className="hover:bg-slate-855/20">
                                                                <td className="py-2.5 px-3 font-black text-orange-300">{row.label}</td>
                                                                <td className="py-2.5 px-3 font-bold whitespace-nowrap">
                                                                    <span className="inline-flex items-center gap-2">
                                                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.teamColor }} />
                                                                        {row.teamName}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-right font-black text-cyan-300">{row.value.toFixed(1)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TAB 3: MATCH HISTORY - SEPARATED BY TEAM WITH COMPREHENSIVE STATS */}
                        {activeTab === 'history' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-bold text-white font-sans">Game Summary Browser</h3>
                                    <p className="text-xs text-slate-400">{selectedHistoryGameId ? 'Focused game detail view.' : 'Select a game below to open the detailed summary box score.'}</p>
                                </div>

                                {!selectedHistoryGameId && (
                                <div className="bg-slate-900/65 rounded-2xl border border-slate-800 p-4 shadow-2xl">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
                                        <h4 className="text-sm font-extrabold text-white uppercase tracking-wide">History</h4>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-400 font-mono">{homepageGameSummaries.length} game(s)</span>
                                            <button onClick={handleExportGamesCSV} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer">Export CSV</button>
                                        </div>
                                    </div>

                                    {homepageGameSummaries.length === 0 ? (
                                        <p className="text-xs text-slate-500 italic text-center py-6">No games yet. Start and finish a match to record your first result.</p>
                                    ) : (
                                        <div className="space-y-2 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
                                            {homepageGameSummaries.map((game) => {
                                                const winner = game.homeScore === game.awayScore
                                                    ? 'Draw'
                                                    : (game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam);
                                                const isSelected = selectedHistoryGameId === game.id;

                                                return (
                                                    <button
                                                        type="button"
                                                        key={game.id}
                                                        onClick={() => {
                                                            if (game.status === 'LIVE') {
                                                                setActiveTab('live');
                                                                showToast('Opened active game. Continue adding stats from Games.', 'info');
                                                                return;
                                                            }
                                                            openHistoryGame(game.id);
                                                        }}
                                                        className={`w-full text-left bg-slate-950/60 border rounded-xl p-3 cursor-pointer transition-colors ${isSelected ? 'border-orange-400/70' : 'border-slate-800 hover:border-orange-400/60'}`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${game.status === 'LIVE' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'}`}>
                                                                {game.status}
                                                            </span>
                                                            <span className="text-[10px] text-slate-500 font-mono truncate">{game.date}</span>
                                                        </div>
                                                        <div className="mt-2 text-sm font-extrabold text-white">
                                                            {game.homeTeam} <span className="text-orange-400">{game.homeScore}</span>
                                                            <span className="text-slate-500 font-mono text-xs mx-1">vs</span>
                                                            {game.awayTeam} <span className="text-orange-400">{game.awayScore}</span>
                                                        </div>
                                                        <div className="mt-1 text-[11px] text-slate-400">
                                                            Home: {game.homeTeam} | Away: {game.awayTeam} | Winner: <span className="text-slate-300 font-bold">{winner}</span>
                                                        </div>
                                                        {game.status === 'ENDED' && game.writeupSnippet ? (
                                                            <div className="mt-1.5 text-[11px] text-slate-500 italic line-clamp-2">
                                                                {game.writeupSnippet}{game.writeupSnippet.length >= 140 ? '...' : ''}
                                                            </div>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                )}

                                {selectedHistoryGameId && (
                                    <div className="bg-slate-900/65 rounded-2xl border border-slate-800 p-3 shadow-2xl flex items-center justify-between gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedHistoryGameId(null)}
                                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-bold cursor-pointer"
                                        >
                                            Back to Game List
                                        </button>
                                        <span className="text-[10px] text-slate-400 font-mono">Detail mode</span>
                                    </div>
                                )}

                                {!selectedHistoryGameId ? (
                                    <p className="text-center py-8 text-xs text-slate-500 italic bg-slate-900 rounded-xl border border-slate-800">Pick a finished game from History to view details.</p>
                                ) : games.length === 0 ? (
                                    <p className="text-center py-12 text-xs text-slate-500 italic bg-slate-900 rounded-xl border border-slate-800">No official game box scores archived yet.</p>
                                ) : !selectedHistoryGame ? (
                                    <p className="text-center py-8 text-xs text-slate-500 italic bg-slate-900 rounded-xl border border-slate-800">Selected game is still live and has no detailed box score yet.</p>
                                ) : (
                                    [selectedHistoryGame].map(game => {
                                        const teamAObj = teams.find(t => t.id === game.teamAId);
                                        const teamBObj = teams.find(t => t.id === game.teamBId);
                                        const teamATotals = summarizeGameTeamStats(teamAObj, game);
                                        const teamBTotals = summarizeGameTeamStats(teamBObj, game);
                                        const quarterStats = computeQuarterTeamStatsFromLog(game.gameLog || []);
                                        const playerOfTheGame = getPlayerOfTheGame(game, teamAObj, teamBObj);
                                        const topTeamAPerformers = getTopTeamPerformers(teamAObj, game, 3);
                                        const topTeamBPerformers = getTopTeamPerformers(teamBObj, game, 3);
                                        const teamALeaders = getGameTeamLeaders(teamAObj, game);
                                        const teamBLeaders = getGameTeamLeaders(teamBObj, game);
                                        const videoEmbedUrl = getYouTubeEmbedUrl(game.youtubeUrl || '');
                                        const tabButtons = [
                                            ...(playerOfTheGame ? [{ id: 'potg', label: 'POTG' }] : []),
                                            { id: 'scoring', label: 'Scoring' },
                                            { id: 'comparison', label: 'Comparison' },
                                            { id: 'leaders', label: 'Leaders' },
                                            { id: 'home', label: game.teamAName },
                                            { id: 'away', label: game.teamBName },
                                            { id: 'video', label: 'Video' },
                                            { id: 'pbp', label: 'Play-by-Play' }
                                        ];

                                        return (
                                            <div key={game.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-4 space-y-4">
                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-950 p-3.5 rounded-xl border border-slate-855 gap-2">
                                                    <div>
                                                        <span className="font-extrabold text-xl md:text-2xl text-white block leading-tight">
                                                            {game.teamAName} <span className="text-orange-400 text-2xl md:text-3xl mx-1">{game.teamAScore}</span>
                                                            <span className="text-slate-500 font-mono text-sm md:text-base mx-1 align-middle">vs</span>
                                                            {game.teamBName} <span className="text-orange-400 text-2xl md:text-3xl mx-1">{game.teamBScore}</span>
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">Match ID: {game.id}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
                                                        <span className="font-mono text-xs font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">{game.date}</span>
                                                        
                                                        {/* EDIT SYSTEM INITIATOR TRIGGER BUTTON */}
                                                        <button 
                                                            onClick={() => {
                                                                setEditingGame(game);
                                                                setEditStatsTemp(JSON.parse(JSON.stringify(game.playerStats)));
                                                                setExpandedEditPlayerId(null);
                                                            }}
                                                            className="px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 font-bold text-xs rounded-lg cursor-pointer transition-colors"
                                                        >
                                                            Edit Box Score
                                                        </button>

                                                        {/* DELETE GAME RECORD BUTTON */}
                                                        <button 
                                                            onClick={() => handleDeleteGame(game.id)}
                                                            className="p-2 bg-red-650/10 hover:bg-red-650/20 border border-red-500/30 text-red-400 rounded-lg cursor-pointer transition-all duration-200"
                                                            title="Delete Game Record"
                                                        >
                                                            <Icons.Trash />
                                                        </button>
                                                    </div>
                                                </div>

                                                {(canOperateLive || String(game.gameWriteup || '').trim()) && (
                                                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-300">Game Recap</h5>
                                                            <span className="text-[10px] text-slate-500">Recap and key moments</span>
                                                        </div>

                                                        {canOperateLive ? (
                                                            <>
                                                                <textarea
                                                                    value={historyWriteupInput}
                                                                    onChange={(e) => setHistoryWriteupInput(e.target.value)}
                                                                    placeholder="Add a quick game recap..."
                                                                    rows={4}
                                                                    className="w-full resize-y bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleGenerateGameWriteup({ game, teamAObj, teamBObj, playerOfTheGame, topTeamAPerformers, topTeamBPerformers })}
                                                                        disabled={generatingWriteupGameId === game.id}
                                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                                                    >
                                                                        {generatingWriteupGameId === game.id ? 'Generating...' : 'Generate Recap'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSaveGameWriteup(game.id)}
                                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                                                                    >
                                                                        Save Recap
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                                                                {game.gameWriteup}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2 flex flex-wrap gap-2">
                                                    {tabButtons.map((tab) => (
                                                        <button
                                                            key={tab.id}
                                                            type="button"
                                                            onClick={() => setHistoryDetailTab(tab.id)}
                                                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${historyDetailTab === tab.id ? 'bg-orange-500/20 text-orange-300 border-orange-400/60' : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500'}`}
                                                        >
                                                            {tab.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                {historyDetailTab === 'video' && (
                                                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-3">
                                                        {canOperateLive && (
                                                            <div className="flex flex-col md:flex-row md:items-end gap-2">
                                                                <div className="flex-1">
                                                                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">YouTube Game Video</label>
                                                                    <input
                                                                        type="url"
                                                                        value={historyVideoInput}
                                                                        onChange={(e) => setHistoryVideoInput(e.target.value)}
                                                                        placeholder="https://www.youtube.com/watch?v=..."
                                                                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSaveGameVideoLink(game.id)}
                                                                    className="px-3 py-2 rounded-lg text-xs font-bold border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                                                                >
                                                                    Save Video Link
                                                                </button>
                                                            </div>
                                                        )}

                                                        {videoEmbedUrl ? (
                                                            <div className="rounded-xl overflow-hidden border border-slate-800 bg-black">
                                                                <iframe
                                                                    src={videoEmbedUrl}
                                                                    title={`Game video ${game.id}`}
                                                                    className="w-full aspect-video"
                                                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                                    allowFullScreen
                                                                />
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-slate-500">No video attached for this game yet.</p>
                                                        )}
                                                    </div>
                                                )}

                                                {/* PLAYER OF THE GAME */}
                                                {historyDetailTab === 'potg' && playerOfTheGame && (
                                                    <div className="space-y-3">
                                                        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                            <div>
                                                                <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-1">Player of the Game</div>
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-11 h-11 rounded-full overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center shrink-0">
                                                                        {playerOfTheGame.pictureUrl ? (
                                                                            <img src={playerOfTheGame.pictureUrl} alt={playerOfTheGame.name} className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <span className="text-sm font-black text-slate-200 font-mono">{(playerOfTheGame.name || '?').slice(0, 1).toUpperCase()}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-sm font-extrabold text-white">
                                                                        #{playerOfTheGame.number} {playerOfTheGame.name}
                                                                        <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full border" style={{ color: playerOfTheGame.teamColor || '#fff', borderColor: `${playerOfTheGame.teamColor || '#fff'}55` }}>
                                                                            {playerOfTheGame.teamName}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-[11px] text-slate-400 mt-1">PER-style game rating {Number(playerOfTheGame.perScore || 0).toFixed(1)} based on scoring efficiency, playmaking, defense, and possession impact.</div>
                                                            </div>
                                                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 font-mono text-slate-300">
                                                                <div className="bg-slate-900/80 border border-slate-800 rounded-md px-2.5 py-1.5 text-center min-h-[52px] h-full flex flex-col justify-between">
                                                                    <div className="text-[9px] uppercase tracking-wider font-bold leading-none text-slate-400">PTS</div>
                                                                    <div className="mt-1 font-mono font-black text-lg md:text-xl leading-none text-white">{playerOfTheGame.stats.pts || 0}</div>
                                                                </div>
                                                                <div className="bg-slate-900/80 border border-slate-800 rounded-md px-2.5 py-1.5 text-center min-h-[52px] h-full flex flex-col justify-between">
                                                                    <div className="text-[9px] uppercase tracking-wider font-bold leading-none text-slate-400">REB</div>
                                                                    <div className="mt-1 font-mono font-black text-lg md:text-xl leading-none text-white">{playerOfTheGame.stats.reb || 0}</div>
                                                                </div>
                                                                <div className="bg-slate-900/80 border border-slate-800 rounded-md px-2.5 py-1.5 text-center min-h-[52px] h-full flex flex-col justify-between">
                                                                    <div className="text-[9px] uppercase tracking-wider font-bold leading-none text-slate-400">AST</div>
                                                                    <div className="mt-1 font-mono font-black text-lg md:text-xl leading-none text-white">{playerOfTheGame.stats.ast || 0}</div>
                                                                </div>
                                                                <div className="bg-slate-900/80 border border-slate-800 rounded-md px-2.5 py-1.5 text-center min-h-[52px] h-full flex flex-col justify-between">
                                                                    <div className="text-[9px] uppercase tracking-wider font-bold leading-none text-slate-400">STL</div>
                                                                    <div className="mt-1 font-mono font-black text-lg md:text-xl leading-none text-white">{playerOfTheGame.stats.stl || 0}</div>
                                                                </div>
                                                                <div className="bg-slate-900/80 border border-slate-800 rounded-md px-2.5 py-1.5 text-center min-h-[52px] h-full flex flex-col justify-between">
                                                                    <div className="text-[9px] uppercase tracking-wider font-bold leading-none text-slate-400">BLK</div>
                                                                    <div className="mt-1 font-mono font-black text-lg md:text-xl leading-none text-white">{playerOfTheGame.stats.blk || 0}</div>
                                                                </div>
                                                                <div className="bg-slate-900/80 border border-slate-800 rounded-md px-2.5 py-1.5 text-center min-h-[52px] h-full flex flex-col justify-between">
                                                                    <div className="text-[9px] uppercase tracking-wider font-bold leading-none text-slate-400">TO</div>
                                                                    <div className="mt-1 font-mono font-black text-lg md:text-xl leading-none text-white">{playerOfTheGame.stats.to || 0}</div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-slate-950/35 border border-slate-800/60 rounded-xl p-3">
                                                            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Top Performers Boxscore</div>
                                                            {(() => {
                                                                const mergedTopPerformers = [...(topTeamAPerformers || []), ...(topTeamBPerformers || [])]
                                                                    .map((entry) => ({
                                                                        ...entry,
                                                                        teamName: teamAObj?.players?.some((player) => player.id === entry.id)
                                                                            ? game.teamAName
                                                                            : game.teamBName,
                                                                        teamColor: teamAObj?.players?.some((player) => player.id === entry.id)
                                                                            ? (teamAObj?.color || '#10b981')
                                                                            : (teamBObj?.color || '#ef4444')
                                                                    }))
                                                                    .sort((a, b) => Number(b.perScore || 0) - Number(a.perScore || 0) || Number(b.stats?.pts || 0) - Number(a.stats?.pts || 0));

                                                                return (
                                                                    <div className="overflow-x-auto rounded-xl border border-slate-850 bg-slate-950/20">
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-left text-xs min-w-[980px]">
                                                                                <thead>
                                                                                    <tr className="bg-slate-950/80 text-slate-400 font-mono text-[10px] border-b border-slate-800">
                                                                                        <th className="py-2.5 px-2 text-center">#</th>
                                                                                        <th className="py-2.5 px-3">Player</th>
                                                                                        <th className="py-2.5 px-2 text-center">Team</th>
                                                                                        <th className="py-2.5 px-2 text-center text-orange-400">PTS</th>
                                                                                        <th className="py-2.5 px-2 text-center text-emerald-400 font-bold">FG%</th>
                                                                                        <th className="py-2.5 px-2 text-center text-cyan-400 font-bold">3P%</th>
                                                                                        <th className="py-2.5 px-2 text-center text-pink-400 font-bold">FT%</th>
                                                                                        <th className="py-2.5 px-2 text-center text-emerald-400">REB</th>
                                                                                        <th className="py-2.5 px-2 text-center text-blue-400">AST</th>
                                                                                        <th className="py-2.5 px-2 text-center text-teal-400">STL</th>
                                                                                        <th className="py-2.5 px-2 text-center text-violet-400">BLK</th>
                                                                                        <th className="py-2.5 px-2 text-center text-amber-500">TO</th>
                                                                                        <th className="py-2.5 px-2 text-center text-red-400">PF</th>
                                                                                        <th className="py-2.5 px-2 text-center text-slate-200">PER</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody className="divide-y divide-slate-800/60 bg-slate-950/20 font-medium font-mono text-slate-300">
                                                                                    {mergedTopPerformers.length === 0 ? (
                                                                                        <tr>
                                                                                            <td className="py-2 px-2 text-slate-600 italic" colSpan={14}>No qualifying performers</td>
                                                                                        </tr>
                                                                                    ) : mergedTopPerformers.map((entry, idx) => {
                                                                                        const shooting = computeShootingPercentages(entry.stats || {});
                                                                                        return (
                                                                                            <tr key={`potg-top-merged-${entry.id}`} className="hover:bg-slate-855/20">
                                                                                                <td className="py-2 px-2 text-center font-bold text-slate-500">#{idx + 1}</td>
                                                                                                <td className="py-2 px-3 text-white font-bold font-sans">
                                                                                                    <span className="text-slate-500 font-mono mr-1.5 text-[10px]">#{entry.number}</span>
                                                                                                    {entry.name}
                                                                                                </td>
                                                                                                <td className="py-2 px-2 text-center">
                                                                                                    <span className="inline-flex px-1.5 py-0.5 rounded border text-[10px] font-black uppercase tracking-wide" style={{ color: entry.teamColor, borderColor: `${entry.teamColor}66`, backgroundColor: `${entry.teamColor}12` }}>
                                                                                                        {entry.teamName}
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td className="py-2 px-2 text-center text-orange-400 font-black">{entry.stats?.pts || 0}</td>
                                                                                                <td className="py-2 px-2 text-center text-emerald-400 font-bold">{shooting.fgPct}</td>
                                                                                                <td className="py-2 px-2 text-center text-cyan-400 font-bold">{shooting.fg3Pct}</td>
                                                                                                <td className="py-2 px-2 text-center text-pink-400 font-bold">{shooting.ftPct}</td>
                                                                                                <td className="py-2 px-2 text-center text-emerald-400">{entry.stats?.reb || 0}</td>
                                                                                                <td className="py-2 px-2 text-center text-blue-400">{entry.stats?.ast || 0}</td>
                                                                                                <td className="py-2 px-2 text-center text-teal-400 font-mono">{entry.stats?.stl || 0}</td>
                                                                                                <td className="py-2 px-2 text-center text-violet-400 font-mono">{entry.stats?.blk || 0}</td>
                                                                                                <td className="py-2 px-2 text-center text-amber-500 font-mono">{entry.stats?.to || 0}</td>
                                                                                                <td className="py-2 px-2 text-center text-red-400 font-mono">{entry.stats?.pf || 0}</td>
                                                                                                <td className="py-2 px-2 text-center font-black text-slate-100">{Number(entry.perScore || 0).toFixed(1)}</td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}

                                                {historyDetailTab === 'leaders' && (
                                                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-3">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Top Performers</h4>
                                                            <span className="text-[10px] text-slate-500 font-mono">Best single-game outputs by team</span>
                                                        </div>
                                                        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 md:p-4 space-y-4">
                                                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
                                                                <span className="text-right" style={{ color: teamAObj?.color || '#10b981' }}>{game.teamAName}</span>
                                                                <span className="text-slate-500">Leader</span>
                                                                <span style={{ color: teamBObj?.color || '#ef4444' }}>{game.teamBName}</span>
                                                            </div>
                                                            <div className="rounded-xl border border-slate-800/70 overflow-hidden">
                                                            {[
                                                                ['PTS', teamALeaders.find((item) => item.label === 'PTS'), teamBLeaders.find((item) => item.label === 'PTS')],
                                                                ['REB', teamALeaders.find((item) => item.label === 'REB'), teamBLeaders.find((item) => item.label === 'REB')],
                                                                ['AST', teamALeaders.find((item) => item.label === 'AST'), teamBLeaders.find((item) => item.label === 'AST')],
                                                                ['STL', teamALeaders.find((item) => item.label === 'STL'), teamBLeaders.find((item) => item.label === 'STL')],
                                                                ['BLK', teamALeaders.find((item) => item.label === 'BLK'), teamBLeaders.find((item) => item.label === 'BLK')],
                                                                ['TO', teamALeaders.find((item) => item.label === 'TO'), teamBLeaders.find((item) => item.label === 'TO')]
                                                            ].map(([label, teamALeader, teamBLeader]) => {
                                                                const aValue = Number(teamALeader?.value || 0);
                                                                const bValue = Number(teamBLeader?.value || 0);
                                                                const aLeaders = teamALeader?.leaders || [];
                                                                const bLeaders = teamBLeader?.leaders || [];
                                                                const hasALeader = aValue > 0;
                                                                const hasBLeader = bValue > 0;
                                                                if (!hasALeader && !hasBLeader) return null;
                                                                const totalValue = Math.max(aValue + bValue, 1);
                                                                const aWidth = `${Math.min(100, (aValue / totalValue) * 100)}%`;
                                                                const bWidth = `${Math.min(100, (bValue / totalValue) * 100)}%`;
                                                                return (
                                                                    <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-0 overflow-hidden border-b border-slate-800 last:border-b-0 font-mono bg-slate-950/45">
                                                                        <div className="relative min-w-0 overflow-hidden border-r border-slate-800 px-3 py-2">
                                                                            <div className="pointer-events-none absolute inset-0 flex justify-end">
                                                                                <div className="h-full leader-bg-fill leader-bg-fill-left border-b" style={{ width: aWidth, backgroundColor: `${teamAObj?.color || '#10b981'}0c`, borderBottomColor: `${teamAObj?.color || '#10b981'}aa` }} />
                                                                            </div>
                                                                            <div className="relative z-10 grid grid-cols-[1fr_auto] items-center gap-3">
                                                                                <div className="min-w-0 text-right">
                                                                                    <div className="hidden lg:flex mt-1 flex-wrap justify-end gap-x-1.5 gap-y-0.5 leading-tight">
                                                                                        {hasALeader ? aLeaders.map((leader, index) => (
                                                                                            <React.Fragment key={`leader-a-name-${label}-${leader.id}`}>
                                                                                                {index > 0 ? <span className="text-[10px] font-bold text-slate-600">/</span> : null}
                                                                                                <span className="text-[10px] font-bold text-slate-400">{`#${leader.number} ${leader.name}`}</span>
                                                                                            </React.Fragment>
                                                                                        )) : null}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="shrink-0 flex items-center justify-end gap-2">
                                                                                    <div className="flex items-center -space-x-2">
                                                                                        {hasALeader ? aLeaders.slice(0, 2).map((leader) => (
                                                                                            <span key={`leader-a-${label}-${leader.id}`} className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-500 bg-slate-950 shadow-[0_0_18px_rgba(15,23,42,0.65)] flex items-center justify-center">
                                                                                                {leader.pictureUrl ? (
                                                                                                    <img src={leader.pictureUrl} alt={leader.name} className="w-full h-full object-cover" />
                                                                                                ) : (
                                                                                                    <span className="text-xs font-black text-slate-200">{(leader.name || '?').slice(0, 1).toUpperCase()}</span>
                                                                                                )}
                                                                                            </span>
                                                                                        )) : (
                                                                                            <span className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-500 bg-slate-950 shadow-[0_0_18px_rgba(15,23,42,0.65)] flex items-center justify-center text-xs font-black text-slate-500">-</span>
                                                                                        )}
                                                                                        {hasALeader && aLeaders.length > 2 ? (
                                                                                            <span className="w-6 h-6 rounded-full border border-slate-600 bg-slate-900 text-[9px] font-black text-slate-200 flex items-center justify-center">+{aLeaders.length - 2}</span>
                                                                                        ) : null}
                                                                                    </div>
                                                                                    <span className="w-11 h-11 rounded-full border-2 border-slate-400 bg-slate-900/90 text-slate-100 text-base md:text-lg leading-none font-black flex items-center justify-center shadow-[0_0_18px_rgba(15,23,42,0.55)]">{hasALeader ? teamALeader.value : '-'}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <span className="inline-flex h-full flex-col items-center justify-center border-r border-slate-800 bg-slate-950/85 px-2 py-1.5 gap-1">
                                                                            <span className="inline-flex min-w-[34px] items-center justify-center text-[9px] leading-none font-black tracking-wide text-slate-100">{label}</span>
                                                                        </span>

                                                                        <div className="relative min-w-0 overflow-hidden px-3 py-2">
                                                                            <div className="pointer-events-none absolute inset-0">
                                                                                <div className="h-full leader-bg-fill leader-bg-fill-right border-b" style={{ width: bWidth, backgroundColor: `${teamBObj?.color || '#ef4444'}0c`, borderBottomColor: `${teamBObj?.color || '#ef4444'}aa` }} />
                                                                            </div>
                                                                            <div className="relative z-10 grid grid-cols-[auto_1fr] items-center gap-3">
                                                                                <div className="shrink-0 flex items-center justify-start gap-2">
                                                                                    <span className="w-11 h-11 rounded-full border-2 border-slate-400 bg-slate-900/90 text-slate-100 text-base md:text-lg leading-none font-black flex items-center justify-center shadow-[0_0_18px_rgba(15,23,42,0.55)]">{hasBLeader ? teamBLeader.value : '-'}</span>
                                                                                    <div className="flex items-center -space-x-2">
                                                                                        {hasBLeader ? bLeaders.slice(0, 2).map((leader) => (
                                                                                            <span key={`leader-b-${label}-${leader.id}`} className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-500 bg-slate-950 shadow-[0_0_18px_rgba(15,23,42,0.65)] flex items-center justify-center">
                                                                                                {leader.pictureUrl ? (
                                                                                                    <img src={leader.pictureUrl} alt={leader.name} className="w-full h-full object-cover" />
                                                                                                ) : (
                                                                                                    <span className="text-xs font-black text-slate-200">{(leader.name || '?').slice(0, 1).toUpperCase()}</span>
                                                                                                )}
                                                                                            </span>
                                                                                        )) : (
                                                                                            <span className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-500 bg-slate-950 shadow-[0_0_18px_rgba(15,23,42,0.65)] flex items-center justify-center text-xs font-black text-slate-500">-</span>
                                                                                        )}
                                                                                        {hasBLeader && bLeaders.length > 2 ? (
                                                                                            <span className="w-6 h-6 rounded-full border border-slate-600 bg-slate-900 text-[9px] font-black text-slate-200 flex items-center justify-center">+{bLeaders.length - 2}</span>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="min-w-0 text-left">
                                                                                    <div className="hidden lg:flex mt-1 flex-wrap justify-start gap-x-1.5 gap-y-0.5 leading-tight">
                                                                                        {hasBLeader ? bLeaders.map((leader, index) => (
                                                                                            <React.Fragment key={`leader-b-name-${label}-${leader.id}`}>
                                                                                                {index > 0 ? <span className="text-[10px] font-bold text-slate-600">/</span> : null}
                                                                                                <span className="text-[10px] font-bold text-slate-400">{`#${leader.number} ${leader.name}`}</span>
                                                                                            </React.Fragment>
                                                                                        )) : null}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* SCORING BY QUARTER */}
                                                {historyDetailTab === 'scoring' && (
                                                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Scoring by Quarter</h4>
                                                        <span className="text-[10px] text-slate-500 font-mono">Points only</span>
                                                    </div>
                                                    <div className="overflow-x-auto rounded-lg border border-slate-800">
                                                        <table className="w-full text-xs min-w-[520px] font-mono">
                                                            <thead>
                                                                <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                                                                    <th className="py-2 px-3 text-left">Team</th>
                                                                    {quarterStats.map((row) => (
                                                                        <th key={`hist-quarter-head-${game.id}-${row.quarter}`} className="py-2 px-3 text-center">{getPeriodLabel(row.quarter)}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-800/60 text-slate-200">
                                                                <tr>
                                                                    <td className="py-2 px-3 font-bold" style={{ color: teamAObj?.color || '#10b981' }}>{game.teamAName}</td>
                                                                    {quarterStats.map((row) => (
                                                                        <td key={`hist-quarter-a-${game.id}-${row.quarter}`} className="py-2 px-3 text-center font-black">{row.teamA.pts}</td>
                                                                    ))}
                                                                </tr>
                                                                <tr>
                                                                    <td className="py-2 px-3 font-bold" style={{ color: teamBObj?.color || '#ef4444' }}>{game.teamBName}</td>
                                                                    {quarterStats.map((row) => (
                                                                        <td key={`hist-quarter-b-${game.id}-${row.quarter}`} className="py-2 px-3 text-center font-black">{row.teamB.pts}</td>
                                                                    ))}
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                )}

                                                {/* TEAM TOTAL COMPARISON */}
                                                {historyDetailTab === 'comparison' && (
                                                <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Team Total Comparison</h4>
                                                        <span className="text-[10px] text-slate-500 font-mono">All totals for this game</span>
                                                    </div>
                                                    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3 md:p-4 space-y-3">
                                                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[10px] font-bold uppercase tracking-wider">
                                                            <span className="text-right" style={{ color: teamAObj?.color || '#10b981' }}>{game.teamAName}</span>
                                                            <span className="text-slate-500">Stat</span>
                                                            <span style={{ color: teamBObj?.color || '#ef4444' }}>{game.teamBName}</span>
                                                        </div>

                                                        <div className="rounded-xl border border-slate-800/70 overflow-hidden">
                                                        {[
                                                            ['PTS', teamATotals.pts, teamBTotals.pts],
                                                            ['REB', teamATotals.reb, teamBTotals.reb],
                                                            ['AST', teamATotals.ast, teamBTotals.ast],
                                                            ['STL', teamATotals.stl, teamBTotals.stl],
                                                            ['BLK', teamATotals.blk, teamBTotals.blk],
                                                            ['TO', teamATotals.to, teamBTotals.to],
                                                            ['PF', teamATotals.pf, teamBTotals.pf],
                                                            ['FG', teamATotals.fg2m + teamATotals.fg3m, teamBTotals.fg2m + teamBTotals.fg3m],
                                                            ['3PT', teamATotals.fg3m, teamBTotals.fg3m],
                                                            ['FT', teamATotals.ftm, teamBTotals.ftm]
                                                        ].map(([label, teamAValue, teamBValue]) => {
                                                            const aNum = Number(teamAValue) || 0;
                                                            const bNum = Number(teamBValue) || 0;
                                                            const totalValue = Math.max(aNum + bNum, 1);
                                                            const aWidth = `${Math.min(100, (aNum / totalValue) * 100)}%`;
                                                            const bWidth = `${Math.min(100, (bNum / totalValue) * 100)}%`;

                                                            return (
                                                                <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-0 overflow-hidden border-b border-slate-800 last:border-b-0 font-mono bg-slate-950/45">
                                                                    <div className="relative min-w-0 overflow-hidden border-r border-slate-800 px-3 py-2">
                                                                        <div className="pointer-events-none absolute inset-0 flex justify-end">
                                                                            <div className="h-full leader-bg-fill leader-bg-fill-left border-b" style={{ width: aWidth, backgroundColor: `${teamAObj?.color || '#10b981'}0c`, borderBottomColor: `${teamAObj?.color || '#10b981'}aa` }} />
                                                                        </div>
                                                                        <span className="relative z-10 block text-right text-xl leading-none font-black text-slate-100">{Math.round(aNum)}</span>
                                                                    </div>
                                                                    <span className="inline-flex h-full items-center justify-center border-r border-slate-800 bg-slate-950/85 px-2 py-1.5">
                                                                        <span className="inline-flex min-w-[34px] items-center justify-center text-[9px] leading-none font-black tracking-wide text-slate-100">{label}</span>
                                                                    </span>
                                                                    <div className="relative min-w-0 overflow-hidden px-3 py-2">
                                                                        <div className="pointer-events-none absolute inset-0">
                                                                            <div className="h-full leader-bg-fill leader-bg-fill-right border-b" style={{ width: bWidth, backgroundColor: `${teamBObj?.color || '#ef4444'}0c`, borderBottomColor: `${teamBObj?.color || '#ef4444'}aa` }} />
                                                                        </div>
                                                                        <span className="relative z-10 block text-left text-xl leading-none font-black text-slate-100">{Math.round(bNum)}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        </div>
                                                    </div>
                                                </div>
                                                )}

                                                {/* TEAM A STATLINE TABLE */}
                                                {historyDetailTab === 'home' && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: teamAObj?.color || '#10b981' }} />
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">{game.teamAName} Statline</h4>
                                                    </div>
                                                    <div className="overflow-x-auto rounded-xl border border-slate-850">
                                                        <table className="w-full text-left text-xs min-w-[750px]">
                                                            <thead>
                                                                <tr className="bg-slate-950/80 text-slate-400 font-mono text-[10px] border-b border-slate-800">
                                                                    <th className="py-2.5 px-3">Player</th>
                                                                    <th className="py-2.5 px-2 text-center text-rose-300">Status</th>
                                                                    <th className="py-2.5 px-2 text-center text-orange-400">PTS</th>
                                                                    <th className="py-2.5 px-2 text-center text-emerald-400 font-bold">FG%</th>
                                                                    <th className="py-2.5 px-2 text-center text-cyan-400 font-bold">3P%</th>
                                                                    <th className="py-2.5 px-2 text-center text-pink-400 font-bold">FT%</th>
                                                                    <th className="py-2.5 px-2 text-center text-emerald-400">REB</th>
                                                                    <th className="py-2.5 px-2 text-center text-blue-400">AST</th>
                                                                    <th className="py-2.5 px-2 text-center text-teal-400">STL</th>
                                                                    <th className="py-2.5 px-2 text-center text-violet-400">BLK</th>
                                                                    <th className="py-2.5 px-2 text-center text-amber-500">TO</th>
                                                                    <th className="py-2.5 px-2 text-center text-red-400">PF</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-800/60 bg-slate-950/20 font-medium font-mono text-slate-300">
                                                                {teamAObj?.players
                                                                    .map(player => {
                                                                        const pstats = game.playerStats?.[player.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                                                                        const pPct = computeShootingPercentages(pstats);
                                                                        const isExplicitDnp = Array.isArray(game.dnpPlayers) && game.dnpPlayers.includes(player.id);
                                                                        const hasSavedRow = Boolean(game.playerStats?.[player.id]);
                                                                        const isDnp = isExplicitDnp || !hasSavedRow;
                                                                        return (
                                                                            <tr key={player.id} className="hover:bg-slate-855/20">
                                                                                <td className="py-2 px-3 text-white font-bold font-sans">
                                                                                    <span className="text-slate-500 font-mono mr-1.5 text-[10px]">#{player.number}</span>
                                                                                    {player.name}
                                                                                </td>
                                                                                <td className="py-2 px-2 text-center">
                                                                                    {isDnp ? (
                                                                                        <span className="inline-flex px-1.5 py-0.5 rounded border border-rose-500/60 bg-rose-500/15 text-rose-300 text-[10px] font-black uppercase tracking-wide">DNP</span>
                                                                                    ) : (
                                                                                        <span className="inline-flex px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-wide">Played</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-2 px-2 text-center text-orange-400 font-black">{pstats.pts}</td>
                                                                                <td className="py-2 px-2 text-center text-emerald-400 font-bold">{pPct.fgPct}</td>
                                                                                <td className="py-2 px-2 text-center text-cyan-400 font-bold">{pPct.fg3Pct}</td>
                                                                                <td className="py-2 px-2 text-center text-pink-400 font-bold">{pPct.ftPct}</td>
                                                                                <td className="py-2 px-2 text-center text-emerald-400">{pstats.reb}</td>
                                                                                <td className="py-2 px-2 text-center text-blue-400">{pstats.ast}</td>
                                                                                <td className="py-2 px-2 text-center text-teal-400 font-mono">{(pstats.stl || 0)}</td>
                                                                                <td className="py-2 px-2 text-center text-violet-400 font-mono">{(pstats.blk || 0)}</td>
                                                                                <td className="py-2 px-2 text-center text-amber-500 font-mono">{pstats.to || 0}</td>
                                                                                <td className="py-2 px-2 text-center text-red-400 font-mono">{pstats.pf}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                )}

                                                {/* TEAM B STATLINE TABLE */}
                                                {historyDetailTab === 'away' && (
                                                <div className="space-y-2 mt-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: teamBObj?.color || '#ef4444' }} />
                                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">{game.teamBName} Statline</h4>
                                                    </div>
                                                    <div className="overflow-x-auto rounded-xl border border-slate-850">
                                                        <table className="w-full text-left text-xs min-w-[750px]">
                                                            <thead>
                                                                <tr className="bg-slate-950/80 text-slate-400 font-mono text-[10px] border-b border-slate-800">
                                                                    <th className="py-2.5 px-3">Player</th>
                                                                    <th className="py-2.5 px-2 text-center text-rose-300">Status</th>
                                                                    <th className="py-2.5 px-2 text-center text-orange-400">PTS</th>
                                                                    <th className="py-2.5 px-2 text-center text-emerald-400 font-bold">FG%</th>
                                                                    <th className="py-2.5 px-2 text-center text-cyan-400 font-bold">3P%</th>
                                                                    <th className="py-2.5 px-2 text-center text-pink-400 font-bold">FT%</th>
                                                                    <th className="py-2.5 px-2 text-center text-emerald-400">REB</th>
                                                                    <th className="py-2.5 px-2 text-center text-blue-400">AST</th>
                                                                    <th className="py-2.5 px-2 text-center text-teal-400">STL</th>
                                                                    <th className="py-2.5 px-2 text-center text-violet-400">BLK</th>
                                                                    <th className="py-2.5 px-2 text-center text-amber-500">TO</th>
                                                                    <th className="py-2.5 px-2 text-center text-red-400">PF</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-800/60 bg-slate-950/20 font-medium font-mono text-slate-300">
                                                                {teamBObj?.players
                                                                    .map(player => {
                                                                        const pstats = game.playerStats?.[player.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                                                                        const pPct = computeShootingPercentages(pstats);
                                                                        const isExplicitDnp = Array.isArray(game.dnpPlayers) && game.dnpPlayers.includes(player.id);
                                                                        const hasSavedRow = Boolean(game.playerStats?.[player.id]);
                                                                        const isDnp = isExplicitDnp || !hasSavedRow;
                                                                        return (
                                                                            <tr key={player.id} className="hover:bg-slate-855/20">
                                                                                <td className="py-2 px-3 text-white font-bold font-sans">
                                                                                    <span className="text-slate-500 font-mono mr-1.5 text-[10px]">#{player.number}</span>
                                                                                    {player.name}
                                                                                </td>
                                                                                <td className="py-2 px-2 text-center">
                                                                                    {isDnp ? (
                                                                                        <span className="inline-flex px-1.5 py-0.5 rounded border border-rose-500/60 bg-rose-500/15 text-rose-300 text-[10px] font-black uppercase tracking-wide">DNP</span>
                                                                                    ) : (
                                                                                        <span className="inline-flex px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-wide">Played</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="py-2 px-2 text-center text-orange-400 font-black">{pstats.pts}</td>
                                                                                <td className="py-2 px-2 text-center text-emerald-400 font-bold">{pPct.fgPct}</td>
                                                                                <td className="py-2 px-2 text-center text-cyan-400 font-bold">{pPct.fg3Pct}</td>
                                                                                <td className="py-2 px-2 text-center text-pink-400 font-bold">{pPct.ftPct}</td>
                                                                                <td className="py-2 px-2 text-center text-emerald-400">{pstats.reb}</td>
                                                                                <td className="py-2 px-2 text-center text-blue-400">{pstats.ast}</td>
                                                                                <td className="py-2 px-2 text-center text-teal-400">{(pstats.stl || 0)}</td>
                                                                                <td className="py-2 px-2 text-center text-violet-400">{(pstats.blk || 0)}</td>
                                                                                <td className="py-2 px-2 text-center text-amber-500">{pstats.to}</td>
                                                                                <td className="py-2 px-2 text-center text-red-400">{pstats.pf}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                )}

                                                {/* PLAY-BY-PLAY */}
                                                {historyDetailTab === 'pbp' && (
                                                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 space-y-3 mt-4">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">Play-by-Play</h4>
                                                            <span className="text-[10px] text-slate-500 font-mono">Includes substitutions and scoring notes</span>
                                                        </div>

                                                        {Array.isArray(game.gameLog) && game.gameLog.length > 0 ? (
                                                            <div className="space-y-1.5 text-xs md:text-sm max-h-72 overflow-auto pr-1">
                                                                {game.gameLog.map((log, idx) => {
                                                                    const isSubEvent = typeof log.text === 'string' && log.text.includes('SUB:');
                                                                    const isHomeEvent = log.isTeamA === true;
                                                                    const isAwayEvent = log.isTeamA === false;
                                                                    const isNeutralEvent = !isHomeEvent && !isAwayEvent;
                                                                    const timeLabel = (log.time || '').split(' ')[0] || '--';
                                                                    return (
                                                                        <div
                                                                            key={`${log.time || 'event'}-${idx}`}
                                                                            className={`rounded-lg border px-3 py-2 ${isSubEvent ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-slate-800 bg-slate-900/70 text-slate-300'}`}
                                                                        >
                                                                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                                                                <div className={`min-w-0 ${isHomeEvent ? 'text-right' : 'text-right text-slate-600/70'}`}>
                                                                                    {isHomeEvent ? (
                                                                                        <span className="font-medium break-words" style={{ color: teamAObj?.color || '#10b981' }}>{log.text}</span>
                                                                                    ) : (
                                                                                        <span>&nbsp;</span>
                                                                                    )}
                                                                                </div>

                                                                                <div className="text-center">
                                                                                    <span className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-950/95 px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-slate-400">
                                                                                        {timeLabel}
                                                                                    </span>
                                                                                </div>

                                                                                <div className={`min-w-0 ${isAwayEvent ? 'text-left' : 'text-left text-slate-600/70'}`}>
                                                                                    {isAwayEvent ? (
                                                                                        <span className="font-medium break-words" style={{ color: teamBObj?.color || '#ef4444' }}>{log.text}</span>
                                                                                    ) : (
                                                                                        <span>&nbsp;</span>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            {isNeutralEvent && (
                                                                                <div className="mt-2 text-center text-slate-300 font-medium break-words">
                                                                                    {log.text}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-slate-500 italic py-2">No play-by-play entries for this game.</p>
                                                        )}
                                                    </div>
                                                )}

                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* TAB 4: COMPREHENSIVE ALL PLAYER LEADERBOARDS */}
                        {activeTab === 'leaders' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-bold text-white font-sans">League Statistics Leaderboard</h3>
                                    <p className="text-xs text-slate-400">Displaying performance standings across all active league roster fields.</p>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-2xl">
                                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-3">
                                        <h4 className="font-extrabold text-sm uppercase tracking-wide text-white">Category Leaders</h4>
                                        <div className="flex items-center gap-2">
                                            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 gap-0.5">
                                                <button
                                                    onClick={() => setLeadersStatMode('perGame')}
                                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${leadersStatMode === 'perGame' ? 'bg-orange-500 text-white shadow' : 'text-slate-400'}`}
                                                >
                                                    Per Game
                                                </button>
                                                <button
                                                    onClick={() => setLeadersStatMode('totals')}
                                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${leadersStatMode === 'totals' ? 'bg-orange-500 text-white shadow' : 'text-slate-400'}`}
                                                >
                                                    Accumulated
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {(() => {
                                        const playerPool = teams.flatMap((t) => t.players.map((p) => ({ ...p, team: t.name, avg: getAverages(p) })));
                                        const leaderDefs = [
                                            { id: 'pts', title: 'Scoring', statLabel: 'PTS', valueKey: 'pts', colorClass: 'text-orange-400' },
                                            { id: 'reb', title: 'Rebounds', statLabel: 'REB', valueKey: 'reb', colorClass: 'text-emerald-400' },
                                            { id: 'ast', title: 'Assists', statLabel: 'AST', valueKey: 'ast', colorClass: 'text-blue-400' },
                                            { id: 'stl', title: 'Steals', statLabel: 'STL', valueKey: 'stl', colorClass: 'text-teal-400' },
                                            { id: 'blk', title: 'Blocks', statLabel: 'BLK', valueKey: 'blk', colorClass: 'text-violet-400' },
                                            { id: 'to', title: 'Turnovers', statLabel: 'TO', valueKey: 'to', colorClass: 'text-red-400' },
                                            { id: 'fgPct', title: 'FG Accuracy', statLabel: 'FG%', valueKey: 'fgPct', colorClass: 'text-cyan-400' },
                                            { id: 'fg3Pct', title: '3PT Accuracy', statLabel: '3P%', valueKey: 'fg3Pct', colorClass: 'text-sky-400' },
                                            { id: 'pf', title: 'Fouls', statLabel: 'PF', valueKey: 'pf', colorClass: 'text-rose-400' }
                                        ];

                                        const leaders = leaderDefs.map((def) => {
                                            const ranked = playerPool
                                                .slice()
                                                .sort((a, b) => getLeaderMetric(b, def.valueKey, leadersStatMode) - getLeaderMetric(a, def.valueKey, leadersStatMode));
                                            return {
                                                ...def,
                                                ranked
                                            };
                                        });

                                        return (
                                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                                {leaders.map((entry) => (
                                                    <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-3">
                                                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="inline-flex items-center rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-black tracking-wider text-slate-100 shrink-0">
                                                                    {entry.statLabel}
                                                                </span>
                                                                <div className="text-xs font-bold text-slate-200 truncate">{entry.title}</div>
                                                            </div>
                                                            <div className="text-[10px] text-slate-500 font-bold shrink-0">
                                                                {leadersStatMode === 'perGame' ? 'Per Game' : 'Totals'}
                                                            </div>
                                                        </div>

                                                        {entry.ranked.length === 0 ? (
                                                            <div className="text-xs text-slate-500 italic">No players yet</div>
                                                        ) : (
                                                            <div className="space-y-2">
                                                                <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 grid grid-cols-[auto_auto_1fr_auto] items-center gap-3">
                                                                    <span className="font-mono font-black text-orange-300 text-xs w-7 text-center">#1</span>
                                                                    {entry.ranked[0].pictureUrl ? (
                                                                        <img
                                                                            src={entry.ranked[0].pictureUrl}
                                                                            alt={entry.ranked[0].name}
                                                                            className="w-10 h-10 rounded-full border border-slate-700 object-cover shrink-0"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-10 h-10 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center text-[9px] font-bold text-slate-400 shrink-0">
                                                                            IMG
                                                                        </div>
                                                                    )}
                                                                    <div className="min-w-0">
                                                                        <div className="truncate text-white font-extrabold text-sm">{entry.ranked[0].name}</div>
                                                                        <div className="text-[10px] text-slate-500 truncate mt-0.5">{entry.ranked[0].team}</div>
                                                                    </div>
                                                                    <div className={`font-mono font-black text-xl ${entry.colorClass} shrink-0`}>
                                                                        {formatLeaderMetric(entry.ranked[0], entry.valueKey, leadersStatMode)}
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
                                                                    {entry.ranked.slice(1).map((player, idx) => (
                                                                        <div
                                                                            key={`${entry.id}-${player.id}`}
                                                                            className="rounded-lg border px-2 py-1.5 flex items-center justify-between gap-2 bg-slate-900/70 border-slate-800"
                                                                        >
                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                <span className="font-mono font-black w-6 text-center text-slate-500 text-[11px]">#{idx + 2}</span>
                                                                                <div className="min-w-0">
                                                                                <div className="truncate text-slate-200 font-bold text-xs">{player.name}</div>
                                                                                <div className="text-[10px] text-slate-500 truncate">{player.team}</div>
                                                                                </div>
                                                                            </div>
                                                                            <div className={`font-mono font-black text-sm ${entry.colorClass}`}>
                                                                                {formatLeaderMetric(player, entry.valueKey, leadersStatMode)}
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </main>

                    {/* FOOTER BAR */}
                    <footer className="mt-16 pt-5 border-t border-slate-850 text-center text-[11px] text-slate-500 font-semibold uppercase tracking-wider font-mono">
                        <p>© 2021-2026 WKND Basketaball.</p>
                    </footer>

                    {}
                    {/* HISTORIC BOX SCORE EDITOR MODAL */}
                    {editingGame && (
                        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-3xl shadow-2xl relative my-auto flex flex-col max-h-[90vh]">
                                <div className="border-b border-slate-800 pb-3 mb-4 flex-shrink-0">
                                    <h3 className="text-lg font-black text-white">Edit Game Box Score</h3>
                                    <p className="text-xs text-slate-400">Match Date: {editingGame.date} • ID: {editingGame.id}</p>
                                </div>

                                <form onSubmit={handleSaveHistoricEdit} className="space-y-4 overflow-y-auto flex-1 pr-1">
                                    <div className="space-y-6">
                                        {/* Home Team Section */}
                                        <div>
                                            <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> {editingGame.teamAName} (Home)
                                            </h4>
                                            <div className="space-y-2">
                                                {(teams.find(t => t.id === editingGame.teamAId)?.players || [])
                                                    .map(player => {
                                                        const isExpanded = expandedEditPlayerId === player.id;
                                                        const pstats = editStatsTemp[player.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                                                        return (
                                                            <div key={player.id} className="bg-slate-955/60 border border-slate-850 rounded-xl overflow-hidden">
                                                                <div 
                                                                    onClick={() => setExpandedEditPlayerId(isExpanded ? null : player.id)}
                                                                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-900/40 select-none"
                                                                >
                                                                    <span className="text-xs font-extrabold text-white">
                                                                        <span className="font-mono text-slate-500 mr-1.5">#{player.number}</span> {player.name}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                                                        PTS: {pstats.pts || 0} • REB: {pstats.reb || 0} • AST: {pstats.ast || 0}
                                                                    </span>
                                                                </div>
                                                                {isExpanded && (
                                                                    <div className="p-3 bg-slate-955 border-t border-slate-855 grid grid-cols-3 sm:grid-cols-5 gap-2.5 text-xs font-semibold">
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">PTS</label>
                                                                            <input type="number" min="0" value={pstats.pts || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, pts: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">REB</label>
                                                                            <input type="number" min="0" value={pstats.reb || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, reb: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">AST</label>
                                                                            <input type="number" min="0" value={pstats.ast || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, ast: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">STL</label>
                                                                            <input type="number" min="0" value={pstats.stl || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, stl: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">BLK</label>
                                                                            <input type="number" min="0" value={pstats.blk || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, blk: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">TO</label>
                                                                            <input type="number" min="0" value={pstats.to || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, to: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">PF</label>
                                                                            <input type="number" min="0" max="5" value={pstats.pf || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, pf: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">2PM</label>
                                                                            <input type="number" min="0" value={pstats.fg2m || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg2m: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">3PM</label>
                                                                            <input type="number" min="0" value={pstats.fg3m || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg3m: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">2P Miss</label>
                                                                            <input type="number" min="0" value={pstats.fg2m_miss || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg2m_miss: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">3P Miss</label>
                                                                            <input type="number" min="0" value={pstats.fg3m_miss || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg3m_miss: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">FT Made</label>
                                                                            <input type="number" min="0" value={pstats.ftm || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, ftm: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">FT Miss</label>
                                                                            <input type="number" min="0" value={pstats.ft_miss || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, ft_miss: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>

                                        {/* Away Team Section */}
                                        <div>
                                            <h4 className="text-xs font-black text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                <span className="w-2.5 h-2.5 rounded-full bg-red-400" /> {editingGame.teamBName} (Away)
                                            </h4>
                                            <div className="space-y-2">
                                                {(teams.find(t => t.id === editingGame.teamBId)?.players || [])
                                                    .map(player => {
                                                        const isExpanded = expandedEditPlayerId === player.id;
                                                        const pstats = editStatsTemp[player.id] || { pts: 0, ast: 0, reb: 0, stl: 0, blk: 0, to: 0, pf: 0, fg2m: 0, fg3m: 0, fg2m_miss: 0, fg3m_miss: 0, ftm: 0, ft_miss: 0 };
                                                        return (
                                                            <div key={player.id} className="bg-slate-955/60 border border-slate-850 rounded-xl overflow-hidden">
                                                                <div 
                                                                    onClick={() => setExpandedEditPlayerId(isExpanded ? null : player.id)}
                                                                    className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-900/40 select-none"
                                                                >
                                                                    <span className="text-xs font-extrabold text-white">
                                                                        <span className="font-mono text-slate-500 mr-1.5">#{player.number}</span> {player.name}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                                                        PTS: {pstats.pts || 0} • REB: {pstats.reb || 0} • AST: {pstats.ast || 0}
                                                                    </span>
                                                                </div>
                                                                {isExpanded && (
                                                                    <div className="p-3 bg-slate-955 border-t border-slate-850 grid grid-cols-3 sm:grid-cols-5 gap-2.5 text-xs font-semibold">
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">PTS</label>
                                                                            <input type="number" min="0" value={pstats.pts || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, pts: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">REB</label>
                                                                            <input type="number" min="0" value={pstats.reb || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, reb: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">AST</label>
                                                                            <input type="number" min="0" value={pstats.ast || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, ast: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">STL</label>
                                                                            <input type="number" min="0" value={pstats.stl || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, stl: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">BLK</label>
                                                                            <input type="number" min="0" value={pstats.blk || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, blk: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">TO</label>
                                                                            <input type="number" min="0" value={pstats.to || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, to: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">PF</label>
                                                                            <input type="number" min="0" max="5" value={pstats.pf || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, pf: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">2PM</label>
                                                                            <input type="number" min="0" value={pstats.fg2m || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg2m: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">3PM</label>
                                                                            <input type="number" min="0" value={pstats.fg3m || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg3m: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">2P Miss</label>
                                                                            <input type="number" min="0" value={pstats.fg2m_miss || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg2m_miss: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">3P Miss</label>
                                                                            <input type="number" min="0" value={pstats.fg3m_miss || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, fg3m_miss: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">FT Made</label>
                                                                            <input type="number" min="0" value={pstats.ftm || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, ftm: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-[10px] text-slate-400 mb-1">FT Miss</label>
                                                                            <input type="number" min="0" value={pstats.ft_miss || 0} onChange={(e) => setEditStatsTemp({ ...editStatsTemp, [player.id]: { ...pstats, ft_miss: parseInt(e.target.value, 10) || 0 } })} className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white font-mono" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div className="flex gap-2.5 pt-4 border-t border-slate-800 flex-shrink-0">
                                        <button 
                                            type="button" 
                                            onClick={() => { setEditingGame(null); setExpandedEditPlayerId(null); }}
                                            className="flex-1 py-2.5 bg-slate-955 text-slate-400 hover:text-white rounded-xl text-xs font-bold border border-slate-850 cursor-pointer"
                                        >
                                            Cancel Edits
                                        </button>
                                        <button 
                                            type="submit" 
                                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg cursor-pointer"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* MODAL WRAPPERS */}
                    {showNewTeamModal && (
                        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-sm relative">
                                <h3 className="text-sm font-bold text-white mb-3">Create League Franchise</h3>
                                <form onSubmit={handleCreateTeam} className="space-y-3 text-xs">
                                    <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Team Name" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white" required />
                                    <input type="color" value={newTeamColor} onChange={(e) => setNewTeamColor(e.target.value)} className="w-8 h-8 bg-transparent border-0 cursor-pointer block" />
                                    <div className="flex gap-2 font-bold pt-1">
                                        <button type="button" onClick={() => setShowNewTeamModal(false)} className="flex-1 py-2 bg-slate-955 text-slate-400 rounded-xl border border-slate-855">Cancel</button>
                                        <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-xl">Create</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {showNewPlayerModal && (
                        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-sm relative">
                                <h3 className="text-sm font-bold text-white mb-3">Register Roster Entry</h3>
                                <form onSubmit={handleCreatePlayer} className="space-y-3 text-xs">
                                    <select value={selectedTeamIdForPlayer} onChange={(e) => setSelectedTeamIdForPlayer(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white">
                                        {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                    <input type="text" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Full Name" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white" required />
                                    <input type="text" value={newPlayerNumber} onChange={(e) => setNewPlayerNumber(e.target.value)} placeholder="Jersey No." className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white font-mono" required />
                                    <div className="flex gap-2 font-bold pt-1">
                                        <button type="button" onClick={() => setShowNewPlayerModal(false)} className="flex-1 py-2 bg-slate-955 text-slate-400 rounded-xl border border-slate-850">Cancel</button>
                                        <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-xl">Register</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {advancedEditingPlayer && (
                        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-lg relative">
                                <h3 className="text-sm font-bold text-white mb-1">Advanced Player Profile</h3>
                                <p className="text-[11px] text-slate-400 mb-3">#{advancedEditingPlayer.number} {advancedEditingPlayer.name}</p>
                                <form onSubmit={handleSaveAdvancedPlayerProfile} className="space-y-3 text-xs">
                                    <input
                                        type="url"
                                        value={advancedEditingPlayer.pictureUrl}
                                        onChange={(e) => setAdvancedEditingPlayer({ ...advancedEditingPlayer, pictureUrl: e.target.value })}
                                        placeholder="Picture URL"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input
                                            type="date"
                                            value={advancedEditingPlayer.birthday}
                                            onChange={(e) => setAdvancedEditingPlayer({ ...advancedEditingPlayer, birthday: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                                        />
                                        <input
                                            type="email"
                                            value={advancedEditingPlayer.email}
                                            onChange={(e) => setAdvancedEditingPlayer({ ...advancedEditingPlayer, email: e.target.value })}
                                            placeholder="Email"
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={advancedEditingPlayer.social}
                                        onChange={(e) => setAdvancedEditingPlayer({ ...advancedEditingPlayer, social: e.target.value })}
                                        placeholder="Social (e.g. @handle, link)"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                                    />
                                    <textarea
                                        value={advancedEditingPlayer.writeup}
                                        onChange={(e) => setAdvancedEditingPlayer({ ...advancedEditingPlayer, writeup: e.target.value })}
                                        placeholder="Player Description"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-xs resize-none min-h-[90px]"
                                    />
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                                        <div className="text-[10px] text-slate-400 mb-2 uppercase tracking-widest font-bold text-center">Playing Positions</div>
                                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 place-items-center">
                                            {PLAYER_POSITIONS.map((pos) => {
                                                const isSelected = Array.isArray(advancedEditingPlayer.positions) && advancedEditingPlayer.positions.includes(pos);
                                                return (
                                                    <label key={pos} className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 cursor-pointer select-none text-center ${isSelected ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-200' : 'border-slate-800 bg-slate-950 text-slate-300'}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const current = Array.isArray(advancedEditingPlayer.positions) ? advancedEditingPlayer.positions : [];
                                                                const next = e.target.checked
                                                                    ? [...current, pos]
                                                                    : current.filter((item) => item !== pos);
                                                                setAdvancedEditingPlayer({ ...advancedEditingPlayer, positions: next });
                                                            }}
                                                            className="accent-cyan-500"
                                                        />
                                                        <span className="font-mono font-bold text-[11px]">{pos}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={advancedEditingPlayer.contact}
                                        onChange={(e) => setAdvancedEditingPlayer({ ...advancedEditingPlayer, contact: e.target.value })}
                                        placeholder="Contact Number"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white"
                                    />
                                    <div className="flex gap-2 font-bold pt-1">
                                        <button type="button" onClick={() => setAdvancedEditingPlayer(null)} className="flex-1 py-2 bg-slate-955 text-slate-400 rounded-xl border border-slate-850">Cancel</button>
                                        <button type="submit" className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl">Save Profile</button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}

                    {showSubstitutionModal && subTargetPlayer && (
                        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-sm relative font-sans">
                                <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-1"><Icons.ArrowRightLeft /> Substitute Athlete</h3>
                                <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                                    {(() => {
                                        const benchIds = subTargetPlayer.team === 'A' ? teamABench : teamBBench;
                                        const teamObj = subTargetPlayer.team === 'A' ? teams.find(t => t.id === teamAId) : teams.find(t => t.id === teamBId);
                                        return benchIds.map(benchId => {
                                            const p = teamObj?.players.find(x => x.id === benchId);
                                            const isFouledOut = (liveStats[benchId]?.pf || 0) >= 5;
                                            const initials = (p?.name || '?')
                                                .split(/[\s,]+/)
                                                .filter(Boolean)
                                                .slice(0, 2)
                                                .map((part) => part[0]?.toUpperCase() || '')
                                                .join('') || '?';
                                            return p ? (
                                                <button
                                                    key={benchId}
                                                    disabled={isFouledOut}
                                                    onClick={() => executeSubstitution(subTargetPlayer.id, benchId, subTargetPlayer.team === 'A')}
                                                    className="w-full p-1.5 bg-slate-955 border border-slate-800/55 rounded-xl text-slate-200 text-left cursor-pointer hover:border-emerald-500/45 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-800/55"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 shrink-0 flex items-center justify-center text-[9px] font-black text-slate-400">
                                                            {p.pictureUrl ? (
                                                                <img src={p.pictureUrl} alt={p.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span>{initials}</span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[9px] font-mono font-black text-amber-200 leading-none">#{p.number}</div>
                                                            <div className="text-[12px] font-black text-white truncate leading-tight mt-0.5">{p.name}</div>
                                                            <div className={`text-[9px] font-bold mt-0.5 leading-none ${isFouledOut ? 'text-red-400' : 'text-emerald-400'}`}>{isFouledOut ? '5 PF - Not Eligible' : 'Tap to Sub In'}</div>
                                                        </div>
                                                    </div>
                                                </button>
                                            ) : null;
                                        });
                                    })()}
                                </div>
                                <button onClick={() => setShowSubstitutionModal(false)} className="w-full mt-3 py-2 bg-slate-950 text-slate-400 border border-slate-855 text-xs rounded-xl cursor-pointer">Cancel</button>
                            </div>
                        </div>
                    )}

                    {showAddFromBenchModal && addFromBenchTeam && (
                        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-sm relative font-sans">
                                <h3 className="text-sm font-bold text-white mb-3">Add Player To On-Court</h3>
                                <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                                    {(() => {
                                        const isTeamA = addFromBenchTeam === 'A';
                                        const lineupIds = isTeamA ? teamALineup : teamBLineup;
                                        const benchIds = isTeamA ? teamABench : teamBBench;
                                        const teamObj = isTeamA ? teams.find(t => t.id === teamAId) : teams.find(t => t.id === teamBId);
                                        const rosterIds = (teamObj?.players || []).map((p) => p.id);
                                        const fallbackCandidates = rosterIds.filter((id) => !lineupIds.includes(id));
                                        const candidateIds = benchIds.length > 0 ? benchIds : fallbackCandidates;
                                        const availableSlots = Math.max(0, 5 - lineupIds.length);
                                        return candidateIds.map((benchId) => {
                                            const p = teamObj?.players.find((x) => x.id === benchId);
                                            const isFouledOut = (liveStats[benchId]?.pf || 0) >= 5;
                                            const isSelected = addFromBenchSelection.includes(benchId);
                                            const isSlotLocked = !isSelected && addFromBenchSelection.length >= availableSlots;
                                            const isDisabled = isFouledOut || isSlotLocked;
                                            const initials = (p?.name || '?')
                                                .split(/[\s,]+/)
                                                .filter(Boolean)
                                                .slice(0, 2)
                                                .map((part) => part[0]?.toUpperCase() || '')
                                                .join('') || '?';
                                            return p ? (
                                                <button
                                                    key={`add-modal-${benchId}`}
                                                    type="button"
                                                    disabled={isDisabled}
                                                    onClick={() => {
                                                        setAddFromBenchSelection((prev) => {
                                                            if (prev.includes(benchId)) {
                                                                return prev.filter((id) => id !== benchId);
                                                            }
                                                            if (prev.length >= availableSlots) {
                                                                showToast(`You can only add up to ${availableSlots} player${availableSlots > 1 ? 's' : ''}.`, 'info');
                                                                return prev;
                                                            }
                                                            return [...prev, benchId];
                                                        });
                                                    }}
                                                    className={`w-full p-1.5 rounded-xl border transition-colors text-left disabled:opacity-35 disabled:cursor-not-allowed ${isSelected ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-100' : 'bg-slate-955 border-slate-800/55 text-slate-200 hover:border-emerald-500/45'} ${isSlotLocked ? 'saturate-0' : ''} disabled:hover:border-slate-800/55`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 shrink-0 flex items-center justify-center text-[9px] font-black text-slate-400">
                                                            {p.pictureUrl ? (
                                                                <img src={p.pictureUrl} alt={p.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span>{initials}</span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[9px] font-mono font-black text-amber-200 leading-none">#{p.number}</div>
                                                            <div className="text-[12px] font-black text-white truncate leading-tight mt-0.5">{p.name}</div>
                                                            <div className={isFouledOut ? 'text-[9px] text-red-400 font-bold mt-0.5' : isSlotLocked ? 'text-[9px] text-slate-500 font-bold mt-0.5' : isSelected ? 'text-[9px] text-emerald-300 font-bold mt-0.5' : 'text-[9px] text-slate-400 font-bold mt-0.5'}>{isFouledOut ? '5 PF' : isSlotLocked ? 'Full' : isSelected ? 'Selected' : 'Select'}</div>
                                                        </div>
                                                    </div>
                                                </button>
                                            ) : null;
                                        });
                                    })()}
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddFromBenchModal(false);
                                            setAddFromBenchTeam(null);
                                            setAddFromBenchSelection([]);
                                        }}
                                        className="py-2 bg-slate-950 text-slate-400 border border-slate-855 text-xs rounded-xl cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddMultipleOnCourtPlayers(addFromBenchSelection, addFromBenchTeam === 'A')}
                                        disabled={addFromBenchSelection.length === 0}
                                        className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                                    >
                                        {`Add Selected (${addFromBenchSelection.length})`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RECONFIGURED SINGLE TAP WORKFLOW MODAL DIALOG CONTAINER */}
                    {showLoggingModal && activeAction && (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className={`bg-slate-900 border border-slate-800 rounded-2xl w-full shadow-2xl relative my-auto ${isCompactRecordActionModal ? 'max-w-xl p-4' : 'max-w-2xl p-5'}`}>
                                <div className={`text-center ${isCompactRecordActionModal ? 'mb-2' : 'mb-3'}`}>
                                    <h3 className={`${isCompactRecordActionModal ? 'text-xs' : 'text-sm'} font-black text-white`}>Record Action: <span className="text-emerald-400 font-mono">{activeAction.label}</span></h3>
                                </div>
                                <div className={`text-center font-bold uppercase tracking-wider text-slate-400 ${isCompactRecordActionModal ? 'mb-2 text-[9px]' : 'mb-3 text-[10px]'}`}>Focus: <span className="text-orange-300">{operatorFocus}</span></div>
                                <div className={`grid grid-cols-1 ${showHomeLivePanel && showAwayLivePanel ? 'md:grid-cols-2' : 'md:grid-cols-1'} ${isCompactRecordActionModal ? 'gap-2.5' : 'gap-4'}`}>
                                    {showHomeLivePanel && <div className={`bg-slate-950/60 rounded-xl border border-slate-855 ${isCompactRecordActionModal ? 'p-2.5' : 'p-3'}`}>
                                        <div className={`font-extrabold text-slate-400 uppercase ${isCompactRecordActionModal ? 'text-[9px] mb-1.5' : 'text-[10px] mb-2'}`}>{homeTeamLabel} On Court</div>
                                        <div className="space-y-1">
                                            {teamALineup.map(id => {
                                                const p = teams.flatMap(t => t.players).find(x => x.id === id);
                                                const isFouledOut = (liveStats[id]?.pf || 0) >= 5;
                                                const initials = (p?.name || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';
                                                return p ? <button key={id} disabled={isFouledOut || !canOperateTeam(true)} onClick={() => handlePlayerClick(id, true)} className={`w-full bg-slate-900 border border-slate-800/55 text-left rounded-xl hover:border-emerald-500/45 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-800/55 ${isCompactRecordActionModal ? 'p-1' : 'p-1.5'}`}><div className="flex items-center gap-2"><div className={`${isCompactRecordActionModal ? 'w-8 h-8' : 'w-9 h-9'} rounded-lg overflow-hidden border border-slate-700/70 bg-slate-950 shrink-0 flex items-center justify-center text-[9px] font-black text-slate-400`}>{p.pictureUrl ? <img src={p.pictureUrl} alt={p.name} className="w-full h-full object-cover" /> : <span>{initials}</span>}</div><div className="min-w-0 flex-1"><div className="text-[9px] font-mono font-black text-amber-200 leading-none">#{p.number}</div><div className={`${isCompactRecordActionModal ? 'text-[11px]' : 'text-[12px]'} font-black text-white truncate leading-tight mt-0.5`}>{p.name}</div></div></div></button> : null;
                                            })}
                                        </div>
                                    </div>}
                                    {showAwayLivePanel && <div className={`bg-slate-955/60 rounded-xl border border-slate-855 ${isCompactRecordActionModal ? 'p-2.5' : 'p-3'}`}>
                                        <div className={`font-extrabold text-slate-400 uppercase ${isCompactRecordActionModal ? 'text-[9px] mb-1.5' : 'text-[10px] mb-2'}`}>{awayTeamLabel} On Court</div>
                                        <div className="space-y-1">
                                            {teamBLineup.map(id => {
                                                const p = teams.flatMap(t => t.players).find(x => x.id === id);
                                                const isFouledOut = (liveStats[id]?.pf || 0) >= 5;
                                                const initials = (p?.name || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || '?';
                                                return p ? <button key={id} disabled={isFouledOut || !canOperateTeam(false)} onClick={() => handlePlayerClick(id, false)} className={`w-full bg-slate-900 border border-slate-800/55 text-left rounded-xl hover:border-emerald-500/45 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-800/55 ${isCompactRecordActionModal ? 'p-1' : 'p-1.5'}`}><div className="flex items-center gap-2"><div className={`${isCompactRecordActionModal ? 'w-8 h-8' : 'w-9 h-9'} rounded-lg overflow-hidden border border-slate-700/70 bg-slate-950 shrink-0 flex items-center justify-center text-[9px] font-black text-slate-400`}>{p.pictureUrl ? <img src={p.pictureUrl} alt={p.name} className="w-full h-full object-cover" /> : <span>{initials}</span>}</div><div className="min-w-0 flex-1"><div className="text-[9px] font-mono font-black text-amber-200 leading-none">#{p.number}</div><div className={`${isCompactRecordActionModal ? 'text-[11px]' : 'text-[12px]'} font-black text-white truncate leading-tight mt-0.5`}>{p.name}</div></div></div></button> : null;
                                            })}
                                        </div>
                                    </div>}
                                </div>
                                <button onClick={() => { setShowLoggingModal(false); setActiveAction(null); setCorrectionMode(false); }} className={`w-full py-2 bg-slate-950 text-slate-400 text-xs rounded-xl font-bold cursor-pointer ${isCompactRecordActionModal ? 'mt-3' : 'mt-4'}`}>Cancel Action</button>
                            </div>
                        </div>
                    )}

                    {/* FOUL WARNING MODAL OVERLAY */}
                    {foulAlert && (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
                            <div className={`border p-6 rounded-2xl w-full max-w-sm shadow-2xl relative text-center my-auto ${
                                foulAlert.type === 'disqualified' ? 'bg-red-955/90 border-red-500' : 'bg-amber-955 border-amber-700'
                            }`}>
                                <div className="text-4xl mb-3">
                                    {foulAlert.type === 'disqualified' ? '🚨' : '⚠️'}
                                </div>
                                <h3 className="text-lg font-black text-white uppercase tracking-wider mb-2">
                                    {foulAlert.type === 'disqualified' ? 'Fouled Out (Disqualified)' : 'Foul Trouble Warning'}
                                </h3>
                                <p className="text-sm text-slate-200 leading-relaxed mb-4">
                                    <strong className="text-white">#{foulAlert.number} {foulAlert.playerName}</strong> has reached <strong className="text-orange-400">{foulAlert.fouls} personal fouls</strong>.
                                    {foulAlert.type === 'disqualified' 
                                         ? ' This player has officially fouled out and must be substituted off the court.' 
                                         : ' They are now in severe foul trouble and are only one foul away from disqualification.'}
                                </p>
                                <button 
                                    onClick={() => setFoulAlert(null)}
                                    className={`w-full py-2.5 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer ${
                                        foulAlert.type === 'disqualified' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
                                    }`}
                                >
                                    Acknowledge Alert
                                </button>
                            </div>
                        </div>
                    )}

                    {confirmDialog && (
                        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl w-full max-w-sm relative">
                                <h3 className="text-md font-extrabold text-white mb-2">{confirmDialog.title}</h3>
                                <p className="text-xs text-slate-400 mb-4">{confirmDialog.text}</p>
                                <div className="flex gap-3 text-xs font-bold">
                                    <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2 bg-slate-950 text-slate-400 rounded-xl border border-slate-850 cursor-pointer">Cancel</button>
                                    <button onClick={confirmDialog.onConfirm} className="flex-1 py-2 bg-red-600 text-white rounded-xl cursor-pointer">Confirm</button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    