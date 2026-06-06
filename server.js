const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
let wss = null;
let lastActiveSessionSourceId = null;

const defaultsDir = path.join(__dirname, 'defaults');

function readJsonFileSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

const DEFAULT_INITIAL_TEAMS = readJsonFileSafe(path.join(defaultsDir, 'initialTeams.json'), []);
const DEFAULT_STAT_ACTIONS = readJsonFileSafe(path.join(defaultsDir, 'statActions.json'), []);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'wknd-stats.db');
const db = new Database(dbPath);

const STAT_FIELDS = ['pts', 'ast', 'reb', 'stl', 'blk', 'to', 'pf', 'fg2m', 'fg3m', 'fg2m_miss', 'fg3m_miss', 'ftm', 'ft_miss'];

function ensureGamesLogColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'game_log_json')) {
    db.exec('ALTER TABLE games ADD COLUMN game_log_json TEXT');
  }
}

function ensurePlayerProfileColumns() {
  const columns = db.prepare('PRAGMA table_info(players)').all();
  const wanted = [
    ['picture_url', 'TEXT NOT NULL DEFAULT ""'],
    ['birthday', 'TEXT NOT NULL DEFAULT ""'],
    ['email', 'TEXT NOT NULL DEFAULT ""'],
    ['social', 'TEXT NOT NULL DEFAULT ""'],
    ['contact', 'TEXT NOT NULL DEFAULT ""']
  ];
  wanted.forEach(([name, typeDef]) => {
    if (!columns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE players ADD COLUMN ${name} ${typeDef}`);
    }
  });
}

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    number TEXT NOT NULL,
    picture_url TEXT NOT NULL DEFAULT '',
    birthday TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    social TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    games_played INTEGER NOT NULL DEFAULT 0,
    pts INTEGER NOT NULL DEFAULT 0,
    ast INTEGER NOT NULL DEFAULT 0,
    reb INTEGER NOT NULL DEFAULT 0,
    stl INTEGER NOT NULL DEFAULT 0,
    blk INTEGER NOT NULL DEFAULT 0,
    turnover INTEGER NOT NULL DEFAULT 0,
    pf INTEGER NOT NULL DEFAULT 0,
    fg2m INTEGER NOT NULL DEFAULT 0,
    fg3m INTEGER NOT NULL DEFAULT 0,
    fg2m_miss INTEGER NOT NULL DEFAULT 0,
    fg3m_miss INTEGER NOT NULL DEFAULT 0,
    ftm INTEGER NOT NULL DEFAULT 0,
    ft_miss INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    team_a_id TEXT NOT NULL,
    team_b_id TEXT NOT NULL,
    team_a_name TEXT NOT NULL,
    team_b_name TEXT NOT NULL,
    team_a_score INTEGER NOT NULL,
    team_b_score INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_player_stats (
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    pts INTEGER NOT NULL DEFAULT 0,
    ast INTEGER NOT NULL DEFAULT 0,
    reb INTEGER NOT NULL DEFAULT 0,
    stl INTEGER NOT NULL DEFAULT 0,
    blk INTEGER NOT NULL DEFAULT 0,
    turnover INTEGER NOT NULL DEFAULT 0,
    pf INTEGER NOT NULL DEFAULT 0,
    fg2m INTEGER NOT NULL DEFAULT 0,
    fg3m INTEGER NOT NULL DEFAULT 0,
    fg2m_miss INTEGER NOT NULL DEFAULT 0,
    fg3m_miss INTEGER NOT NULL DEFAULT 0,
    ftm INTEGER NOT NULL DEFAULT 0,
    ft_miss INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (game_id, player_id)
  );

  CREATE TABLE IF NOT EXISTS stat_actions (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    stat TEXT NOT NULL,
    val INTEGER NOT NULL,
    color_class TEXT NOT NULL,
    tracking_stat TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS active_sessions (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    session_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- Legacy tables kept for migration compatibility.
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    teams_json TEXT NOT NULL,
    games_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config_values (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

ensureGamesLogColumn();
ensurePlayerProfileColumns();

const selectLegacyStateStmt = db.prepare('SELECT teams_json, games_json FROM app_state WHERE id = 1');
const selectLegacyConfigStmt = db.prepare('SELECT value_json FROM config_values WHERE key = ?');

const clearPlayersStmt = db.prepare('DELETE FROM players');
const clearTeamsStmt = db.prepare('DELETE FROM teams');
const clearGamePlayerStatsStmt = db.prepare('DELETE FROM game_player_stats');
const clearGamesStmt = db.prepare('DELETE FROM games');
const clearStatActionsStmt = db.prepare('DELETE FROM stat_actions');

const insertTeamStmt = db.prepare('INSERT INTO teams (id, name, color, sort_order) VALUES (@id, @name, @color, @sort_order)');
const insertPlayerStmt = db.prepare(`
  INSERT INTO players (
    id, team_id, name, number, picture_url, birthday, email, social, contact, games_played,
    pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss,
    sort_order
  ) VALUES (
    @id, @team_id, @name, @number, @picture_url, @birthday, @email, @social, @contact, @games_played,
    @pts, @ast, @reb, @stl, @blk, @turnover, @pf, @fg2m, @fg3m, @fg2m_miss, @fg3m_miss, @ftm, @ft_miss,
    @sort_order
  )
`);

const insertGameStmt = db.prepare(`
  INSERT INTO games (
    id, date, team_a_id, team_b_id, team_a_name, team_b_name, team_a_score, team_b_score, game_log_json, sort_order
  ) VALUES (
    @id, @date, @team_a_id, @team_b_id, @team_a_name, @team_b_name, @team_a_score, @team_b_score, @game_log_json, @sort_order
  )
`);

const insertGamePlayerStatStmt = db.prepare(`
  INSERT INTO game_player_stats (
    game_id, player_id, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
  ) VALUES (
    @game_id, @player_id, @pts, @ast, @reb, @stl, @blk, @turnover, @pf, @fg2m, @fg3m, @fg2m_miss, @fg3m_miss, @ftm, @ft_miss
  )
`);

const insertStatActionStmt = db.prepare(`
  INSERT INTO stat_actions (id, label, category, stat, val, color_class, tracking_stat, sort_order)
  VALUES (@id, @label, @category, @stat, @val, @color_class, @tracking_stat, @sort_order)
`);

const selectTeamsStmt = db.prepare('SELECT id, name, color FROM teams ORDER BY sort_order ASC, id ASC');
const selectPlayersStmt = db.prepare(`
  SELECT id, team_id, name, number, picture_url, birthday, email, social, contact, games_played, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
  FROM players
  ORDER BY sort_order ASC, id ASC
`);
const selectGamesStmt = db.prepare(`
  SELECT id, date, team_a_id, team_b_id, team_a_name, team_b_name, team_a_score, team_b_score, game_log_json
  FROM games
  ORDER BY sort_order ASC, id DESC
`);
const selectGamePlayerStatsStmt = db.prepare(`
  SELECT game_id, player_id, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
  FROM game_player_stats
`);
const selectStatActionsStmt = db.prepare(`
  SELECT id, label, category, stat, val, color_class, tracking_stat
  FROM stat_actions
  ORDER BY sort_order ASC, id ASC
`);

const deleteTeamStmt = db.prepare('DELETE FROM teams WHERE id = ?');
const deletePlayersByTeamStmt = db.prepare('DELETE FROM players WHERE team_id = ?');
const selectPlayerIdsByTeamStmt = db.prepare('SELECT id FROM players WHERE team_id = ?');
const deleteGamePlayerStatsByPlayerStmt = db.prepare('DELETE FROM game_player_stats WHERE player_id = ?');

const selectActiveSessionStmt = db.prepare('SELECT session_json FROM active_sessions WHERE id = 1');
const upsertActiveSessionStmt = db.prepare(`
  INSERT INTO active_sessions (id, session_json, updated_at)
  VALUES (1, @session_json, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    session_json = excluded.session_json,
    updated_at = CURRENT_TIMESTAMP
`);
const deleteActiveSessionStmt = db.prepare('DELETE FROM active_sessions WHERE id = 1');

const countTeamsStmt = db.prepare('SELECT COUNT(*) as c FROM teams');
const countGamesStmt = db.prepare('SELECT COUNT(*) as c FROM games');
const countStatActionsStmt = db.prepare('SELECT COUNT(*) as c FROM stat_actions');

function parseJsonSafe(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toInt(value) {
  return Number.isFinite(value) ? value : Number.parseInt(value || 0, 10) || 0;
}

function readState() {
  const teams = selectTeamsStmt.all();
  const players = selectPlayersStmt.all();
  const games = selectGamesStmt.all();
  const gamePlayerStats = selectGamePlayerStatsStmt.all();

  const playersByTeam = new Map();
  players.forEach((player) => {
    const teamPlayers = playersByTeam.get(player.team_id) || [];
    teamPlayers.push({
      id: player.id,
      name: player.name,
      number: player.number,
      pictureUrl: player.picture_url || '',
      birthday: player.birthday || '',
      email: player.email || '',
      social: player.social || '',
      contact: player.contact || '',
      gamesPlayed: toInt(player.games_played),
      totalStats: {
        pts: toInt(player.pts),
        ast: toInt(player.ast),
        reb: toInt(player.reb),
        stl: toInt(player.stl),
        blk: toInt(player.blk),
        to: toInt(player.turnover),
        pf: toInt(player.pf),
        fg2m: toInt(player.fg2m),
        fg3m: toInt(player.fg3m),
        fg2m_miss: toInt(player.fg2m_miss),
        fg3m_miss: toInt(player.fg3m_miss),
        ftm: toInt(player.ftm),
        ft_miss: toInt(player.ft_miss)
      }
    });
    playersByTeam.set(player.team_id, teamPlayers);
  });

  const hydratedTeams = teams.map((team) => ({
    id: team.id,
    name: team.name,
    color: team.color,
    players: playersByTeam.get(team.id) || []
  }));

  const statsByGame = new Map();
  gamePlayerStats.forEach((row) => {
    const gameStats = statsByGame.get(row.game_id) || {};
    gameStats[row.player_id] = {
      pts: toInt(row.pts),
      ast: toInt(row.ast),
      reb: toInt(row.reb),
      stl: toInt(row.stl),
      blk: toInt(row.blk),
      to: toInt(row.turnover),
      pf: toInt(row.pf),
      fg2m: toInt(row.fg2m),
      fg3m: toInt(row.fg3m),
      fg2m_miss: toInt(row.fg2m_miss),
      fg3m_miss: toInt(row.fg3m_miss),
      ftm: toInt(row.ftm),
      ft_miss: toInt(row.ft_miss)
    };
    statsByGame.set(row.game_id, gameStats);
  });

  const hydratedGames = games.map((game) => ({
    id: game.id,
    date: game.date,
    teamAId: game.team_a_id,
    teamBId: game.team_b_id,
    teamAName: game.team_a_name,
    teamBName: game.team_b_name,
    teamAScore: toInt(game.team_a_score),
    teamBScore: toInt(game.team_b_score),
    playerStats: statsByGame.get(game.id) || {},
    gameLog: parseJsonSafe(game.game_log_json, [])
  }));

  return {
    teams: hydratedTeams,
    games: hydratedGames
  };
}

const writeTeamsTransaction = db.transaction((nextTeams) => {
  clearPlayersStmt.run();
  clearTeamsStmt.run();

  nextTeams.forEach((team, teamIndex) => {
    insertTeamStmt.run({
      id: team.id,
      name: team.name,
      color: team.color,
      sort_order: teamIndex
    });

    (team.players || []).forEach((player, playerIndex) => {
      const totalStats = player.totalStats || {};
      insertPlayerStmt.run({
        id: player.id,
        team_id: team.id,
        name: player.name,
        number: player.number,
        picture_url: player.pictureUrl || '',
        birthday: player.birthday || '',
        email: player.email || '',
        social: player.social || '',
        contact: player.contact || '',
        games_played: toInt(player.gamesPlayed),
        pts: toInt(totalStats.pts),
        ast: toInt(totalStats.ast),
        reb: toInt(totalStats.reb),
        stl: toInt(totalStats.stl),
        blk: toInt(totalStats.blk),
        turnover: toInt(totalStats.to),
        pf: toInt(totalStats.pf),
        fg2m: toInt(totalStats.fg2m),
        fg3m: toInt(totalStats.fg3m),
        fg2m_miss: toInt(totalStats.fg2m_miss),
        fg3m_miss: toInt(totalStats.fg3m_miss),
        ftm: toInt(totalStats.ftm),
        ft_miss: toInt(totalStats.ft_miss),
        sort_order: playerIndex
      });
    });
  });
});

const writeGamesTransaction = db.transaction((nextGames) => {
  clearGamePlayerStatsStmt.run();
  clearGamesStmt.run();

  nextGames.forEach((game, gameIndex) => {
    insertGameStmt.run({
      id: game.id,
      date: game.date,
      team_a_id: game.teamAId,
      team_b_id: game.teamBId,
      team_a_name: game.teamAName,
      team_b_name: game.teamBName,
      team_a_score: toInt(game.teamAScore),
      team_b_score: toInt(game.teamBScore),
      game_log_json: JSON.stringify(Array.isArray(game.gameLog) ? game.gameLog : []),
      sort_order: gameIndex
    });

    const playerStats = game.playerStats || {};
    Object.entries(playerStats).forEach(([playerId, stats]) => {
      insertGamePlayerStatStmt.run({
        game_id: game.id,
        player_id: playerId,
        pts: toInt(stats.pts),
        ast: toInt(stats.ast),
        reb: toInt(stats.reb),
        stl: toInt(stats.stl),
        blk: toInt(stats.blk),
        turnover: toInt(stats.to),
        pf: toInt(stats.pf),
        fg2m: toInt(stats.fg2m),
        fg3m: toInt(stats.fg3m),
        fg2m_miss: toInt(stats.fg2m_miss),
        fg3m_miss: toInt(stats.fg3m_miss),
        ftm: toInt(stats.ftm),
        ft_miss: toInt(stats.ft_miss)
      });
    });
  });
});

const writeStateTransaction = db.transaction((nextTeams, nextGames) => {
  writeTeamsTransaction(nextTeams);
  writeGamesTransaction(nextGames);
});

function writeState(nextTeams, nextGames) {
  const safeTeams = Array.isArray(nextTeams) ? nextTeams : [];
  const safeGames = Array.isArray(nextGames) ? nextGames : [];
  writeStateTransaction(safeTeams, safeGames);
  broadcastSync();
}

function readStatActions() {
  return selectStatActionsStmt.all().map((row) => ({
    id: row.id,
    label: row.label,
    category: row.category,
    stat: row.stat,
    val: toInt(row.val),
    colorClass: row.color_class,
    ...(row.tracking_stat ? { trackingStat: row.tracking_stat } : {})
  }));
}

const writeStatActionsTransaction = db.transaction((actions) => {
  clearStatActionsStmt.run();
  actions.forEach((action, index) => {
    insertStatActionStmt.run({
      id: action.id,
      label: action.label,
      category: action.category,
      stat: action.stat,
      val: toInt(action.val),
      color_class: action.colorClass || '',
      tracking_stat: action.trackingStat || null,
      sort_order: index
    });
  });
}
);

function writeStatActions(actions) {
  const safe = Array.isArray(actions) ? actions : [];
  writeStatActionsTransaction(safe);
  broadcastSync();
}

function readActiveSession() {
  const row = selectActiveSessionStmt.get();
  if (!row) {
    return null;
  }
  return parseJsonSafe(row.session_json, null);
}

function buildSyncPayload() {
  return {
    state: readState(),
    statActions: readStatActions(),
    session: readActiveSession()
  };
}

function broadcastSync(overrides = {}) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'sync', sourceClientId: overrides.sourceClientId || null, ...buildSyncPayload() });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

function writeActiveSession(session, sourceClientId = null) {
  lastActiveSessionSourceId = sourceClientId;
  upsertActiveSessionStmt.run({
    session_json: JSON.stringify(session || {})
  });
  broadcastSync({ sourceClientId });
}

function clearActiveSession(sourceClientId = null) {
  lastActiveSessionSourceId = sourceClientId;
  deleteActiveSessionStmt.run();
  broadcastSync({ sourceClientId });
}

function migrateLegacyIfNeeded() {
  const hasTeams = toInt(countTeamsStmt.get().c) > 0;
  const hasGames = toInt(countGamesStmt.get().c) > 0;
  const hasActions = toInt(countStatActionsStmt.get().c) > 0;

  if (!hasActions) {
    const legacyActions = parseJsonSafe((selectLegacyConfigStmt.get('statActions') || {}).value_json, null);
    writeStatActions(Array.isArray(legacyActions) && legacyActions.length > 0 ? legacyActions : DEFAULT_STAT_ACTIONS);
  }

  if (!hasTeams && !hasGames) {
    const legacyRow = selectLegacyStateStmt.get();
    const legacyTeams = parseJsonSafe((legacyRow || {}).teams_json, null);
    const legacyGames = parseJsonSafe((legacyRow || {}).games_json, null);

    if (Array.isArray(legacyTeams) && Array.isArray(legacyGames)) {
      writeState(legacyTeams, legacyGames);
    } else {
      writeState(DEFAULT_INITIAL_TEAMS, []);
    }
  }
}

migrateLegacyIfNeeded();

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

app.get('/api/state', (_req, res) => {
  res.json(readState());
});

app.get('/api/bootstrap', (_req, res) => {
  const state = readState();
  const statActions = readStatActions();

  res.json({
    statActions,
    state
  });
});

app.put('/api/state', (req, res) => {
  const { teams, games } = req.body || {};
  if (!Array.isArray(teams) || !Array.isArray(games)) {
    res.status(400).json({ error: 'Body must include teams[] and games[]' });
    return;
  }

  writeState(teams, games);
  res.json({ ok: true });
});

app.put('/api/teams', (req, res) => {
  const { teams } = req.body || {};
  if (!Array.isArray(teams)) {
    res.status(400).json({ error: 'Body must include teams[]' });
    return;
  }

  const state = readState();
  writeState(teams, state.games);
  res.json({ ok: true });
});

app.delete('/api/teams/:teamId', (req, res) => {
  const { teamId } = req.params;

  const deleteTeamTransaction = db.transaction((targetTeamId) => {
    const playerIds = selectPlayerIdsByTeamStmt.all(targetTeamId).map((row) => row.id);
    playerIds.forEach((playerId) => {
      deleteGamePlayerStatsByPlayerStmt.run(playerId);
    });
    deletePlayersByTeamStmt.run(targetTeamId);
    deleteTeamStmt.run(targetTeamId);
  });

  deleteTeamTransaction(teamId);
  broadcastSync();

  res.json({ ok: true });
});

app.put('/api/stat-actions', (req, res) => {
  const { statActions } = req.body || {};
  if (!Array.isArray(statActions)) {
    res.status(400).json({ error: 'Body must include statActions[]' });
    return;
  }

  writeStatActions(statActions);
  res.json({ ok: true });
});

app.get('/api/active-session', (_req, res) => {
  res.json({ session: readActiveSession() });
});

app.put('/api/active-session', (req, res) => {
  const { session, sourceClientId } = req.body || {};
  if (!session || typeof session !== 'object') {
    res.status(400).json({ error: 'Body must include session object' });
    return;
  }

  writeActiveSession(session, sourceClientId || null);
  res.json({ ok: true });
});

app.delete('/api/active-session', (_req, res) => {
  clearActiveSession();
  res.json({ ok: true });
});

wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'sync', ...buildSyncPayload() }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`WKND Stats server running at http://localhost:${PORT}`);
});
