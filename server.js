const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
let wss = null;
let lastActiveSessionSourceId = null;

const AUTH_PASSWORDS = {
  operator: process.env.WKND_OPERATOR_PASSWORD || 'operator123!!!',
  admin: process.env.WKND_ADMIN_PASSWORD || 'admin123!!!'
};

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
    ['positions', "TEXT NOT NULL DEFAULT '[]'"],
    ['picture_url', 'TEXT NOT NULL DEFAULT ""'],
    ['birthday', 'TEXT NOT NULL DEFAULT ""'],
    ['email', 'TEXT NOT NULL DEFAULT ""'],
    ['social', 'TEXT NOT NULL DEFAULT ""'],
    ['contact', 'TEXT NOT NULL DEFAULT ""'],
    ['writeup', 'TEXT NOT NULL DEFAULT ""']
  ];
  wanted.forEach(([name, typeDef]) => {
    if (!columns.some((column) => column.name === name)) {
      db.exec(`ALTER TABLE players ADD COLUMN ${name} ${typeDef}`);
    }
  });
}

function ensurePlayerTotalsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_totals (
      player_id TEXT PRIMARY KEY,
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
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    );
  `);

  const playerColumns = db.prepare('PRAGMA table_info(players)').all();
  const hasLegacyStatsOnPlayers = playerColumns.some((column) => column.name === 'games_played');
  if (!hasLegacyStatsOnPlayers) {
    return;
  }

  db.exec(`
    INSERT INTO player_totals (
      player_id, games_played, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
    )
    SELECT
      p.id, p.games_played, p.pts, p.ast, p.reb, p.stl, p.blk, p.turnover, p.pf, p.fg2m, p.fg3m, p.fg2m_miss, p.fg3m_miss, p.ftm, p.ft_miss
    FROM players p
    LEFT JOIN player_totals t ON t.player_id = p.id
    WHERE t.player_id IS NULL;
  `);
}

function ensurePlayersTableWithoutLegacyStats() {
  const playerColumns = db.prepare('PRAGMA table_info(players)').all();
  const hasLegacyStatsOnPlayers = playerColumns.some((column) => column.name === 'games_played');
  if (!hasLegacyStatsOnPlayers) {
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS player_totals_backup (
      player_id TEXT PRIMARY KEY,
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
      ft_miss INTEGER NOT NULL DEFAULT 0
    );

    DELETE FROM player_totals_backup;
    INSERT INTO player_totals_backup (
      player_id, games_played, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
    )
    SELECT
      player_id, games_played, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
    FROM player_totals;

    CREATE TABLE IF NOT EXISTS players_new (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      number TEXT NOT NULL,
      positions TEXT NOT NULL DEFAULT '[]',
      picture_url TEXT NOT NULL DEFAULT '',
      birthday TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      social TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      writeup TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    INSERT INTO players_new (
      id, team_id, name, number, positions, picture_url, birthday, email, social, contact, writeup, sort_order
    )
    SELECT
      id, team_id, name, number, positions, picture_url, birthday, email, social, contact, writeup, sort_order
    FROM players;

    DROP TABLE players;
    ALTER TABLE players_new RENAME TO players;

    INSERT INTO player_totals (
      player_id, games_played, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
    )
    SELECT
      b.player_id, b.games_played, b.pts, b.ast, b.reb, b.stl, b.blk, b.turnover, b.pf, b.fg2m, b.fg3m, b.fg2m_miss, b.fg3m_miss, b.ftm, b.ft_miss
    FROM player_totals_backup b
    INNER JOIN players p ON p.id = b.player_id
    ON CONFLICT(player_id) DO UPDATE SET
      games_played = excluded.games_played,
      pts = excluded.pts,
      ast = excluded.ast,
      reb = excluded.reb,
      stl = excluded.stl,
      blk = excluded.blk,
      turnover = excluded.turnover,
      pf = excluded.pf,
      fg2m = excluded.fg2m,
      fg3m = excluded.fg3m,
      fg2m_miss = excluded.fg2m_miss,
      fg3m_miss = excluded.fg3m_miss,
      ftm = excluded.ftm,
      ft_miss = excluded.ft_miss;

    DROP TABLE player_totals_backup;
  `);
}

