const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const { WebSocketServer } = require('ws');

const SHARP_ENABLED = String(process.env.WKND_DISABLE_SHARP || '').trim() !== '1';
let sharp = null;
if (SHARP_ENABLED) {
  try {
    sharp = require('sharp');
  } catch (error) {
    sharp = null;
  }
}

function requireSharp() {
  if (!sharp) {
    const error = new Error('Image generation is disabled because sharp is unavailable in this build.');
    error.code = 'SHARP_UNAVAILABLE';
    throw error;
  }
}

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
let wss = null;
let lastActiveSessionSourceId = null;
let lastActiveSessionClearedAt = 0;
let lastDiscardedSessionInstanceId = '';
let lastDiscardedSessionClearedAt = 0;

const AUTH_PASSWORDS = {
  operator: process.env.WKND_OPERATOR_PASSWORD || 'operator123!!!',
  admin: process.env.WKND_ADMIN_PASSWORD || 'admin123!!!'
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_FALLBACK_MODELS = [
  GEMINI_MODEL,
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest'
];
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_FALLBACK_MODELS = [
  OPENAI_MODEL,
  'gpt-4.1-mini',
  'gpt-4o-mini'
];
const GA_MEASUREMENT_ID = String(process.env.GA_MEASUREMENT_ID || '').trim();
const GA_ENABLE_IN_DEV = ['1', 'true', 'yes'].includes(
  String(process.env.WKND_ENABLE_GA_DEV || process.env.GA_ENABLE_IN_DEV || '').trim().toLowerCase()
);
const AI_PRIMARY_PROVIDER = String(process.env.AI_PRIMARY_PROVIDER || 'gemini').trim().toLowerCase();
const SOCIAL_COVER_LOGO_PATHS = [
  path.join(__dirname, 'wknd-s3-logo.png'),
  path.join(__dirname, 'src', 'wknd-s3-logo.png')
];
const SVG_FONT_STACK = 'Noto Sans, DejaVu Sans, Liberation Sans, Arial, sans-serif';

function resolveSocialCoverLogoPath() {
  return SOCIAL_COVER_LOGO_PATHS.find((logoPath) => {
    try {
      return fs.existsSync(logoPath);
    } catch {
      return false;
    }
  }) || '';
}

function getAiProviderOrder() {
  if (AI_PRIMARY_PROVIDER === 'openai') {
    return ['openai', 'gemini'];
  }
  return ['gemini', 'openai'];
}

function shouldTryNextGeminiModel(status) {
  return status === 404 || status === 429 || status >= 500;
}

function shouldTryNextOpenAiModel(status) {
  return status === 404 || status === 429 || status >= 500;
}

function extractOpenAiText(data) {
  const direct = String(data?.choices?.[0]?.message?.content || '').trim();
  if (direct) return direct;
  const parts = data?.choices?.[0]?.message?.content;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => String(part?.text || ''))
    .join(' ')
    .trim();
}

async function generateTextWithOpenAiFallback(prompt, options = {}) {
  if (!OPENAI_API_KEY) {
    return {
      text: '',
      attemptedModels: [],
      lastErrorStatus: 0,
      lastErrorText: 'OpenAI API key is not configured.'
    };
  }

  const temperature = Number.isFinite(Number(options.temperature))
    ? Number(options.temperature)
    : 0.7;
  const maxTokens = Number.isFinite(Number(options.maxTokens))
    ? Number(options.maxTokens)
    : 256;

  const attemptedModels = [];
  let lastErrorStatus = 0;
  let lastErrorText = '';
  const uniqueModels = Array.from(new Set(OPENAI_FALLBACK_MODELS.filter(Boolean)));

  for (const modelName of uniqueModels) {
    attemptedModels.push(modelName);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: String(prompt || '') }],
          temperature,
          max_tokens: maxTokens
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = extractOpenAiText(data);
        if (text) {
          return {
            text,
            attemptedModels,
            lastErrorStatus: 0,
            lastErrorText: ''
          };
        }
        lastErrorText = 'OpenAI returned an empty response.';
        continue;
      }

      lastErrorStatus = response.status;
      lastErrorText = await response.text();
      if (shouldTryNextOpenAiModel(response.status)) {
        continue;
      }
      break;
    } catch (error) {
      lastErrorStatus = 0;
      lastErrorText = String(error?.message || error || 'OpenAI request failed');
      break;
    }
  }

  return {
    text: '',
    attemptedModels,
    lastErrorStatus,
    lastErrorText
  };
}

async function generateTextWithGeminiFallback(prompt, options = {}) {
  if (!GEMINI_API_KEY) {
    return {
      text: '',
      attemptedModels: [],
      lastErrorStatus: 0,
      lastErrorText: 'Gemini API key is not configured.'
    };
  }

  const temperature = Number.isFinite(Number(options.temperature))
    ? Number(options.temperature)
    : 0.7;
  const maxTokens = Number.isFinite(Number(options.maxTokens))
    ? Number(options.maxTokens)
    : 256;

  const attemptedModels = [];
  let lastErrorStatus = 0;
  let lastErrorText = '';
  const uniqueModels = Array.from(new Set(GEMINI_FALLBACK_MODELS.filter(Boolean)));

  for (const modelName of uniqueModels) {
    attemptedModels.push(modelName);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: String(prompt || '') }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = (data?.candidates || [])
          .flatMap((candidate) => candidate?.content?.parts || [])
          .map((part) => String(part?.text || ''))
          .join('\n')
          .trim();
        if (text) {
          return {
            text,
            attemptedModels,
            lastErrorStatus: 0,
            lastErrorText: ''
          };
        }
        lastErrorText = 'Gemini returned an empty response.';
        continue;
      }

      lastErrorStatus = response.status;
      lastErrorText = await response.text();
      if (shouldTryNextGeminiModel(response.status)) {
        continue;
      }
      break;
    } catch (error) {
      lastErrorStatus = 0;
      lastErrorText = String(error?.message || error || 'Gemini request failed');
      break;
    }
  }

  return {
    text: '',
    attemptedModels,
    lastErrorStatus,
    lastErrorText
  };
}

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
const playerImagesDir = path.join(dataDir, 'player-images');
if (!fs.existsSync(playerImagesDir)) {
  fs.mkdirSync(playerImagesDir, { recursive: true });
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

function ensureGamesYouTubeColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'youtube_url')) {
    db.exec('ALTER TABLE games ADD COLUMN youtube_url TEXT NOT NULL DEFAULT ""');
  }
}

function ensureGamesWriteupColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'game_writeup')) {
    db.exec('ALTER TABLE games ADD COLUMN game_writeup TEXT NOT NULL DEFAULT ""');
  }
}

function ensureGamesPotgWriteupColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'potg_writeup')) {
    db.exec('ALTER TABLE games ADD COLUMN potg_writeup TEXT NOT NULL DEFAULT ""');
  }
}

function ensureGamesPeriodSnapshotsColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'period_snapshots_json')) {
    db.exec('ALTER TABLE games ADD COLUMN period_snapshots_json TEXT NOT NULL DEFAULT "[]"');
  }
}

function ensureGamesSocialCoverColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'social_cover_data_url')) {
    db.exec('ALTER TABLE games ADD COLUMN social_cover_data_url TEXT NOT NULL DEFAULT ""');
  }
}

function ensureGamesDnpColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'dnp_players_json')) {
    db.exec('ALTER TABLE games ADD COLUMN dnp_players_json TEXT NOT NULL DEFAULT "[]"');
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

function ensureGamePlayerStatsMinutesColumn() {
  const columns = db.prepare('PRAGMA table_info(game_player_stats)').all();
  const hasMinutes = columns.some((column) => column.name === 'minutes');
  if (!hasMinutes) {
    db.exec("ALTER TABLE game_player_stats ADD COLUMN minutes TEXT NOT NULL DEFAULT ''");
  }
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
    youtube_url TEXT NOT NULL DEFAULT '',
    game_writeup TEXT NOT NULL DEFAULT '',
    potg_writeup TEXT NOT NULL DEFAULT '',
    social_cover_data_url TEXT NOT NULL DEFAULT '',
    dnp_players_json TEXT NOT NULL DEFAULT '[]',
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
    minutes TEXT NOT NULL DEFAULT '',
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
ensureGamesYouTubeColumn();
ensureGamesWriteupColumn();
ensureGamesPotgWriteupColumn();
ensureGamesPeriodSnapshotsColumn();
ensureGamesSocialCoverColumn();
ensureGamesDnpColumn();
ensurePlayerProfileColumns();
ensurePlayerTotalsTable();
ensurePlayersTableWithoutLegacyStats();
ensureGamePlayerStatsTeamColumn();
ensureGamePlayerStatsMinutesColumn();

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
    id, date, team_a_id, team_b_id, team_a_name, team_b_name, team_a_score, team_b_score, game_log_json, period_snapshots_json, youtube_url, game_writeup, potg_writeup, social_cover_data_url, dnp_players_json, sort_order
  ) VALUES (
    @id, @date, @team_a_id, @team_b_id, @team_a_name, @team_b_name, @team_a_score, @team_b_score, @game_log_json, @period_snapshots_json, @youtube_url, @game_writeup, @potg_writeup, @social_cover_data_url, @dnp_players_json, @sort_order
  )
`);

const insertGamePlayerStatStmt = db.prepare(`
  INSERT INTO game_player_stats (
    game_id, team_id, player_id, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss, minutes
  ) VALUES (
    @game_id, @team_id, @player_id, @pts, @ast, @reb, @stl, @blk, @turnover, @pf, @fg2m, @fg3m, @fg2m_miss, @fg3m_miss, @ftm, @ft_miss, @minutes
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
  SELECT id, date, team_a_id, team_b_id, team_a_name, team_b_name, team_a_score, team_b_score, game_log_json, period_snapshots_json, youtube_url, game_writeup, potg_writeup, social_cover_data_url, dnp_players_json
  FROM games
  ORDER BY sort_order ASC, id DESC
`);
const selectGamePlayerStatsStmt = db.prepare(`
  SELECT game_id, team_id, player_id, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss, minutes
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
    gps.ft_miss,
    gps.minutes
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

function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mimeType = String(match[1] || '').toLowerCase();
  const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
  if (!allowed.has(mimeType)) return null;
  const base64 = String(match[2] || '').replace(/\s+/g, '');
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer || !buffer.length) return null;
  return { mimeType, buffer };
}