function ensureGamePlayerStatsTeamColumn() {
  const columns = db.prepare('PRAGMA table_info(game_player_stats)').all();
  const hasTeamId = columns.some((column) => column.name === 'team_id');
  if (!hasTeamId) {
    db.exec("ALTER TABLE game_player_stats ADD COLUMN team_id TEXT NOT NULL DEFAULT ''");
  }

  db.exec(`
    UPDATE game_player_stats
    SET team_id = (
      SELECT p.team_id
      FROM players p
      WHERE p.id = game_player_stats.player_id
    )
    WHERE team_id = '' OR team_id IS NULL;
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_game_player_stats_game_id ON game_player_stats(game_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_game_player_stats_team_id ON game_player_stats(team_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_game_player_stats_player_id ON game_player_stats(player_id)');
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
    positions TEXT NOT NULL DEFAULT '[]',
    picture_url TEXT NOT NULL DEFAULT '',
    birthday TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    social TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT '',
    writeup TEXT NOT NULL DEFAULT '',
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
    team_id TEXT NOT NULL,
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

  CREATE TABLE IF NOT EXISTS live_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    event_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
ensurePlayerTotalsTable();
ensurePlayersTableWithoutLegacyStats();
ensureGamePlayerStatsTeamColumn();

const selectLegacyStateStmt = db.prepare('SELECT teams_json, games_json FROM app_state WHERE id = 1');
const selectLegacyConfigStmt = db.prepare('SELECT value_json FROM config_values WHERE key = ?');

const clearPlayersStmt = db.prepare('DELETE FROM players');
const clearPlayerTotalsStmt = db.prepare('DELETE FROM player_totals');
const clearTeamsStmt = db.prepare('DELETE FROM teams');
const clearGamePlayerStatsStmt = db.prepare('DELETE FROM game_player_stats');
const clearGamesStmt = db.prepare('DELETE FROM games');
const clearStatActionsStmt = db.prepare('DELETE FROM stat_actions');

const insertTeamStmt = db.prepare('INSERT INTO teams (id, name, color, sort_order) VALUES (@id, @name, @color, @sort_order)');
const insertPlayerStmt = db.prepare(`
  INSERT INTO players (
    id, team_id, name, number, positions, picture_url, birthday, email, social, contact, writeup, sort_order
  ) VALUES (
    @id, @team_id, @name, @number, @positions, @picture_url, @birthday, @email, @social, @contact, @writeup, @sort_order
  )
`);

const upsertPlayerTotalsStmt = db.prepare(`
  INSERT INTO player_totals (
    player_id, games_played, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
  ) VALUES (
    @player_id, @games_played, @pts, @ast, @reb, @stl, @blk, @turnover, @pf, @fg2m, @fg3m, @fg2m_miss, @fg3m_miss, @ftm, @ft_miss
  )
  ON CONFLICT(player_id) DO UPDATE SET
    games_played = excluded.games_played,
    pts = excluded.pts,
    ast = excluded.ast,
    reb = excluded.reb,
    stl = excluded.stl,
    blk = excluded.blk,
    turnover = excluded.turnover,
    pf = excluded.pf,
    fg2m = excluded.fg2m,
    fg3m = excluded.fg3m,
    fg2m_miss = excluded.fg2m_miss,
    fg3m_miss = excluded.fg3m_miss,
    ftm = excluded.ftm,
    ft_miss = excluded.ft_miss
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
    game_id, team_id, player_id, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
  ) VALUES (
    @game_id, @team_id, @player_id, @pts, @ast, @reb, @stl, @blk, @turnover, @pf, @fg2m, @fg3m, @fg2m_miss, @fg3m_miss, @ftm, @ft_miss
  )
`);

const insertStatActionStmt = db.prepare(`
  INSERT INTO stat_actions (id, label, category, stat, val, color_class, tracking_stat, sort_order)
  VALUES (@id, @label, @category, @stat, @val, @color_class, @tracking_stat, @sort_order)
`);

const selectTeamsStmt = db.prepare('SELECT id, name, color FROM teams ORDER BY sort_order ASC, id ASC');
const selectPlayersStmt = db.prepare(`
  SELECT
    p.id,
    p.team_id,
    p.name,
    p.number,
    p.positions,
    p.picture_url,
    p.birthday,
    p.email,
    p.social,
    p.contact,
    p.writeup,
    COALESCE(t.games_played, 0) AS games_played,
    COALESCE(t.pts, 0) AS pts,
    COALESCE(t.ast, 0) AS ast,
    COALESCE(t.reb, 0) AS reb,
    COALESCE(t.stl, 0) AS stl,
    COALESCE(t.blk, 0) AS blk,
    COALESCE(t.turnover, 0) AS turnover,
    COALESCE(t.pf, 0) AS pf,
    COALESCE(t.fg2m, 0) AS fg2m,
    COALESCE(t.fg3m, 0) AS fg3m,
    COALESCE(t.fg2m_miss, 0) AS fg2m_miss,
    COALESCE(t.fg3m_miss, 0) AS fg3m_miss,
    COALESCE(t.ftm, 0) AS ftm,
    COALESCE(t.ft_miss, 0) AS ft_miss
  FROM players p
  LEFT JOIN player_totals t ON t.player_id = p.id
  ORDER BY p.sort_order ASC, p.id ASC
`);
const selectGamesStmt = db.prepare(`
  SELECT id, date, team_a_id, team_b_id, team_a_name, team_b_name, team_a_score, team_b_score, game_log_json
  FROM games
  ORDER BY sort_order ASC, id DESC
`);
const selectGamePlayerStatsStmt = db.prepare(`
  SELECT game_id, team_id, player_id, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss
  FROM game_player_stats
`);
const selectPlayerTeamIdStmt = db.prepare('SELECT team_id FROM players WHERE id = ?');
const selectRelationalStatsStmt = db.prepare(`
  SELECT
    gps.game_id,
    g.date AS game_date,
    gps.team_id,
    t.name AS team_name,
    gps.player_id,
    p.name AS player_name,
    gps.pts,
    gps.ast,
    gps.reb,
    gps.stl,
    gps.blk,
    gps.turnover,
    gps.pf,
    gps.fg2m,
    gps.fg3m,
    gps.fg2m_miss,
    gps.fg3m_miss,
    gps.ftm,
    gps.ft_miss
  FROM game_player_stats gps
  LEFT JOIN games g ON g.id = gps.game_id
  LEFT JOIN teams t ON t.id = gps.team_id
  LEFT JOIN players p ON p.id = gps.player_id
  ORDER BY g.sort_order ASC, gps.team_id ASC, gps.player_id ASC
`);
const selectStatActionsStmt = db.prepare(`
  SELECT id, label, category, stat, val, color_class, tracking_stat
  FROM stat_actions
  ORDER BY sort_order ASC, id ASC
`);

const deleteTeamStmt = db.prepare('DELETE FROM teams WHERE id = ?');
const deletePlayersByTeamStmt = db.prepare('DELETE FROM players WHERE team_id = ?');
const selectPlayerIdsByTeamStmt = db.prepare('SELECT id FROM players WHERE team_id = ?');
const deletePlayerTotalsByPlayerStmt = db.prepare('DELETE FROM player_totals WHERE player_id = ?');
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
const selectLiveEventsSinceStmt = db.prepare(`
  SELECT seq, event_id, event_json, created_at
  FROM live_events
  WHERE seq > ?
  ORDER BY seq ASC
`);
const selectLiveEventByIdStmt = db.prepare('SELECT seq, event_id, event_json, created_at FROM live_events WHERE event_id = ?');
const insertLiveEventStmt = db.prepare('INSERT INTO live_events (event_id, event_json) VALUES (?, ?)');
const deleteLiveEventsStmt = db.prepare('DELETE FROM live_events');

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
      positions: Array.isArray(parseJsonSafe(player.positions, [])) ? parseJsonSafe(player.positions, []) : [],
      pictureUrl: player.picture_url || '',
      birthday: player.birthday || '',
      email: player.email || '',
      social: player.social || '',
      contact: player.contact || '',
      writeup: player.writeup || '',
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
  clearPlayerTotalsStmt.run();
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
        positions: JSON.stringify(Array.isArray(player.positions) ? player.positions : []),
        picture_url: player.pictureUrl || '',
        birthday: player.birthday || '',
        email: player.email || '',
        social: player.social || '',
        contact: player.contact || '',
        writeup: player.writeup || '',
        sort_order: playerIndex
      });

      upsertPlayerTotalsStmt.run({
        player_id: player.id,
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
        ft_miss: toInt(totalStats.ft_miss)
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
      const playerTeamRow = selectPlayerTeamIdStmt.get(playerId);
      const fallbackTeamId = playerId.startsWith('b') ? game.teamBId : game.teamAId;
      insertGamePlayerStatStmt.run({
        game_id: game.id,
        team_id: (playerTeamRow && playerTeamRow.team_id) || fallbackTeamId || '',
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

function readLiveEventsSince(sinceSeq = 0) {
  const threshold = toInt(sinceSeq);
  return selectLiveEventsSinceStmt.all(threshold).map((row) => ({
    seq: toInt(row.seq),
    eventId: row.event_id,
    event: parseJsonSafe(row.event_json, null),
    createdAt: row.created_at
  })).filter((row) => row.event && typeof row.event === 'object');
}

function getEventTimestampFromId(id) {
  if (!id) return 0;
  const parsed = Number.parseInt(String(id).split('_')[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeEventLists(existingList = [], incomingList = [], fallbackPrefix = 'evt', maxItems = 250) {
  const mergedById = new Map();

  const pushWithId = (event, index, sourceTag) => {
    const safeEvent = event && typeof event === 'object' ? { ...event } : null;
    if (!safeEvent) return;
    const eventId = safeEvent.id || `${fallbackPrefix}_${sourceTag}_${index}`;
    safeEvent.id = eventId;

    if (!mergedById.has(eventId)) {
      mergedById.set(eventId, safeEvent);
      return;
    }

    // Prefer newest incoming fields when IDs collide, but keep existing metadata.
    mergedById.set(eventId, {
      ...mergedById.get(eventId),
      ...safeEvent
    });
  };

  (existingList || []).forEach((event, index) => pushWithId(event, index, 'existing'));
  (incomingList || []).forEach((event, index) => pushWithId(event, index, 'incoming'));

  return Array.from(mergedById.values())
    .sort((a, b) => getEventTimestampFromId(b.id) - getEventTimestampFromId(a.id))
    .slice(0, maxItems);
}

function mergeActiveSession(existingSession, incomingSession) {
  const existing = existingSession && typeof existingSession === 'object' ? existingSession : {};
  const incoming = incomingSession && typeof incomingSession === 'object' ? incomingSession : {};
  const existingLineupRevision = toInt(existing.lineupRevision);
  const incomingLineupRevision = toInt(incoming.lineupRevision);
  const hasIncomingGameLog = Object.prototype.hasOwnProperty.call(incoming, 'gameLog');
  const hasIncomingLoggedHistory = Object.prototype.hasOwnProperty.call(incoming, 'loggedHistory');
  const hasIncomingPlayedPlayers = Object.prototype.hasOwnProperty.call(incoming, 'playedPlayers');
  // Prefer incoming rotation on equal revisions to avoid reverting lineup arrays
  // when multiple lineup events are generated within the same millisecond.
  const preferIncomingRotation = incomingLineupRevision >= existingLineupRevision;

  const pickRotationArray = (key) => {
    const incomingArr = Array.isArray(incoming[key]) ? incoming[key] : null;
    const existingArr = Array.isArray(existing[key]) ? existing[key] : null;
    if (preferIncomingRotation) {
      if (incomingArr) return incomingArr;
      if (existingArr) return existingArr;
    } else {
      if (existingArr) return existingArr;
      if (incomingArr) return incomingArr;
    }
    return [];
  };

  return {
    ...existing,
    ...incoming,
    lineupRevision: Math.max(existingLineupRevision, incomingLineupRevision),
    teamALineup: pickRotationArray('teamALineup'),
    teamABench: pickRotationArray('teamABench'),
    teamBLineup: pickRotationArray('teamBLineup'),
    teamBBench: pickRotationArray('teamBBench'),
    // If payload explicitly includes these fields (even empty), treat them as authoritative.
    gameLog: hasIncomingGameLog
      ? mergeEventLists([], Array.isArray(incoming.gameLog) ? incoming.gameLog : [], 'glog', 300)
      : mergeEventLists(existing.gameLog || [], incoming.gameLog || [], 'glog', 300),
    loggedHistory: hasIncomingLoggedHistory
      ? mergeEventLists([], Array.isArray(incoming.loggedHistory) ? incoming.loggedHistory : [], 'hist', 300)
      : mergeEventLists(existing.loggedHistory || [], incoming.loggedHistory || [], 'hist', 300),
    playedPlayers: hasIncomingPlayedPlayers
      ? Array.from(new Set(Array.isArray(incoming.playedPlayers) ? incoming.playedPlayers : []))
      : Array.from(new Set([...(existing.playedPlayers || []), ...(incoming.playedPlayers || [])]))
  };
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

function broadcastLiveEvent(record, sourceClientId = null) {
  if (!wss || !record) return;
  const payload = JSON.stringify({
    type: 'live_event',
    sourceClientId,
    seq: toInt(record.seq),
    event: record.event
  });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

function appendLiveEvent(event, sourceClientId = null) {
  if (!event || typeof event !== 'object') {
    throw new Error('Invalid event payload');
  }
  if (!event.id) {
    throw new Error('Event id is required');
  }

  let row = selectLiveEventByIdStmt.get(event.id);
  if (!row) {
    insertLiveEventStmt.run(event.id, JSON.stringify(event));
    row = selectLiveEventByIdStmt.get(event.id);
  }

  const record = {
    seq: toInt(row.seq),
    eventId: row.event_id,
    event: parseJsonSafe(row.event_json, null),
    createdAt: row.created_at
  };

  if (record.event && typeof record.event === 'object') {
    broadcastLiveEvent(record, sourceClientId);
  }

  return record;
}

function writeActiveSession(session, sourceClientId = null) {
  lastActiveSessionSourceId = sourceClientId;
  const mergedSession = mergeActiveSession(readActiveSession(), session || {});
  upsertActiveSessionStmt.run({
    session_json: JSON.stringify(mergedSession)
  });
  broadcastSync({ sourceClientId });
}

function clearActiveSession(sourceClientId = null) {
  lastActiveSessionSourceId = sourceClientId;
  deleteActiveSessionStmt.run();
  deleteLiveEventsStmt.run();
  broadcastSync({ sourceClientId });
}

function clearLiveEvents(sourceClientId = null) {
  lastActiveSessionSourceId = sourceClientId;
  deleteLiveEventsStmt.run();
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

app.get('/api/stats', (_req, res) => {
  const rows = selectRelationalStatsStmt.all().map((row) => ({
    gameId: row.game_id,
    gameDate: row.game_date,
    teamId: row.team_id,
    teamName: row.team_name,
    playerId: row.player_id,
    playerName: row.player_name,
    stats: {
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
    }
  }));

  res.json({ stats: rows });
});

app.post('/api/auth/login', (req, res) => {
  const { role, password } = req.body || {};

  if (role !== 'operator' && role !== 'admin') {
    res.status(400).json({ error: 'Invalid role' });
    return;
  }

  if (typeof password !== 'string' || password.length === 0) {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  const expected = AUTH_PASSWORDS[role];
  if (password !== expected) {
    res.status(401).json({ error: 'Invalid login credentials' });
    return;
  }

  res.json({ ok: true, role });
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
      deletePlayerTotalsByPlayerStmt.run(playerId);
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

app.get('/api/live-events', (req, res) => {
  const sinceSeq = toInt(req.query.sinceSeq);
  res.json({ events: readLiveEventsSince(sinceSeq) });
});

app.post('/api/live-events', (req, res) => {
  const { event, sourceClientId } = req.body || {};
  if (!event || typeof event !== 'object') {
    res.status(400).json({ error: 'Body must include event object' });
    return;
  }
  if (!event.id) {
    res.status(400).json({ error: 'event.id is required' });
    return;
  }

  try {
    const record = appendLiveEvent(event, sourceClientId || null);
    res.json({ ok: true, seq: record.seq, eventId: record.eventId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to append live event' });
  }
});

app.post('/api/live-events/reset', (req, res) => {
  const { sourceClientId } = req.body || {};
  clearLiveEvents(sourceClientId || null);
  res.json({ ok: true });
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