function getImageExtFromMimeType(mimeType) {
  const value = String(mimeType || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  if (value.includes('jpg') || value.includes('jpeg')) return 'jpg';
  return '';
}

function getImageExtFromPathname(pathname) {
  const lower = String(pathname || '').toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  return '';
}

function sanitizeForFileName(value, fallback = 'player') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function isLocallyHostedPlayerImageUrl(urlValue) {
  const value = String(urlValue || '').trim();
  if (!value) return false;
  if (value.startsWith('/data/player-images/')) return true;
  try {
    const url = new URL(value, 'http://localhost');
    return String(url.pathname || '').startsWith('/data/player-images/');
  } catch {
    return false;
  }
}

function normalizeManualPlayerImageValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  if (isLocallyHostedPlayerImageUrl(value)) return value;

  // Allow users to type only a file name (e.g. "player-1.jpg") for files
  // manually placed under data/player-images.
  const simpleNamePattern = /^[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i;
  if (simpleNamePattern.test(value)) {
    return `/data/player-images/${value}`;
  }

  return value;
}

async function cacheRemotePlayerImage(profileImageUrl, playerIdentityHint = 'player') {
  const value = normalizeManualPlayerImageValue(profileImageUrl);
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  if (isLocallyHostedPlayerImageUrl(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return value;
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'wknd-stats/profile-image-cache'
      }
    });
    if (!response.ok) {
      return value;
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return value;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length || buffer.length > (8 * 1024 * 1024)) {
      return value;
    }

    if (sharp) {
      const meta = await sharp(buffer).metadata();
      if (!meta?.width || !meta?.height) {
        return value;
      }
    }

    const extension = getImageExtFromMimeType(contentType) || getImageExtFromPathname(url.pathname) || 'jpg';
    const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12);
    const safeIdentity = sanitizeForFileName(playerIdentityHint, 'player');
    const fileName = `${safeIdentity}-${hash}.${extension}`;
    const absolutePath = path.join(playerImagesDir, fileName);
    fs.writeFileSync(absolutePath, buffer);
    return `/data/player-images/${fileName}`;
  } catch {
    return value;
  }
}

async function persistPlayerImagesForTeams(nextTeams) {
  const safeTeams = Array.isArray(nextTeams) ? nextTeams : [];
  const hydrated = [];

  for (const team of safeTeams) {
    const safePlayers = Array.isArray(team?.players) ? team.players : [];
    const playersWithCachedImages = [];

    for (const player of safePlayers) {
      const currentPictureUrl = String(player?.pictureUrl || '').trim();
      const pictureUrl = currentPictureUrl
        ? await cacheRemotePlayerImage(currentPictureUrl, player?.id || player?.name || 'player')
        : '';
      playersWithCachedImages.push({
        ...player,
        pictureUrl
      });
    }

    hydrated.push({
      ...team,
      players: playersWithCachedImages
    });
  }

  return hydrated;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSocialCoverText(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';

  const normalized = raw
    .replace(/[•·]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '');

  return normalized.replace(/\s+/g, ' ').trim();
}

function trimForMeta(text, limit) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (!limit || value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function getRecapFirstLine(game) {
  const rawWriteup = String(game?.gameWriteup || '');
  if (!rawWriteup) return '';
  const lines = rawWriteup
    .split(/\r?\n/)
    .map((line) => normalizeSocialCoverText(line))
    .filter(Boolean);
  return lines[0] || '';
}

function getRecapFirstParagraph(game) {
  const rawWriteup = String(game?.gameWriteup || '');
  if (!rawWriteup) return '';
  const firstParagraph = rawWriteup
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .find(Boolean) || '';
  return normalizeSocialCoverText(firstParagraph);
}

function getSocialImageVersion(game) {
  let logoVersionPart = 'logo:none';
  const logoPath = resolveSocialCoverLogoPath();
  if (logoPath) {
    try {
      const stat = fs.statSync(logoPath);
      logoVersionPart = `logo:${path.basename(logoPath)}:${Number(stat.size || 0)}:${Math.floor(Number(stat.mtimeMs || 0))}`;
    } catch {
      logoVersionPart = `logo:${path.basename(logoPath)}`;
    }
  }

  if (!game) {
    return crypto.createHash('sha1').update(logoVersionPart).digest('hex').slice(0, 12);
  }
  const source = [
    logoVersionPart,
    String(game.id || ''),
    String(game.date || ''),
    String(game.teamAName || ''),
    String(game.teamBName || ''),
    String(game.teamAScore || ''),
    String(game.teamBScore || ''),
    String(game.gameWriteup || ''),
    String(game.potgWriteup || ''),
    String(game.socialCoverDataUrl || '')
  ].join('|');
  return crypto.createHash('sha1').update(source).digest('hex').slice(0, 12);
}

function buildRecapTitle(game) {
  if (!game) return 'WKND League Stats';
  const recapFirstLine = getRecapFirstLine(game);
  if (recapFirstLine) {
    return trimForMeta(recapFirstLine, 110);
  }
  const teamAName = normalizeSocialCoverText(game.teamAName) || 'Team A';
  const teamBName = normalizeSocialCoverText(game.teamBName) || 'Team B';
  return `Game Recap: ${teamAName} ${game.teamAScore} - ${game.teamBScore} ${teamBName}`;
}

function buildRecapDescription(game) {
  const fallback = 'Live scores, game recap, and player performances from WKND League.';
  const firstParagraph = getRecapFirstParagraph(game);
  if (!firstParagraph) return fallback;
  return trimForMeta(firstParagraph, 190);
}

function buildSocialMetaTags({ req, game }) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const canonicalPath = game ? `/?view=game&gameId=${encodeURIComponent(game.id)}` : '/';
  const canonicalUrl = `${origin}${canonicalPath}`;
  const title = buildRecapTitle(game);
  const description = buildRecapDescription(game);
  const imageVersion = getSocialImageVersion(game);
  const imageUrl = game
    ? `${origin}/api/social-cover/${encodeURIComponent(game.id)}.png?v=${encodeURIComponent(imageVersion)}`
    : `${origin}/api/social-cover/default.png?v=${encodeURIComponent(imageVersion)}`;

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="WKND League Stats">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`
  ].join('\n    ');
}

async function buildSocialCoverPng(game, teams = [], baseOrigin = '') {
  requireSharp();
  const W = 1200;
  const H = 630;
  const teamA = (Array.isArray(teams) ? teams : []).find((team) => team.id === game?.teamAId) || null;
  const teamB = (Array.isArray(teams) ? teams : []).find((team) => team.id === game?.teamBId) || null;
  const colorA = String(teamA?.color || '#10b981');
  const colorB = String(teamB?.color || '#3b82f6');
  const teamAName = String(game?.teamAName || 'HOME').toUpperCase();
  const teamBName = String(game?.teamBName || 'AWAY').toUpperCase();
  const teamAScore = Number(game?.teamAScore || 0);
  const teamBScore = Number(game?.teamBScore || 0);
  const dateText = String(game?.date || '').trim();
  const potg = game ? derivePlayerOfTheGameFromState(game, teams) : null;
  const potgName = normalizeSocialCoverText(potg?.name || '');
  const potgStats = normalizeSocialCoverText(potg?.statsLine || '');
  const potgMeta = normalizeSocialCoverText(`#${potg?.number || '-'} • ${potg?.teamName || ''}`);
  const potgInitial = getInitials(potgName || '?');
  const potgTeamColor = String(potg?.teamColor || '#f97316');
  const winner = teamAScore > teamBScore ? teamAName : (teamBScore > teamAScore ? teamBName : null);
  const resultText = winner ? `${winner} WINS` : 'FINAL SCORE';
  const snippet = normalizeSocialCoverText(String(game?.gameWriteup || '').trim()).slice(0, 120);
  const snippetText = snippet ? `"${snippet}${snippet.length === 120 ? '...' : ''}"` : '';

  const avatarCx = W / 2;
  const avatarCy = 432;
  const avatarR = 44;
  const avatarSize = avatarR * 2;
  const avatarLeft = avatarCx - avatarR;
  const avatarTop = avatarCy - avatarR;
  let logoOverlay = null;
  let avatarOverlay = null;
  const logoPath = resolveSocialCoverLogoPath();

  if (logoPath) {
    try {
      logoOverlay = await sharp(logoPath)
        .resize({ width: 220, height: 44, fit: 'contain', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (_) {
      logoOverlay = null;
    }
  }

  if (potg?.pictureUrl) {
    try {
      const avatarSource = await readImageBufferFromSource(potg.pictureUrl, baseOrigin);
      if (avatarSource) {
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${avatarSize}" height="${avatarSize}"><circle cx="${avatarR}" cy="${avatarR}" r="${avatarR}" fill="#fff"/></svg>`);
        avatarOverlay = await sharp(avatarSource)
          .rotate()
          .resize(avatarSize, avatarSize, { fit: 'cover', position: 'centre' })
          .composite([{ input: mask, blend: 'dest-in' }])
          .png({ compressionLevel: 9 })
          .toBuffer();
      }
    } catch (_) {
      avatarOverlay = null;
    }
  }

  const svg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <pattern id="diag" width="52" height="52" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="26" height="52" fill="rgba(255,255,255,0.05)"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#diag)"/>

  <rect x="0" y="0" width="${W / 2}" height="6" fill="${escapeHtml(colorA)}"/>
  <rect x="${W / 2}" y="0" width="${W / 2}" height="6" fill="${escapeHtml(colorB)}"/>
  <rect x="0" y="${H - 6}" width="${W / 2}" height="6" fill="${escapeHtml(colorA)}"/>
  <rect x="${W / 2}" y="${H - 6}" width="${W / 2}" height="6" fill="${escapeHtml(colorB)}"/>

  <rect x="1000" y="28" width="160" height="32" rx="8" fill="#1e293b"/>

  <text x="${W - 44}" y="56" fill="#94a3b8" text-anchor="end" font-size="24" font-family="${SVG_FONT_STACK}">${escapeHtml(dateText)}</text>

  <text x="80" y="140" fill="${escapeHtml(colorA)}" font-size="44" font-family="${SVG_FONT_STACK}" font-weight="700">${escapeHtml(teamAName)}</text>
  <text x="80" y="300" fill="#ffffff" font-size="170" font-family="${SVG_FONT_STACK}" font-weight="800">${teamAScore}</text>

  <text x="${W - 80}" y="140" fill="${escapeHtml(colorB)}" text-anchor="end" font-size="44" font-family="${SVG_FONT_STACK}" font-weight="700">${escapeHtml(teamBName)}</text>
  <text x="${W - 80}" y="300" fill="#ffffff" text-anchor="end" font-size="170" font-family="${SVG_FONT_STACK}" font-weight="800">${teamBScore}</text>

  <text x="${W / 2}" y="238" fill="#334155" text-anchor="middle" font-size="56" font-family="${SVG_FONT_STACK}" font-weight="700">VS</text>
  <text x="${W / 2}" y="310" fill="#64748b" text-anchor="middle" font-size="40" font-family="${SVG_FONT_STACK}">${escapeHtml(resultText)}</text>
  <line x1="64" y1="352" x2="1136" y2="352" stroke="#334155" stroke-width="3"/>

  ${potg ? `
  <text x="${W / 2}" y="368" fill="#f97316" text-anchor="middle" font-size="24" font-family="${SVG_FONT_STACK}" font-weight="700">PLAYER OF THE GAME</text>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 4}" fill="${escapeHtml(potgTeamColor)}66"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 1}" fill="#0b1220"/>
  ${avatarOverlay ? '' : `<text x="${avatarCx}" y="${avatarCy + 12}" text-anchor="middle" fill="#f8fafc" font-size="36" font-family="${SVG_FONT_STACK}" font-weight="800">${escapeHtml(potgInitial)}</text>`}
  <text x="${W / 2}" y="514" fill="#94a3b8" text-anchor="middle" font-size="24" font-family="${SVG_FONT_STACK}" font-weight="700">${escapeHtml(potgMeta)}</text>
  <text x="${W / 2}" y="554" fill="#ffffff" text-anchor="middle" font-size="56" font-family="${SVG_FONT_STACK}" font-weight="800">${escapeHtml(potgName)}</text>
  <text x="${W / 2}" y="584" fill="#e2e8f0" text-anchor="middle" font-size="36" font-family="${SVG_FONT_STACK}" font-weight="700">${escapeHtml(potgStats)}</text>
  ` : ''}

  ${snippetText ? `<text x="${W / 2}" y="610" fill="#475569" text-anchor="middle" font-size="20" font-style="italic" font-family="${SVG_FONT_STACK}">${escapeHtml(snippetText)}</text>` : ''}
</svg>
  `);

  const layers = [];
  if (avatarOverlay) {
    layers.push({ input: avatarOverlay, left: avatarLeft, top: avatarTop });
  }
  if (logoOverlay) {
    layers.push({ input: logoOverlay, left: 40, top: 28 });
  }
  return sharp(svg)
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function derivePlayerOfTheGameFromState(game, teams) {
  const POINTS_LEADER_BONUS = 1.25;
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

  const stats = game?.playerStats && typeof game.playerStats === 'object' ? game.playerStats : {};
  const entries = Object.entries(stats);
  if (!entries.length) return null;

  const teamsList = Array.isArray(teams) ? teams : [];
  const players = teamsList.flatMap((team) => Array.isArray(team?.players) ? team.players : []);
  const byId = new Map(players.map((player) => [player.id, player]));

  const teamAScoreValue = Number(game?.teamAScore || 0);
  const teamBScoreValue = Number(game?.teamBScore || 0);
  const winnerTeamId = teamAScoreValue === teamBScoreValue
    ? null
    : (teamAScoreValue > teamBScoreValue ? game?.teamAId : game?.teamBId);

  const allowedPlayerIds = new Set(
    (winnerTeamId
      ? teamsList.filter((team) => team?.id === winnerTeamId)
      : teamsList
    ).flatMap((team) => (Array.isArray(team?.players) ? team.players : []).map((player) => player.id))
  );

  const eligible = entries
    .filter(([playerId]) => allowedPlayerIds.has(playerId))
    .map(([playerId, raw]) => {
      const line = raw || {};
      return {
        playerId,
        pts: Number(line.pts || 0),
        reb: Number(line.reb || 0),
        ast: Number(line.ast || 0),
        perScore: computePerStyleScore(line)
      };
    });

  const maxPoints = eligible.reduce((maxValue, entry) => (entry.pts > maxValue ? entry.pts : maxValue), 0);

  let best = null;
  eligible.forEach((entry) => {
    const weightedPerScore = entry.perScore + ((maxPoints > 0 && entry.pts === maxPoints) ? POINTS_LEADER_BONUS : 0);
    if (!best || weightedPerScore > best.perScore || (weightedPerScore === best.perScore && entry.pts > best.pts)) {
      best = { ...entry, perScore: weightedPerScore };
    }
  });

  if (!best) return null;
  const player = byId.get(best.playerId);
  const team = teamsList.find((item) => (Array.isArray(item?.players) ? item.players : []).some((p) => p.id === best.playerId));
  return {
    name: String(player?.name || 'PLAYER').toUpperCase(),
    statsLine: `${best.pts} PTS - ${best.reb} REB - ${best.ast} AST`,
    teamColor: String(team?.color || '#f97316'),
    number: String(player?.number || ''),
    teamName: String(team?.name || ''),
    pictureUrl: String(player?.pictureUrl || ''),
    perScore: Number(best.perScore || 0)
  };
}

async function readImageBufferFromSource(source, baseOrigin = '') {
  const value = String(source || '').trim();
  if (!value) return null;
  if (!sharp) return null;

  const parsed = parseImageDataUrl(value);
  if (parsed?.buffer?.length) return parsed.buffer;

  try {
    const url = baseOrigin ? new URL(value, baseOrigin) : new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'wknd-stats/social-cover'
      }
    });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) return null;

    const meta = await sharp(buffer).metadata();
    if (!meta?.width || !meta?.height) return null;
    return buffer;
  } catch {
    return null;
  }
}

function getInitials(name) {
  return String(name || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

async function buildCustomSocialCoverPng(game, teams, customImageBuffer, baseOrigin = '') {
  requireSharp();
  const W = 1200;
  const H = 630;
  const base = await sharp(customImageBuffer)
    .rotate()
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const teamA = (Array.isArray(teams) ? teams : []).find((team) => team.id === game?.teamAId) || null;
  const teamB = (Array.isArray(teams) ? teams : []).find((team) => team.id === game?.teamBId) || null;
  const colorA = String(teamA?.color || '#10b981');
  const colorB = String(teamB?.color || '#ef4444');

  const scoreTextRight = W - 34;
  const scoreTextTop = H - 102;
  const scoreLineGap = 30;
  const scoreBarW = 260;
  const scoreBarH = 8;
  const scoreBarX = scoreTextRight - scoreBarW;
  const scoreBarY = scoreTextTop + 46;
  const potg = derivePlayerOfTheGameFromState(game, teams);

  const potgBlockTop = H - 130;
  const potgBlockHeight = 72;
  const potgLabelY = potgBlockTop + 14;
  const potgNameY = potgBlockTop + 44;
  const potgStatsY = potgBlockTop + 66;
  const avatarX = 64;
  const avatarY = potgBlockTop + (potgBlockHeight / 2);
  const avatarR = potgBlockHeight / 2;
  const avatarSize = avatarR * 2;
  const avatarLeft = avatarX - avatarR;
  const avatarTop = avatarY - avatarR;
  const contentLeft = avatarX + avatarR + 16;
  let logoOverlay = null;
  const logoPath = resolveSocialCoverLogoPath();

  if (logoPath) {
    try {
      logoOverlay = await sharp(logoPath)
        .resize({ width: 220, height: 44, fit: 'contain', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (_) {
      logoOverlay = null;
    }
  }

  const avatarBaseSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${potg ? `
  <circle cx="${avatarX}" cy="${avatarY}" r="${avatarR + 3}" fill="${escapeHtml(String(potg.teamColor || '#f97316'))}66"/>
  <circle cx="${avatarX}" cy="${avatarY}" r="${avatarR}" fill="#0b1220"/>
  ` : ''}
</svg>
  `);

  const compositeLayers = [{ input: avatarBaseSvg, top: 0, left: 0 }];
  if (potg?.pictureUrl) {
    const avatarSource = await readImageBufferFromSource(potg.pictureUrl, baseOrigin);
    if (avatarSource) {
      const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${avatarSize}" height="${avatarSize}"><circle cx="${avatarR}" cy="${avatarR}" r="${avatarR}" fill="#fff"/></svg>`);
      const clippedAvatar = await sharp(avatarSource)
        .rotate()
        .resize(avatarSize, avatarSize, { fit: 'cover', position: 'centre' })
        .composite([{ input: mask, blend: 'dest-in' }])
        .png({ compressionLevel: 9 })
        .toBuffer();
      compositeLayers.push({ input: clippedAvatar, top: avatarTop, left: avatarLeft });
    }
  }

  const overlaySvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#020617" flood-opacity="0.9"/>
    </filter>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(2,6,23,0.0)"/>
      <stop offset="100%" stop-color="rgba(2,6,23,0.94)"/>
    </linearGradient>
  </defs>

  <rect x="0" y="${Math.round(H * 0.75)}" width="${W}" height="${Math.round(H * 0.25)}" fill="url(#bottomFade)"/>

  <text x="${scoreTextRight}" y="${scoreTextTop}" text-anchor="end" fill="${escapeHtml(colorA)}" font-size="30" font-family="${SVG_FONT_STACK}" font-weight="700" filter="url(#shadow)">${escapeHtml(String(game?.teamAName || '').toUpperCase())} ${Number(game?.teamAScore || 0)}</text>
  <text x="${scoreTextRight}" y="${scoreTextTop + scoreLineGap}" text-anchor="end" fill="${escapeHtml(colorB)}" font-size="30" font-family="${SVG_FONT_STACK}" font-weight="700" filter="url(#shadow)">${escapeHtml(String(game?.teamBName || '').toUpperCase())} ${Number(game?.teamBScore || 0)}</text>

  <rect x="${scoreBarX}" y="${scoreBarY}" width="${scoreBarW / 2}" height="${scoreBarH}" fill="${escapeHtml(colorA)}"/>
  <rect x="${scoreBarX + (scoreBarW / 2)}" y="${scoreBarY}" width="${scoreBarW / 2}" height="${scoreBarH}" fill="${escapeHtml(colorB)}"/>

  ${potg ? `
  <circle cx="${avatarX}" cy="${avatarY}" r="${avatarR}" fill="none" stroke="${escapeHtml(String(potg.teamColor || '#f97316'))}" stroke-width="2"/>
  ${compositeLayers.length === 1 ? `<text x="${avatarX}" y="${avatarY + 12}" text-anchor="middle" fill="#f8fafc" font-size="30" font-family="${SVG_FONT_STACK}" font-weight="800" filter="url(#shadow)">${escapeHtml(getInitials(potg.name))}</text>` : ''}
  <text x="${contentLeft}" y="${potgLabelY}" fill="#f97316" font-size="14" font-family="${SVG_FONT_STACK}" font-weight="700" filter="url(#shadow)">PLAYER OF THE GAME</text>
  <text x="${contentLeft}" y="${potgNameY}" fill="#ffffff" font-size="30" font-family="${SVG_FONT_STACK}" font-weight="800" filter="url(#shadow)">${escapeHtml(potg.name)}</text>
  <text x="${contentLeft}" y="${potgStatsY}" fill="#e2e8f0" font-size="18" font-family="${SVG_FONT_STACK}" font-weight="700" filter="url(#shadow)">${escapeHtml(potg.statsLine)}</text>
  ` : ''}
</svg>
  `);

  const layers = [...compositeLayers, { input: overlaySvg, top: 0, left: 0 }];
  if (logoOverlay) {
    layers.push({ input: logoOverlay, left: 40, top: 28 });
  }

  return sharp(base)
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function getStylizePreset(directionText) {
  const text = String(directionText || '').toLowerCase();
  const preset = {
    saturation: 1.16,
    brightness: 1.07,
    hue: 0,
    colors: 96,
    edgeOpacity: 0.09
  };

  if (/anime|toon|cartoon|cel\s*shade/.test(text)) {
    preset.saturation = 1.24;
    preset.brightness = 1.1;
    preset.colors = 84;
    preset.edgeOpacity = 0.12;
  }
  if (/comic|ink|lineart/.test(text)) {
    preset.colors = 76;
    preset.edgeOpacity = 0.14;
  }
  if (/retro|vintage/.test(text)) {
    preset.saturation = 1.06;
    preset.brightness = 1.0;
    preset.colors = 96;
  }

  return preset;
}

function buildPlayerTemplateSvg(width, height) {
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="55%" stop-color="#172336"/>
      <stop offset="100%" stop-color="#202b3d"/>
    </linearGradient>
    <linearGradient id="rightFade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.48"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bg)"/>

  <g opacity="0.08" stroke="#dbe7ff" stroke-width="2">
    <line x1="-160" y1="${height}" x2="320" y2="0"/>
    <line x1="-80" y1="${height}" x2="400" y2="0"/>
    <line x1="0" y1="${height}" x2="480" y2="0"/>
    <line x1="80" y1="${height}" x2="560" y2="0"/>
    <line x1="160" y1="${height}" x2="640" y2="0"/>
  </g>

  <rect x="${Math.round(width * 0.6)}" y="0" width="${Math.round(width * 0.4)}" height="${height}" fill="url(#rightFade)"/>
</svg>
  `);
}

function buildCircleMaskSvg(size) {
  const half = size / 2;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${half}" cy="${half}" r="${Math.floor(half - 2)}" fill="white"/>
</svg>
  `);
}

async function generatePlayerArtDirection(playerName, teamName, stylePrompt, gameContext, playerStatsSummary) {
  const fallback = String(stylePrompt || '2D basketball poster, front-facing portrait, cel-shaded, bold outlines, clean background').trim();
  if (!GEMINI_API_KEY && !OPENAI_API_KEY) return fallback;

  const ctx = (gameContext && typeof gameContext === 'object') ? gameContext : {};
  const scoreLine = String(ctx.scoreLine || '').trim();
  const bestPlayerStats = String(playerStatsSummary || ctx.bestPlayerStats || '').trim();

  const prompt = [
    'Create one short art-direction sentence for stylizing a basketball player photo into 2D artwork.',
    'Keep it under 22 words and include only style language (no story, no extra text).',
    `Player: ${playerName || 'Unknown'}`,
    `Team: ${teamName || 'Unknown Team'}`,
    `Game score context: ${scoreLine || 'N/A'}`,
    `Best player stat line: ${bestPlayerStats || 'N/A'}`,
    `Requested style: ${fallback}`
  ].join('\n');

  const providerOrder = getAiProviderOrder();
  for (const provider of providerOrder) {
    if (provider === 'openai') {
      const openAiResult = await generateTextWithOpenAiFallback(prompt, {
        temperature: 0.8,
        maxTokens: 80
      });
      if (openAiResult.text) {
        return openAiResult.text;
      }
      continue;
    }

    const geminiResult = await generateTextWithGeminiFallback(prompt, {
      temperature: 0.8,
      maxTokens: 80
    });
    if (geminiResult.text) {
      return geminiResult.text;
    }
  }

  return fallback;
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
      ft_miss: toInt(row.ft_miss),
      min: String(row.minutes || '').trim()
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
    gameLog: parseJsonSafe(game.game_log_json, []),
    periodSnapshots: parseJsonSafe(game.period_snapshots_json, []),
    dnpPlayers: parseJsonSafe(game.dnp_players_json, []),
    youtubeUrl: game.youtube_url || '',
    gameWriteup: game.game_writeup || '',
    potgWriteup: game.potg_writeup || '',
    socialCoverDataUrl: game.social_cover_data_url || ''
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
      period_snapshots_json: JSON.stringify(Array.isArray(game.periodSnapshots) ? game.periodSnapshots : []),
      dnp_players_json: JSON.stringify(Array.isArray(game.dnpPlayers) ? game.dnpPlayers : []),
      youtube_url: typeof game.youtubeUrl === 'string' ? game.youtubeUrl : '',
      game_writeup: typeof game.gameWriteup === 'string' ? game.gameWriteup : '',
      potg_writeup: typeof game.potgWriteup === 'string' ? game.potgWriteup : '',
      social_cover_data_url: typeof game.socialCoverDataUrl === 'string' ? game.socialCoverDataUrl : '',
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
        ft_miss: toInt(stats.ft_miss),
        minutes: typeof stats.min === 'string' ? stats.min : ''
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

function getNewestEventTimestamp(events = []) {
  if (!Array.isArray(events) || events.length === 0) return 0;
  return events.reduce((maxTs, event) => {
    const ts = getEventTimestampFromId(event?.id);
    return ts > maxTs ? ts : maxTs;
  }, 0);
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
  const hasIncomingLiveStats = Object.prototype.hasOwnProperty.call(incoming, 'liveStats');
  // Prefer incoming rotation on equal revisions to avoid reverting lineup arrays
  // when multiple lineup events are generated within the same millisecond.
  const preferIncomingRotation = incomingLineupRevision >= existingLineupRevision;

  const pickPreferredString = (existingValue, incomingValue) => {
    if (typeof incomingValue === 'string' && incomingValue.trim()) return incomingValue;
    if (typeof existingValue === 'string' && existingValue.trim()) return existingValue;
    return typeof incomingValue === 'string' ? incomingValue : (typeof existingValue === 'string' ? existingValue : '');
  };

  const pickPreferredArray = (existingValue, incomingValue) => {
    if (Array.isArray(incomingValue) && incomingValue.length > 0) return incomingValue;
    if (Array.isArray(existingValue) && existingValue.length > 0) return existingValue;
    if (Array.isArray(incomingValue)) return incomingValue;
    if (Array.isArray(existingValue)) return existingValue;
    return [];
  };

  const hasObjectValues = (value) => {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
  };

  const existingSnapshot = existing.liveGameSnapshot && typeof existing.liveGameSnapshot === 'object'
    ? existing.liveGameSnapshot
    : null;
  const incomingSnapshot = incoming.liveGameSnapshot && typeof incoming.liveGameSnapshot === 'object'
    ? incoming.liveGameSnapshot
    : null;

  const mergedLiveGameSnapshot = incomingSnapshot || existingSnapshot
    ? {
        ...(existingSnapshot || {}),
        ...(incomingSnapshot || {}),
        teamAId: pickPreferredString(existingSnapshot?.teamAId, incomingSnapshot?.teamAId),
        teamBId: pickPreferredString(existingSnapshot?.teamBId, incomingSnapshot?.teamBId),
        teamALineup: pickPreferredArray(existingSnapshot?.teamALineup, incomingSnapshot?.teamALineup),
        teamABench: pickPreferredArray(existingSnapshot?.teamABench, incomingSnapshot?.teamABench),
        teamBLineup: pickPreferredArray(existingSnapshot?.teamBLineup, incomingSnapshot?.teamBLineup),
        teamBBench: pickPreferredArray(existingSnapshot?.teamBBench, incomingSnapshot?.teamBBench),
        liveStats: hasObjectValues(incomingSnapshot?.liveStats)
          ? incomingSnapshot.liveStats
          : (hasObjectValues(existingSnapshot?.liveStats) ? existingSnapshot.liveStats : {}),
        playedPlayers: pickPreferredArray(existingSnapshot?.playedPlayers, incomingSnapshot?.playedPlayers)
      }
    : null;

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
    teamAId: pickPreferredString(existing.teamAId, incoming.teamAId),
    teamBId: pickPreferredString(existing.teamBId, incoming.teamBId),
    lineupRevision: Math.max(existingLineupRevision, incomingLineupRevision),
    teamALineup: pickRotationArray('teamALineup'),
    teamABench: pickRotationArray('teamABench'),
    teamBLineup: pickRotationArray('teamBLineup'),
    teamBBench: pickRotationArray('teamBBench'),
    liveStats: hasIncomingLiveStats
      ? (hasObjectValues(incoming.liveStats) ? incoming.liveStats : (hasObjectValues(existing.liveStats) ? existing.liveStats : {}))
      : (hasObjectValues(existing.liveStats) ? existing.liveStats : (incoming.liveStats || {})),
    liveGameSnapshot: mergedLiveGameSnapshot,
    // Always union existing + incoming event lists so a reconnecting client with a
    // stale gameLog never wipes events that were written by other devices while it
    // was offline. The individual event IDs are stable/unique so deduplication is safe.
    gameLog: mergeEventLists(existing.gameLog || [], Array.isArray(incoming.gameLog) ? incoming.gameLog : [], 'glog', 5000),
    loggedHistory: mergeEventLists(existing.loggedHistory || [], Array.isArray(incoming.loggedHistory) ? incoming.loggedHistory : [], 'hist', 5000),
    // Always union playedPlayers from both sides so a reconnecting client never
    // drops players that were added by another operator while it was offline.
    playedPlayers: Array.from(new Set([...(existing.playedPlayers || []), ...(Array.isArray(incoming.playedPlayers) ? incoming.playedPlayers : [])]))
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
  const existingSession = readActiveSession();
  const incomingSessionUpdatedAt = toInt(session?.sessionUpdatedAt);
  const incomingSessionRevision = toInt(session?.sessionRevision);
  const existingSessionRevision = toInt(existingSession?.sessionRevision);
  const incomingSessionInstanceId = String(session?.liveSessionInstanceId || session?.sessionInstanceId || '').trim();
  const incomingSessionCreatedAt = toInt(session?.sessionCreatedAt);

  if (existingSession && incomingSessionRevision > 0 && incomingSessionRevision < existingSessionRevision) {
    return false;
  }

  if (
    incomingSessionInstanceId &&
    lastDiscardedSessionInstanceId &&
    incomingSessionInstanceId === lastDiscardedSessionInstanceId &&
    (incomingSessionCreatedAt <= 0 || incomingSessionCreatedAt <= toInt(lastDiscardedSessionClearedAt))
  ) {
    return false;
  }

  if (incomingSessionUpdatedAt <= toInt(lastActiveSessionClearedAt)) {
    return false;
  }

  // If the session was recently cleared, prevent older log streams from
  // recreating a discarded game through delayed/in-flight PUT requests.
  if (!existingSession && toInt(lastActiveSessionClearedAt) > 0) {
    const newestIncomingEventTs = getNewestEventTimestamp(Array.isArray(session?.gameLog) ? session.gameLog : []);
    if (newestIncomingEventTs > 0 && newestIncomingEventTs <= toInt(lastActiveSessionClearedAt)) {
      return false;
    }
  }

  lastActiveSessionSourceId = sourceClientId;
  const mergedSession = mergeActiveSession(existingSession, session || {});
  const nextSessionRevision = Math.max(existingSessionRevision, incomingSessionRevision, existingSessionRevision + 1);
  mergedSession.sessionRevision = nextSessionRevision;
  if (toInt(mergedSession.sessionCreatedAt) <= 0) {
    mergedSession.sessionCreatedAt = incomingSessionCreatedAt > 0 ? incomingSessionCreatedAt : Date.now();
  }
  upsertActiveSessionStmt.run({
    session_json: JSON.stringify(mergedSession)
  });
  broadcastSync({ sourceClientId });
  return true;
}

function clearActiveSession(sourceClientId = null, options = {}) {
  lastActiveSessionSourceId = sourceClientId;
  const discardedSessionInstanceId = String(options?.discardedSessionInstanceId || '').trim();
  if (discardedSessionInstanceId) {
    lastDiscardedSessionInstanceId = discardedSessionInstanceId;
    lastDiscardedSessionClearedAt = Date.now();
  }
  lastActiveSessionClearedAt = Date.now();
  deleteActiveSessionStmt.run();
  // NOTE: live_events are intentionally NOT deleted here. They serve as a
  // durable secondary log that clients can replay after a server restart or
  // reconnect. Live events are only cleared when a new game is explicitly
  // started via POST /api/live-events/reset.
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

function getCanonicalRequestHost(req) {
  const rawForwardedHost = String(req.headers['x-forwarded-host'] || '').trim().toLowerCase();
  const rawHost = String(req.get('host') || '').trim().toLowerCase();
  return (rawForwardedHost || rawHost).split(',')[0].trim();
}

function getCanonicalRequestHostname(req) {
  const canonicalHost = getCanonicalRequestHost(req);
  return canonicalHost
    .split(':')[0]
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

function isGaEnabledForRequest(req) {
  const isAllowedGaDomain = getCanonicalRequestHostname(req) === 'wkndbasketball.com';
  return Boolean(
    GA_MEASUREMENT_ID
    && isAllowedGaDomain
    && (process.env.NODE_ENV === 'production' || GA_ENABLE_IN_DEV)
  );
}

function buildGaHeadSnippet(req) {
  if (!isGaEnabledForRequest(req)) return '';
  const safeId = GA_MEASUREMENT_ID.replace(/'/g, "\\'");
  return [
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}"></script>`,
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    '  gtag(\'js\', new Date());',
    `  gtag('config', '${safeId}', { send_page_view: false });`,
    '</script>'
  ].join('\n    ');
}

app.use(express.json({ limit: '12mb' }));

app.use((req, res, next) => {
  const canonicalHost = getCanonicalRequestHost(req);
  const hostParts = canonicalHost.split(':');
  const hostname = String(hostParts[0] || '').replace(/\.$/, '');

  if (hostname !== 'www.wkndbasketball.com') {
    next();
    return;
  }

  const port = hostParts[1] || '';
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const protocol = forwardedProto || String(req.protocol || 'https').toLowerCase();
  const includePort = port && port !== '80' && port !== '443';
  const targetHost = includePort ? `wkndbasketball.com:${port}` : 'wkndbasketball.com';

  res.redirect(308, `${protocol}://${targetHost}${req.originalUrl || '/'}`);
});

function renderInjectedIndex(req, res) {
  const gaEnabledForRequest = isGaEnabledForRequest(req);
  const requestHostname = getCanonicalRequestHostname(req);

  try {
    const pathParts = String(req.path || '/').split('/').filter(Boolean);
    const pathGameId = pathParts[0] === 'history' && pathParts[1] === 'game' && pathParts[2]
      ? decodeURIComponent(String(pathParts[2] || '').trim())
      : '';
    const queryGameId = String(req.query.gameId || '').trim();
    const gameId = pathGameId || queryGameId;
    const isGameView = Boolean(gameId) && (
      (String(req.query.view || '').toLowerCase() === 'game')
      || (pathParts[0] === 'history' && pathParts[1] === 'game')
    );
    const state = readState();
    const game = isGameView ? ((state.games || []).find((item) => item.id === gameId) || null) : null;
    const indexPath = path.join(__dirname, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    let metaTags = '';
    let gaHeadSnippet = '';

    try {
      metaTags = buildSocialMetaTags({ req, game });
    } catch {
      metaTags = '';
    }

    try {
      gaHeadSnippet = buildGaHeadSnippet(req);
    } catch {
      gaHeadSnippet = '';
    }

    const headFragments = [metaTags, gaHeadSnippet].filter(Boolean).join('\n    ');
    const injected = html.replace('</head>', `    ${headFragments}\n</head>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-GA-Enabled', gaEnabledForRequest ? '1' : '0');
    res.setHeader('X-GA-Hostname', requestHostname || 'unknown');
    res.setHeader('X-GA-Injected', gaHeadSnippet ? '1' : '0');
    res.send(injected);
  } catch {
    res.status(500).type('text/plain').send('Failed to render index.');
  }
}

app.get('/', (req, res) => {
  renderInjectedIndex(req, res);
});

app.get('/index.html', (req, res) => {
  renderInjectedIndex(req, res);
});

app.get([
  '/live',
  '/teams',
  '/standings',
  '/leaders',
  '/history',
  '/history/game/:gameId',
  '/teams/player/:teamId/:playerId'
], (req, res) => {
  renderInjectedIndex(req, res);
});

app.use(express.static(__dirname, { index: false }));

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

app.get('/api/client-config', (req, res) => {
  const gaEnabled = isGaEnabledForRequest(req);

  res.json({
    gaEnabled,
    gaMeasurementId: gaEnabled ? GA_MEASUREMENT_ID : ''
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

app.get('/api/social-cover/default.png', async (_req, res) => {
  try {
    if (!sharp) {
      res.status(501).json({ error: 'Social cover generation is disabled in this build because sharp is not installed.' });
      return;
    }
    const png = await buildSocialCoverPng(null, []);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    const resolvedLogoPath = resolveSocialCoverLogoPath();
    res.setHeader('X-Social-Cover-Logo', resolvedLogoPath ? path.basename(resolvedLogoPath) : 'none');
    res.send(png);
  } catch {
    res.status(500).json({ error: 'Failed to build social cover.' });
  }
});

app.get('/api/social-cover/:gameId.png', async (req, res) => {
  try {
    if (!sharp) {
      res.status(501).json({ error: 'Social cover generation is disabled in this build because sharp is not installed.' });
      return;
    }
    const gameId = String(req.params.gameId || '').trim();
    const baseOrigin = `${req.protocol}://${req.get('host')}`;
    const state = readState();
    const game = (state.games || []).find((item) => item.id === gameId) || null;
    let png = null;
    const customDataUrl = String(game?.socialCoverDataUrl || '').trim();
    const parsedCustom = parseImageDataUrl(customDataUrl);
    if (parsedCustom) {
      png = await buildCustomSocialCoverPng(game, state.teams || [], parsedCustom.buffer, baseOrigin);
    } else {
      png = await buildSocialCoverPng(game, state.teams || [], baseOrigin);
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    const resolvedLogoPath = resolveSocialCoverLogoPath();
    res.setHeader('X-Social-Cover-Logo', resolvedLogoPath ? path.basename(resolvedLogoPath) : 'none');
    res.send(png);
  } catch {
    res.status(500).json({ error: 'Failed to build social cover.' });
  }
});

app.post('/api/generate-writeup', async (req, res) => {
  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    res.status(400).json({ error: 'Neither Gemini nor OpenAI API key is configured on the server.' });
    return;
  }

  const { game, playerOfTheGame, bestPerformers, standoutPerformersByTeam, playByPlay, finalMoments, leadSwingSummary, lineupPatternSummary } = req.body || {};
  if (!game || typeof game !== 'object') {
    res.status(400).json({ error: 'Body must include game object.' });
    return;
  }

  const pbpLines = Array.isArray(playByPlay)
    ? playByPlay.slice(-220).map((entry) => {
        const time = String(entry?.time || '').trim() || '--';
        const team = String(entry?.team || 'Neutral').trim() || 'Neutral';
        const text = String(entry?.text || '').trim();
        return text ? `[${time}] (${team}) ${text}` : null;
      }).filter(Boolean)
    : [];

  const finalMomentLines = Array.isArray(finalMoments)
    ? finalMoments.slice(-60).map((entry) => {
        const time = String(entry?.time || '').trim() || '--';
        const team = String(entry?.team || 'Neutral').trim() || 'Neutral';
        const text = String(entry?.text || '').trim();
        return text ? `[${time}] (${team}) ${text}` : null;
      }).filter(Boolean)
    : pbpLines.slice(-30);

  const formatPerformerLine = (p) => {
    const name = `#${p?.number ?? '-'} ${p?.name || 'Unknown'}`;
    const team = p?.teamName || 'Unknown Team';
    const stats = p?.stats || {};
    return `${name} (${team}) - PTS ${Number(stats.pts || 0)}, REB ${Number(stats.reb || 0)}, AST ${Number(stats.ast || 0)}, STL ${Number(stats.stl || 0)}, BLK ${Number(stats.blk || 0)}, TO ${Number(stats.to || 0)}`;
  };

  const performerLines = Array.isArray(bestPerformers)
    ? bestPerformers.slice(0, 8).map(formatPerformerLine)
    : [];

  const teamAStandoutLines = Array.isArray(standoutPerformersByTeam?.teamA)
    ? standoutPerformersByTeam.teamA.slice(0, 2).map(formatPerformerLine)
    : [];

  const teamBStandoutLines = Array.isArray(standoutPerformersByTeam?.teamB)
    ? standoutPerformersByTeam.teamB.slice(0, 2).map(formatPerformerLine)
    : [];

  const potgLine = playerOfTheGame
    ? `#${playerOfTheGame.number || '-'} ${playerOfTheGame.name || 'Unknown'} (${playerOfTheGame.teamName || 'Unknown Team'}) - PTS ${Number(playerOfTheGame?.stats?.pts || 0)}, REB ${Number(playerOfTheGame?.stats?.reb || 0)}, AST ${Number(playerOfTheGame?.stats?.ast || 0)}, STL ${Number(playerOfTheGame?.stats?.stl || 0)}, BLK ${Number(playerOfTheGame?.stats?.blk || 0)}`
    : 'No clear player of the game identified from the provided stats.';

  const leadSwingLine = leadSwingSummary && typeof leadSwingSummary === 'object'
    ? `Largest lead: ${leadSwingSummary.largestLeadTeam || 'Unknown'} by ${Number(leadSwingSummary.largestLeadPoints || 0)} at ${leadSwingSummary.largestLeadAtTime || '--'}. Huge lead: ${Boolean(leadSwingSummary.isHugeLead)}. Erased: ${Boolean(leadSwingSummary.leadWasErased)}. Nearly erased: ${Boolean(leadSwingSummary.leadWasNearlyErased)}.`
    : 'Largest lead context not provided.';

  const comebackContextLine = leadSwingSummary && typeof leadSwingSummary === 'object'
    ? (() => {
        const leadPoints = Number(leadSwingSummary.largestLeadPoints || 0);
        const teamName = leadSwingSummary.largestLeadTeam || 'Unknown';
        const atTime = leadSwingSummary.largestLeadAtTime || '--';
        const isHugeLead = Boolean(leadSwingSummary.isHugeLead);
        const wasErased = Boolean(leadSwingSummary.leadWasErased);
        const wasNearlyErased = Boolean(leadSwingSummary.leadWasNearlyErased);

        if (isHugeLead && wasErased) {
          return `Comeback alert: ${teamName} led by ${leadPoints} at ${atTime}, and that big lead was fully erased.`;
        }
        if (isHugeLead && wasNearlyErased) {
          return `Comeback pressure: ${teamName} led by ${leadPoints} at ${atTime}, and that big lead was nearly erased late.`;
        }
        if (leadPoints >= 8 && wasErased) {
          return `Swing alert: ${teamName} led by ${leadPoints} at ${atTime}, and the lead was erased.`;
        }
        return 'No major comeback collapse detected from lead data.';
      })()
    : 'Comeback context unavailable.';

  const finalMargin = Math.abs(Number(game?.teamAScore || 0) - Number(game?.teamBScore || 0));
  const isCloseFight = finalMargin <= 6;
  const closeFightLine = isCloseFight
    ? `Close fight detected (final margin: ${finalMargin}). Strongly emphasize the final minutes, clutch sequences, and late-game swings.`
    : `Not a close finish (final margin: ${finalMargin}). Still include final moments but balance with full-game arc.`;

  const crucialFinalMomentLines = (Array.isArray(finalMomentLines) ? finalMomentLines : [])
    .filter((line) => {
      const text = String(line || '').toLowerCase();
      return /(lead change|tie|tied|go-ahead|takes the lead|game-tying|game tying|game-winning|game winning|clutch|3pt|three|block|steal|turnover|and-1|foul|free throw|miss|rebound|buzzer)/i.test(text);
    })
    .slice(-10);

  const closeGameFinalLogFocusLine = isCloseFight
    ? `Close-game final-log focus: ${crucialFinalMomentLines.length} crucial late events flagged from final logs.`
    : 'Close-game final-log focus: not required (game not classified as close).';

  const lineupPatternLine = lineupPatternSummary && typeof lineupPatternSummary === 'object'
    ? [lineupPatternSummary.teamA, lineupPatternSummary.teamB]
        .filter(Boolean)
        .map((item) => `${item.teamName || 'Team'}: ${item.rotationPattern || 'rotation pattern unavailable'}, substitutions ${Number(item.subCount || 0)}, players used ${Number(item.playersUsed || 0)}, late subs ${Number(item.lateSubCount || 0)}.`)
        .join(' ')
    : 'Lineup pattern context not provided.';

  const recentRecapRows = db.prepare(`
    SELECT id, date, team_a_name, team_b_name, game_writeup
    FROM games
    WHERE COALESCE(TRIM(game_writeup), '') <> ''
      AND id <> ?
    ORDER BY COALESCE(sort_order, 0) DESC, date DESC
    LIMIT 6
  `).all(String(game.id || ''));

  const priorRecapSnippets = (recentRecapRows || [])
    .map((row) => {
      const text = String(row?.game_writeup || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      return `${row?.team_a_name || 'Team A'} vs ${row?.team_b_name || 'Team B'} (${row?.date || ''}): ${text.slice(0, 260)}`;
    })
    .filter(Boolean);

  const prompt = [
    'You are an expert, high-energy sports journalist writing an exciting game recap based on raw play-by-play logs.',
    'Your goal is to make the reader feel the tension, momentum, and drama of the game.',
    'Use ONLY the provided data. Do not invent quotes, injuries, runs, possessions, or events.',
    'Write plain text only.',
    'Follow these strict writing guidelines:',
    '1) Hook the reader: Start with a dynamic headline and a compelling lead paragraph. Focus on the final outcome, the hero of the game, or a major turning point. Never start with "This game was played on..."',
    '2) Focus on momentum and narrative: Do not just list plays chronologically. Group action by major runs, shifts in momentum, or quarter arcs.',
    '3) Emphasize climax and high stakes: Dedicate the most vivid descriptions to crunch time (final 5 minutes, lead changes, clutch stops, game-sealing plays).',
    '4) Use vibrant sports vocabulary: Avoid repetitive verbs. Use active, evocative language.',
    '5) Highlight key performers: Weave player statistics naturally into the story instead of listing raw numbers.',
    '6) Match the game tone: If blowout, emphasize dominance and depth; if defensive battle, highlight stops and physicality; if shootout, highlight offensive fireworks.',
    '7) If a team built a huge lead (10+ points) that was erased or nearly erased, explicitly mention that momentum collapse and comeback swing.',
    '8) If it is a close fight (single-possession to two-possession finish), heavily spotlight the final few minutes, including the climax and decisive late sequence.',
    '9) For close games, prioritize crucial events from final logs (lead changes, ties, clutch shots, steals, blocks, turnovers, key free throws, game-sealing plays).',
    '10) If comeback context indicates a blown big lead, explicitly narrate the comeback pressure and how momentum shifted.',
    '11) Include each team\'s lineup/rotation pattern naturally (tight rotation, balanced rotation, or heavy rotation), especially if late substitutions affected momentum.',
    '12) Mention at least 1-2 outstanding performers from each team when available in the standout lists, and weave them naturally into the narrative.',
    '13) Make this recap stylistically distinct from previous saved recaps. Do not reuse the same opening line pattern, closing sentence pattern, or repeated catchphrases.',
    '14) Use prior recap snippets only as anti-repetition guidance, not as factual source data for this game.',
    'Keep it vivid but factual and easy to read.',
    'Output format: headline + 3 short paragraphs.',
    '',
    `Game: ${game.teamAName || 'Team A'} ${Number(game.teamAScore || 0)} - ${Number(game.teamBScore || 0)} ${game.teamBName || 'Team B'} (${game.date || ''})`,
    `Close-game context: ${closeFightLine}`,
    `Close-game final-log context: ${closeGameFinalLogFocusLine}`,
    `Lead swing context: ${leadSwingLine}`,
    `Comeback context: ${comebackContextLine}`,
    `Lineup pattern context: ${lineupPatternLine}`,
    `Player of the Game: ${potgLine}`,
    `Outstanding performers - ${game.teamAName || 'Team A'} (target mention 1-2):`,
    ...(teamAStandoutLines.length ? teamAStandoutLines : ['No standout performers provided for Team A.']),
    `Outstanding performers - ${game.teamBName || 'Team B'} (target mention 1-2):`,
    ...(teamBStandoutLines.length ? teamBStandoutLines : ['No standout performers provided for Team B.']),
    'Recent saved recap snippets (style-diversity guardrail):',
    ...(priorRecapSnippets.length ? priorRecapSnippets : ['No previous saved recaps found.']),
    'Best performers:',
    ...(performerLines.length ? performerLines : ['No performer list provided.']),
    'Final moments (most recent events):',
    ...(finalMomentLines.length ? finalMomentLines : ['No final-moments events provided.']),
    'Crucial final-log events (priority for close games):',
    ...(crucialFinalMomentLines.length ? crucialFinalMomentLines : ['No crucial final-log events flagged.']),
    'Play-by-play events:',
    ...(pbpLines.length ? pbpLines : ['No play-by-play events provided.'])
  ].join('\n');

  try {
    const providerOrder = getAiProviderOrder();
    let writeup = '';
    let geminiResult = {
      text: '',
      attemptedModels: [],
      lastErrorStatus: 0,
      lastErrorText: 'Gemini was not attempted.'
    };
    let openAiResult = {
      text: '',
      attemptedModels: [],
      lastErrorStatus: 0,
      lastErrorText: 'OpenAI was not attempted.'
    };

    for (const provider of providerOrder) {
      if (provider === 'openai') {
        openAiResult = await generateTextWithOpenAiFallback(prompt, {
          temperature: 0.7,
          maxTokens: 450
        });
        if (openAiResult.text) {
          writeup = openAiResult.text;
          break;
        }
        continue;
      }

      geminiResult = await generateTextWithGeminiFallback(prompt, {
        temperature: 0.7,
        maxTokens: 450
      });
      if (geminiResult.text) {
        writeup = geminiResult.text;
        break;
      }
    }

    if (!writeup) {
      const geminiPart = geminiResult.attemptedModels.length
        ? `Gemini tried: ${geminiResult.attemptedModels.join(', ')}. Last error (${geminiResult.lastErrorStatus}): ${String(geminiResult.lastErrorText || '').slice(0, 180)}`
        : `Gemini unavailable: ${String(geminiResult.lastErrorText || '').slice(0, 180)}`;
      const openAiPart = openAiResult.attemptedModels.length
        ? `OpenAI tried: ${openAiResult.attemptedModels.join(', ')}. Last error (${openAiResult.lastErrorStatus}): ${String(openAiResult.lastErrorText || '').slice(0, 180)}`
        : `OpenAI unavailable: ${String(openAiResult.lastErrorText || '').slice(0, 180)}`;
      res.status(502).json({ error: `${geminiPart} ${openAiPart}` });
      return;
    }

    if (!writeup) {
      res.status(502).json({ error: 'AI provider returned an empty response.' });
      return;
    }

    res.json({ writeup });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate writeup with AI provider.' });
  }
});

app.post('/api/generate-potg-writeup', async (req, res) => {
  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    res.status(400).json({ error: 'Neither Gemini nor OpenAI API key is configured on the server.' });
    return;
  }

  const { game, playerOfTheGame } = req.body || {};
  if (!game || typeof game !== 'object') {
    res.status(400).json({ error: 'Body must include game object.' });
    return;
  }
  if (!playerOfTheGame || typeof playerOfTheGame !== 'object' || !playerOfTheGame.id) {
    res.status(400).json({ error: 'Body must include playerOfTheGame with id.' });
    return;
  }

  const state = readState();
  const playerId = String(playerOfTheGame.id);
  const allGames = Array.isArray(state?.games) ? state.games : [];

  const previousGames = allGames
    .filter((row) => row && String(row.id || '') !== String(game.id || ''))
    .filter((row) => {
      const hasRow = Boolean(row?.playerStats?.[playerId]);
      const isDnp = Array.isArray(row?.dnpPlayers) && row.dnpPlayers.includes(playerId);
      return hasRow && !isDnp;
    })
    .sort((a, b) => String(b.id || '').localeCompare(String(a.id || '')))
    .slice(0, 6);

  const formatStatsLine = (stats = {}) => {
    const fgMade = Number(stats.fg2m || 0) + Number(stats.fg3m || 0);
    const fgAtt = fgMade + Number(stats.fg2m_miss || 0) + Number(stats.fg3m_miss || 0);
    const fgPct = fgAtt > 0 ? `${Math.round((fgMade / fgAtt) * 100)}% FG` : '0% FG';
    return `PTS ${Number(stats.pts || 0)}, REB ${Number(stats.reb || 0)}, AST ${Number(stats.ast || 0)}, STL ${Number(stats.stl || 0)}, BLK ${Number(stats.blk || 0)}, TO ${Number(stats.to || 0)}, ${fgPct}`;
  };

  const previousPerformanceLines = previousGames.map((row) => {
    const stats = row?.playerStats?.[playerId] || {};
    const opponent = String(row?.teamAId) === String(playerOfTheGame.teamId || '')
      ? (row?.teamBName || 'Opponent')
      : (row?.teamAName || 'Opponent');
    return `${row?.date || ''} vs ${opponent}: ${formatStatsLine(stats)}`;
  });

  const prompt = [
    'You are a concise basketball writer producing a short player spotlight.',
    'Use ONLY the provided data and do not invent any details.',
    'Write exactly 2 to 3 sentences, plain text only.',
    'Focus on the player\'s production and efficiency in this game.',
    'If prior performances are provided, briefly reference trend/consistency.',
    'Do NOT mention PER, formulas, or advanced metric names.',
    '',
    `Game: ${game.teamAName || 'Team A'} ${Number(game.teamAScore || 0)} - ${Number(game.teamBScore || 0)} ${game.teamBName || 'Team B'} (${game.date || ''})`,
    `Player: #${playerOfTheGame.number || '-'} ${playerOfTheGame.name || 'Unknown'} (${playerOfTheGame.teamName || 'Unknown Team'})`,
    `Current game stat line: ${formatStatsLine(playerOfTheGame.stats || {})}`,
    'Recent previous game performances:',
    ...(previousPerformanceLines.length ? previousPerformanceLines : ['No previous game performances found for this player.'])
  ].join('\n');

  try {
    const providerOrder = getAiProviderOrder();
    let rawWriteup = '';
    let geminiResult = {
      text: '',
      attemptedModels: [],
      lastErrorStatus: 0,
      lastErrorText: 'Gemini was not attempted.'
    };
    let openAiResult = {
      text: '',
      attemptedModels: [],
      lastErrorStatus: 0,
      lastErrorText: 'OpenAI was not attempted.'
    };

    for (const provider of providerOrder) {
      if (provider === 'openai') {
        openAiResult = await generateTextWithOpenAiFallback(prompt, {
          temperature: 0.55,
          maxTokens: 150
        });
        if (openAiResult.text) {
          rawWriteup = openAiResult.text;
          break;
        }
        continue;
      }

      geminiResult = await generateTextWithGeminiFallback(prompt, {
        temperature: 0.55,
        maxTokens: 150
      });
      if (geminiResult.text) {
        rawWriteup = geminiResult.text;
        break;
      }
    }

    rawWriteup = String(rawWriteup || '').replace(/\s+/g, ' ').trim();

    if (!rawWriteup) {
      const geminiPart = geminiResult.attemptedModels.length
        ? `Gemini tried: ${geminiResult.attemptedModels.join(', ')}. Last error (${geminiResult.lastErrorStatus}): ${String(geminiResult.lastErrorText || '').slice(0, 180)}`
        : `Gemini unavailable: ${String(geminiResult.lastErrorText || '').slice(0, 180)}`;
      const openAiPart = openAiResult.attemptedModels.length
        ? `OpenAI tried: ${openAiResult.attemptedModels.join(', ')}. Last error (${openAiResult.lastErrorStatus}): ${String(openAiResult.lastErrorText || '').slice(0, 180)}`
        : `OpenAI unavailable: ${String(openAiResult.lastErrorText || '').slice(0, 180)}`;
      res.status(502).json({ error: `${geminiPart} ${openAiPart}` });
      return;
    }

    const sentences = rawWriteup
      .split(/(?<=[.!?])\s+/)
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    const finalizedSentences = sentences.slice(0, 3);

    if (finalizedSentences.length < 2) {
      const stats = playerOfTheGame.stats || {};
      const playerName = playerOfTheGame.name || 'The player';
      const teamName = playerOfTheGame.teamName || 'the team';
      const pts = Number(stats.pts || 0);
      const reb = Number(stats.reb || 0);
      const ast = Number(stats.ast || 0);
      const stl = Number(stats.stl || 0);
      const blk = Number(stats.blk || 0);

      const fallbackCore = `${playerName} finished with ${pts} points, ${reb} rebounds, and ${ast} assists, while adding ${stl} steals and ${blk} blocks.`;
      const fallbackTrend = previousPerformanceLines.length > 0
        ? `${playerName} has stayed productive across recent games and continued that form here for ${teamName}.`
        : `${playerName} set the tone for ${teamName} in this matchup with a strong all-around performance.`;

      if (!finalizedSentences.length) {
        finalizedSentences.push(fallbackCore);
      }
      if (finalizedSentences.length < 2) {
        finalizedSentences.push(fallbackTrend);
      }
    }

    const compactWriteup = finalizedSentences.slice(0, 3).join(' ').trim();
    res.json({ writeup: compactWriteup });
  } catch {
    res.status(500).json({ error: 'Failed to generate POTG writeup.' });
  }
});

app.post('/api/generate-player-2d-art', async (req, res) => {
  if (!sharp) {
    res.status(501).json({ error: '2D player art generation is disabled in this build because sharp is not installed.' });
    return;
  }
  const { imageDataUrl, imageUrl, coverImageDataUrl, playerName, teamName, playerStatsSummary, gameContext, stylePrompt } = req.body || {};
  let parsed = parseImageDataUrl(imageDataUrl);

  if (!parsed && imageUrl) {
    try {
      const baseOrigin = `${req.protocol}://${req.get('host')}`;
      const url = new URL(String(imageUrl), baseOrigin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        res.status(400).json({ error: 'imageUrl must use http or https.' });
        return;
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'wknd-stats/cover-generator'
        }
      });
      if (!response.ok) {
        res.status(400).json({ error: `Could not fetch player image URL (${response.status}).` });
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (!buffer || !buffer.length) {
        res.status(400).json({ error: 'Player image URL returned empty data.' });
        return;
      }

      try {
        const meta = await sharp(buffer).metadata();
        if (!meta || !meta.width || !meta.height) {
          res.status(400).json({ error: 'Player image URL did not return a valid raster image.' });
          return;
        }
      } catch (validationError) {
        res.status(400).json({ error: 'Player image URL is not a supported image format.' });
        return;
      }

      parsed = { mimeType: 'image/jpeg', buffer };
    } catch (error) {
      res.status(400).json({ error: 'Could not read player image URL.' });
      return;
    }
  }

  if (!parsed) {
    res.status(400).json({ error: 'Provide either imageDataUrl (base64) or imageUrl.' });
    return;
  }

  if (parsed.buffer.length > (4.5 * 1024 * 1024)) {
    res.status(400).json({ error: 'Image is too large. Please upload a smaller image (under 4.5MB).' });
    return;
  }

  try {
    const artDirection = await generatePlayerArtDirection(playerName, teamName, stylePrompt, gameContext, playerStatsSummary);
    const preset = getStylizePreset(artDirection);
    const W = 1200;
    const H = 630;
    const parsedCover = parseImageDataUrl(coverImageDataUrl);
    const coverBaseBuffer = parsedCover
      ? await sharp(parsedCover.buffer).rotate().resize(W, H, { fit: 'cover', position: 'centre' }).png({ compressionLevel: 9 }).toBuffer()
      : null;

    const rotated = sharp(parsed.buffer).rotate();
    const rotatedMeta = await rotated.metadata();
    const sourceW = Math.max(1, Number(rotatedMeta.width || 1));
    const sourceH = Math.max(1, Number(rotatedMeta.height || 1));
    const upperBodyHeight = Math.max(1, Math.floor(sourceH * 0.64));

    const upperBodySource = await sharp(parsed.buffer)
      .rotate()
      .extract({ left: 0, top: 0, width: sourceW, height: upperBodyHeight })
      .toBuffer();

    const subjectWidth = 520;
    const subjectHeight = 560;
    const subjectMaskSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${subjectWidth}" height="${subjectHeight}" viewBox="0 0 ${subjectWidth} ${subjectHeight}">
  <defs>
    <linearGradient id="alphaX" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(255,255,255,0.0)"/>
      <stop offset="18%" stop-color="rgba(255,255,255,0.9)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,1.0)"/>
    </linearGradient>
    <linearGradient id="alphaY" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,1.0)"/>
      <stop offset="78%" stop-color="rgba(255,255,255,1.0)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.0)"/>
    </linearGradient>
  </defs>
  <rect width="${subjectWidth}" height="${subjectHeight}" fill="url(#alphaX)"/>
  <rect width="${subjectWidth}" height="${subjectHeight}" fill="url(#alphaY)"/>
</svg>
    `);

    const subjectLayer = await sharp(upperBodySource)
      .resize(subjectWidth, subjectHeight, { fit: 'cover', position: 'north' })
      .modulate({
        saturation: Math.max(1.0, preset.saturation * 0.9),
        brightness: Math.max(1.08, preset.brightness * 1.02),
        hue: preset.hue
      })
      .normalise()
      .sharpen({ sigma: 0.85, m1: 0.7, m2: 1.1, x1: 2, y2: 8, y3: 12 })
      .composite([{ input: subjectMaskSvg, blend: 'dest-in' }])
      .png({ compressionLevel: 9 })
      .toBuffer();

    const subjectShadow = await sharp({
      create: {
        width: subjectWidth + 36,
        height: subjectHeight + 20,
        channels: 4,
        background: { r: 2, g: 6, b: 16, alpha: 0.16 }
      }
    })
      .blur(14)
      .png({ compressionLevel: 9 })
      .toBuffer();
    const subjectShadowWidth = subjectWidth + 36;
    const subjectShadowHeight = subjectHeight + 20;

    const subjectLeft = Math.max(0, W - subjectWidth - 34);
    const subjectTop = Math.max(0, H - subjectHeight - 8);
    const subjectShadowLeft = Math.max(0, Math.min(subjectLeft - 18, W - subjectShadowWidth));
    const subjectShadowTop = Math.max(0, Math.min(subjectTop - 10, H - subjectShadowHeight));

    const templateSvg = buildPlayerTemplateSvg(W, H);
    const rightFadeSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(2,6,23,0.0)"/>
      <stop offset="100%" stop-color="rgba(2,6,23,0.14)"/>
    </linearGradient>
  </defs>
  <rect x="${Math.round(W * 0.52)}" y="0" width="${Math.round(W * 0.48)}" height="${H}" fill="url(#fade)"/>
</svg>
    `);

    const finalImage = await sharp({
      create: {
        width: W,
        height: H,
        channels: 4,
        background: '#0b1220'
      }
    })
      .composite([
        ...(coverBaseBuffer ? [{ input: coverBaseBuffer, top: 0, left: 0, blend: 'over' }] : [{ input: templateSvg, top: 0, left: 0, blend: 'over' }]),
        ...(coverBaseBuffer ? [{ input: rightFadeSvg, top: 0, left: 0, blend: 'over' }] : []),
        { input: subjectShadow, top: subjectShadowTop, left: subjectShadowLeft, blend: 'over' },
        { input: subjectLayer, top: subjectTop, left: subjectLeft, blend: 'over' },
      ])
      .png({ compressionLevel: 9 })
      .toBuffer();

    const output = `data:image/png;base64,${finalImage.toString('base64')}`;
    res.json({ imageDataUrl: output, artDirection });
  } catch (error) {
    const detail = String(error?.message || error || 'Unknown error').slice(0, 220);
    console.error('generate-player-2d-art failed:', error);
    res.status(500).json({ error: `Failed to generate 2D player artwork: ${detail}` });
  }
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

app.put('/api/state', async (req, res) => {
  const { teams, games } = req.body || {};
  if (!Array.isArray(teams) || !Array.isArray(games)) {
    res.status(400).json({ error: 'Body must include teams[] and games[]' });
    return;
  }

  try {
    const teamsWithCachedImages = await persistPlayerImagesForTeams(teams);
    writeState(teamsWithCachedImages, games);
    res.json({ ok: true, teams: teamsWithCachedImages, games });
  } catch (error) {
    res.status(500).json({ error: 'Failed to persist state.' });
  }
});

app.put('/api/teams', async (req, res) => {
  const { teams } = req.body || {};
  if (!Array.isArray(teams)) {
    res.status(400).json({ error: 'Body must include teams[]' });
    return;
  }

  try {
    const teamsWithCachedImages = await persistPlayerImagesForTeams(teams);
    const state = readState();
    writeState(teamsWithCachedImages, state.games);
    res.json({ ok: true, teams: teamsWithCachedImages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to persist teams.' });
  }
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

app.put('/api/games/:gameId/video', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  if (!gameId) {
    res.status(400).json({ error: 'gameId is required.' });
    return;
  }

  const youtubeUrl = String(req.body?.youtubeUrl || '').trim();
  const state = readState();
  const existingGames = Array.isArray(state.games) ? state.games : [];
  const targetGame = existingGames.find((game) => String(game?.id || '').trim() === gameId);

  if (!targetGame) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  const nextGames = existingGames.map((game) => {
    if (String(game?.id || '').trim() !== gameId) return game;
    const nextGame = { ...game };
    if (youtubeUrl) {
      nextGame.youtubeUrl = youtubeUrl;
    } else {
      delete nextGame.youtubeUrl;
    }
    return nextGame;
  });

  writeState(state.teams || [], nextGames);
  broadcastSync();

  const savedGame = nextGames.find((game) => String(game?.id || '').trim() === gameId) || null;
  res.json({ ok: true, game: savedGame });
});

app.put('/api/games/:gameId/social-cover', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  const imageDataUrl = String(req.body?.imageDataUrl || '').trim();
  if (!gameId) {
    res.status(400).json({ error: 'gameId is required.' });
    return;
  }

  const parsed = parseImageDataUrl(imageDataUrl);
  if (!parsed) {
    res.status(400).json({ error: 'imageDataUrl must be a valid base64 image data URL.' });
    return;
  }
  if (parsed.buffer.length > (6 * 1024 * 1024)) {
    res.status(400).json({ error: 'Image is too large. Use a file smaller than 6MB.' });
    return;
  }

  const state = readState();
  const game = (state.games || []).find((item) => item.id === gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  const nextGames = (state.games || []).map((item) => (
    item.id === gameId ? { ...item, socialCoverDataUrl: imageDataUrl } : item
  ));
  writeState(state.teams || [], nextGames);
  res.json({ ok: true });
});

app.delete('/api/games/:gameId/social-cover', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  if (!gameId) {
    res.status(400).json({ error: 'gameId is required.' });
    return;
  }

  const state = readState();
  const game = (state.games || []).find((item) => item.id === gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  const nextGames = (state.games || []).map((item) => (
    item.id === gameId ? { ...item, socialCoverDataUrl: '' } : item
  ));
  writeState(state.teams || [], nextGames);
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

  const applied = writeActiveSession(session, sourceClientId || null);
  res.json({ ok: true, applied });
});

app.delete('/api/active-session', (req, res) => {
  const {
    sourceClientId,
    clearLiveEvents: shouldClearLiveEvents,
    discardedSessionInstanceId,
    discardedSessionCreatedAt
  } = req.body || {};
  clearActiveSession(sourceClientId || null, {
    discardedSessionInstanceId,
    discardedSessionCreatedAt
  });
  if (shouldClearLiveEvents) {
    clearLiveEvents(sourceClientId || null);
  }
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
