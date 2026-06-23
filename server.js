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
const REQUEST_BODY_LIMIT = String(process.env.WKND_REQUEST_BODY_LIMIT || '64mb').trim() || '64mb';
let wss = null;
let lastActiveSessionSourceId = null;
let lastActiveSessionClearedAt = 0;
let lastDiscardedSessionInstanceId = '';
let lastDiscardedSessionClearedAt = 0;
const LIVE_SESSION_GUARDS_KEY = 'liveSessionGuards';
const PUBLIC_AWARDS_PAGE_KEY = 'publicAwardsPageEnabled';
const LIVE_SESSION_CLOCK_SKEW_TOLERANCE_MS = 10 * 60 * 1000;

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

function ensureGamesManualPotgPlayerIdColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'manual_potg_player_id')) {
    db.exec('ALTER TABLE games ADD COLUMN manual_potg_player_id TEXT NOT NULL DEFAULT ""');
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

function ensureGamesUnderReviewColumn() {
  const columns = db.prepare('PRAGMA table_info(games)').all();
  if (!columns.some((column) => column.name === 'under_review')) {
    db.exec('ALTER TABLE games ADD COLUMN under_review INTEGER NOT NULL DEFAULT 0');
  }
}

function ensurePlayerProfileColumns() {
  const columns = db.prepare('PRAGMA table_info(players)').all();
  const wanted = [
    ['positions', "TEXT NOT NULL DEFAULT '[]'"],
    ['picture_url', 'TEXT NOT NULL DEFAULT ""'],
    ['height', 'TEXT NOT NULL DEFAULT ""'],
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
      height TEXT NOT NULL DEFAULT '',
      picture_url TEXT NOT NULL DEFAULT '',
      birthday TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      social TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      writeup TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    INSERT INTO players_new (
      id, team_id, name, number, positions, height, picture_url, birthday, email, social, contact, writeup, sort_order
    )
    SELECT
      id, team_id, name, number, positions, COALESCE(height, ''), picture_url, birthday, email, social, contact, writeup, sort_order
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
    height TEXT NOT NULL DEFAULT '',
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
    manual_potg_player_id TEXT NOT NULL DEFAULT '',
    social_cover_data_url TEXT NOT NULL DEFAULT '',
    dnp_players_json TEXT NOT NULL DEFAULT '[]',
    under_review INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS match_sessions (
    session_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    ended_at INTEGER NOT NULL DEFAULT 0,
    discarded_at INTEGER NOT NULL DEFAULT 0
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
ensureGamesManualPotgPlayerIdColumn();
ensureGamesPeriodSnapshotsColumn();
ensureGamesSocialCoverColumn();
ensureGamesDnpColumn();
ensureGamesUnderReviewColumn();
ensurePlayerProfileColumns();
ensurePlayerTotalsTable();
ensurePlayersTableWithoutLegacyStats();
ensureGamePlayerStatsTeamColumn();
ensureGamePlayerStatsMinutesColumn();

const selectLegacyStateStmt = db.prepare('SELECT teams_json, games_json FROM app_state WHERE id = 1');
const selectLegacyConfigStmt = db.prepare('SELECT value_json FROM config_values WHERE key = ?');
const upsertConfigValueStmt = db.prepare(`
  INSERT INTO config_values (key, value_json)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value_json = excluded.value_json,
    updated_at = CURRENT_TIMESTAMP
`);

const clearPlayersStmt = db.prepare('DELETE FROM players');
const clearPlayerTotalsStmt = db.prepare('DELETE FROM player_totals');
const clearTeamsStmt = db.prepare('DELETE FROM teams');
const clearGamePlayerStatsStmt = db.prepare('DELETE FROM game_player_stats');
const clearGamesStmt = db.prepare('DELETE FROM games');
const clearStatActionsStmt = db.prepare('DELETE FROM stat_actions');
const deleteGameByIdStmt = db.prepare('DELETE FROM games WHERE id = ?');
const deleteGamePlayerStatsByGameStmt = db.prepare('DELETE FROM game_player_stats WHERE game_id = ?');

const insertTeamStmt = db.prepare('INSERT INTO teams (id, name, color, sort_order) VALUES (@id, @name, @color, @sort_order)');
const insertPlayerStmt = db.prepare(`
  INSERT INTO players (
    id, team_id, name, number, positions, height, picture_url, birthday, email, social, contact, writeup, sort_order
  ) VALUES (
    @id, @team_id, @name, @number, @positions, @height, @picture_url, @birthday, @email, @social, @contact, @writeup, @sort_order
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
    id, date, team_a_id, team_b_id, team_a_name, team_b_name, team_a_score, team_b_score, game_log_json, period_snapshots_json, youtube_url, game_writeup, potg_writeup, manual_potg_player_id, social_cover_data_url, dnp_players_json, under_review, sort_order
  ) VALUES (
    @id, @date, @team_a_id, @team_b_id, @team_a_name, @team_b_name, @team_a_score, @team_b_score, @game_log_json, @period_snapshots_json, @youtube_url, @game_writeup, @potg_writeup, @manual_potg_player_id, @social_cover_data_url, @dnp_players_json, @under_review, @sort_order
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
    p.height,
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
  SELECT id, date, team_a_id, team_b_id, team_a_name, team_b_name, team_a_score, team_b_score, game_log_json, period_snapshots_json, youtube_url, game_writeup, potg_writeup, manual_potg_player_id, LENGTH(social_cover_data_url) AS social_cover_data_len, dnp_players_json, under_review
  FROM games
  ORDER BY sort_order ASC, id DESC
`);
const selectGameCoverByIdStmt = db.prepare('SELECT social_cover_data_url FROM games WHERE id = ?');
const selectAllGameCoversStmt = db.prepare('SELECT id, social_cover_data_url FROM games');
const updateGameCoverStmt = db.prepare('UPDATE games SET social_cover_data_url = ? WHERE id = ?');
const selectGamePlayerStatsStmt = db.prepare(`
  SELECT game_id, team_id, player_id, pts, ast, reb, stl, blk, turnover, pf, fg2m, fg3m, fg2m_miss, fg3m_miss, ftm, ft_miss, minutes
  FROM game_player_stats
`);
const selectPlayerTeamIdStmt = db.prepare('SELECT team_id FROM players WHERE id = ?');
const selectPlayerByIdAndTeamStmt = db.prepare(`
  SELECT id, team_id, name, number, positions, height, picture_url, birthday, email, social, contact, writeup
  FROM players
  WHERE id = ? AND team_id = ?
  LIMIT 1
`);
const updatePlayerProfileStmt = db.prepare(`
  UPDATE players
  SET
    name = @name,
    number = @number,
    positions = @positions,
    height = @height,
    picture_url = @picture_url,
    birthday = @birthday,
    email = @email,
    social = @social,
    contact = @contact,
    writeup = @writeup
  WHERE id = @id AND team_id = @team_id
`);
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
const selectPlayerTotalsAggregateStmt = db.prepare(`
  SELECT
    player_id,
    COUNT(DISTINCT game_id) AS games_played,
    COALESCE(SUM(pts), 0) AS pts,
    COALESCE(SUM(ast), 0) AS ast,
    COALESCE(SUM(reb), 0) AS reb,
    COALESCE(SUM(stl), 0) AS stl,
    COALESCE(SUM(blk), 0) AS blk,
    COALESCE(SUM(turnover), 0) AS turnover,
    COALESCE(SUM(pf), 0) AS pf,
    COALESCE(SUM(fg2m), 0) AS fg2m,
    COALESCE(SUM(fg3m), 0) AS fg3m,
    COALESCE(SUM(fg2m_miss), 0) AS fg2m_miss,
    COALESCE(SUM(fg3m_miss), 0) AS fg3m_miss,
    COALESCE(SUM(ftm), 0) AS ftm,
    COALESCE(SUM(ft_miss), 0) AS ft_miss
  FROM game_player_stats
  GROUP BY player_id
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
const selectMatchSessionByIdStmt = db.prepare(`
  SELECT session_id, status, created_at, updated_at, ended_at, discarded_at
  FROM match_sessions
  WHERE session_id = ?
`);
const upsertMatchSessionRunningStmt = db.prepare(`
  INSERT INTO match_sessions (session_id, status, created_at, updated_at, ended_at, discarded_at)
  VALUES (@session_id, 'running', @created_at, @updated_at, 0, 0)
  ON CONFLICT(session_id) DO UPDATE SET
    status = CASE WHEN match_sessions.status IN ('ended', 'discarded') THEN match_sessions.status ELSE 'running' END,
    created_at = CASE WHEN match_sessions.created_at > 0 THEN match_sessions.created_at ELSE excluded.created_at END,
    updated_at = excluded.updated_at
`);
const upsertMatchSessionEndedStmt = db.prepare(`
  INSERT INTO match_sessions (session_id, status, created_at, updated_at, ended_at, discarded_at)
  VALUES (@session_id, 'ended', @created_at, @updated_at, @ended_at, 0)
  ON CONFLICT(session_id) DO UPDATE SET
    status = CASE WHEN match_sessions.status = 'discarded' THEN 'discarded' ELSE 'ended' END,
    updated_at = excluded.updated_at,
    ended_at = CASE WHEN match_sessions.ended_at > 0 THEN match_sessions.ended_at ELSE excluded.ended_at END
`);
const upsertMatchSessionDiscardedStmt = db.prepare(`
  INSERT INTO match_sessions (session_id, status, created_at, updated_at, ended_at, discarded_at)
  VALUES (@session_id, 'discarded', @created_at, @updated_at, 0, @discarded_at)
  ON CONFLICT(session_id) DO UPDATE SET
    status = 'discarded',
    updated_at = excluded.updated_at,
    discarded_at = CASE WHEN match_sessions.discarded_at > 0 THEN match_sessions.discarded_at ELSE excluded.discarded_at END
`);
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

function isClearlyBeforeClearBoundary(timestampMs, clearBoundaryMs) {
  const ts = toInt(timestampMs);
  const boundary = toInt(clearBoundaryMs);
  if (ts <= 0 || boundary <= 0) return false;
  return (ts + LIVE_SESSION_CLOCK_SKEW_TOLERANCE_MS) < boundary;
}

function normalizeTerminationStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'ended' ? 'ended' : 'discarded';
}

function markMatchSessionStatus(sessionId, status, sessionCreatedAt = 0) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return;
  const now = Date.now();
  const safeCreatedAt = toInt(sessionCreatedAt) > 0 ? toInt(sessionCreatedAt) : now;

  if (status === 'ended') {
    upsertMatchSessionEndedStmt.run({
      session_id: safeSessionId,
      created_at: safeCreatedAt,
      updated_at: now,
      ended_at: now
    });
    return;
  }

  upsertMatchSessionDiscardedStmt.run({
    session_id: safeSessionId,
    created_at: safeCreatedAt,
    updated_at: now,
    discarded_at: now
  });
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

const PLAYER_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

function normalizePlayerPositionsForStorage(rawValue, fallback = []) {
  const rawPositions = [];
  const pushFromValue = (value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string') rawPositions.push(item);
      });
      return;
    }
    if (typeof value === 'string') {
      value.split(/[\s,\/?|]+/).forEach((item) => {
        if (item) rawPositions.push(item);
      });
    }
  };

  pushFromValue(rawValue);
  if (!rawPositions.length) pushFromValue(fallback);

  return Array.from(new Set(
    rawPositions
      .map((pos) => String(pos || '').trim().toUpperCase())
      .filter((pos) => PLAYER_POSITIONS.includes(pos))
  ));
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

function getSocialImageVersion(game, teams = []) {
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

  const potg = derivePlayerOfTheGameFromState(game, teams);
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
    String(game.socialCoverLen || 0),
    String(game.manualPotgPlayerId || ''),
    String(potg?.playerId || ''),
    String(potg?.pictureUrl || ''),
    String(potg?.name || '')
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

function buildSocialMetaTags({ req, game, teams = [] }) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const canonicalPath = game
    ? `/history/game/${encodeURIComponent(game.id)}`
    : '/';
  const canonicalUrl = `${origin}${canonicalPath}`;
  const title = buildRecapTitle(game);
  const description = buildRecapDescription(game);
  const imageVersion = getSocialImageVersion(game, teams);
  const imageUrl = game
    ? `${origin}/api/social-cover/${encodeURIComponent(game.id)}.png?v=${encodeURIComponent(imageVersion)}`
    : `${origin}/api/social-cover/default.png?v=${encodeURIComponent(imageVersion)}`;

  const teamAName = normalizeSocialCoverText(game?.teamAName || '');
  const teamBName = normalizeSocialCoverText(game?.teamBName || '');
  const imageAlt = game
    ? `${teamAName} ${game.teamAScore ?? ''} – ${game.teamBScore ?? ''} ${teamBName} · WKND Basketball Game Recap`
    : 'WKND Basketball League – Live Scores & Stats';

  const potg = game ? derivePlayerOfTheGameFromState(game, teams) : null;
  const potgName = normalizeSocialCoverText(potg?.name || '');
  const potgStats = normalizeSocialCoverText(potg?.statsLine || '');

  const publishedIso = game?.date
    ? (() => { try { return new Date(game.date).toISOString(); } catch { return null; } })()
    : null;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,

    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="WKND Basketball League">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${escapeHtml(trimForMeta(title, 110))}">`,
    `<meta property="og:description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escapeHtml(imageAlt)}">`,
  ];

  if (publishedIso) {
    tags.push(`<meta property="article:published_time" content="${escapeHtml(publishedIso)}">`);
    tags.push(`<meta property="article:section" content="Basketball">`);
    tags.push(`<meta property="article:tag" content="WKND Basketball">`);
    if (teamAName) tags.push(`<meta property="article:tag" content="${escapeHtml(teamAName)}">`);
    if (teamBName) tags.push(`<meta property="article:tag" content="${escapeHtml(teamBName)}">`);
    if (potgName) tags.push(`<meta property="article:tag" content="${escapeHtml(potgName)}">`);
  }

  tags.push(
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(trimForMeta(title, 110))}">`,
    `<meta name="twitter:description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">`,
    `<meta name="twitter:label1" content="Final Score">`,
    `<meta name="twitter:data1" content="${escapeHtml(game ? `${teamAName} ${game.teamAScore ?? 0} – ${game.teamBScore ?? 0} ${teamBName}` : 'WKND Basketball')}">`,
    ...(potgName ? [
      `<meta name="twitter:label2" content="Player of the Game">`,
      `<meta name="twitter:data2" content="${escapeHtml(`${potgName}${potgStats ? ` · ${potgStats}` : ''}`)}">`
    ] : [])
  );

  return tags.join('\n    ');
}

function buildPlayerSocialMetaTags({ req, player, team }) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const teamId = String(player?.teamId || team?.id || '').trim();
  const playerId = String(player?.id || '').trim();
  const canonicalPath = `/teams/player/${encodeURIComponent(teamId)}/${encodeURIComponent(playerId)}`;
  const canonicalUrl = `${origin}${canonicalPath}`;

  const playerName = normalizeSocialCoverText(player?.name || 'Player');
  const teamName = normalizeSocialCoverText(team?.name || '');
  const gp = Number(player?.gamesPlayed || 0);
  const stats = player?.totalStats || {};
  const ptsAvg = gp > 0 ? (Number(stats.pts || 0) / gp).toFixed(1) : '0.0';
  const rebAvg = gp > 0 ? (Number(stats.reb || 0) / gp).toFixed(1) : '0.0';
  const astAvg = gp > 0 ? (Number(stats.ast || 0) / gp).toFixed(1) : '0.0';

  const title = `${playerName} · WKND Basketball`;
  const description = gp > 0
    ? `${playerName} — ${gp} GP · ${ptsAvg} PTS · ${rebAvg} REB · ${astAvg} AST per game${teamName ? ` for ${teamName}` : ''}.`
    : `${playerName}${teamName ? ` · ${teamName}` : ''} · WKND Basketball League.`;

  const versionSource = [playerName, teamName, gp, ptsAvg, rebAvg, astAvg, String(player?.pictureUrl || '')].join('|');
  const imageVersion = crypto.createHash('sha1').update(versionSource).digest('hex').slice(0, 12);
  const imageUrl = `${origin}/api/social-cover/player/${encodeURIComponent(playerId)}.png?v=${encodeURIComponent(imageVersion)}`;

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="WKND League Stats">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`
  ].join('\n    ');
}

function buildStandingsSocialMetaTags({ req, state }) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const canonicalUrl = `${origin}/standings`;
  const teams = state.teams || [];
  const games = (state.games || []).filter(g =>
    g.teamAScore != null && g.teamBScore != null &&
    (Number(g.teamAScore) + Number(g.teamBScore)) > 0
  );
  const winsMap = {};
  games.forEach(g => {
    if (Number(g.teamAScore || 0) > Number(g.teamBScore || 0)) winsMap[g.teamAId] = (winsMap[g.teamAId] || 0) + 1;
    if (Number(g.teamBScore || 0) > Number(g.teamAScore || 0)) winsMap[g.teamBId] = (winsMap[g.teamBId] || 0) + 1;
  });
  const leader = teams.map(t => ({ ...t, w: winsMap[t.id] || 0 })).sort((a, b) => b.w - a.w)[0];
  const title = 'WKND Basketball League — Season Standings';
  const description = leader?.w > 0
    ? `${normalizeSocialCoverText(leader.name)} leads with ${leader.w} win${leader.w !== 1 ? 's' : ''}. See the full season standings.`
    : 'View the current WKND Basketball League season standings.';
  const imageUrl = `${origin}/api/social-cover/standings.png`;
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="WKND Basketball League">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="WKND Basketball League Season Standings">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(trimForMeta(description, 190))}">`,
    `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">`,
  ].join('\n    ');
}

async function buildSocialCoverPng(game, teams = [], baseOrigin = '') {
  requireSharp();
  const W = 1200;
  const H = 630;

  // ── Default cover (no game) ───────────────────────────────────────────────
  if (!game) {
    const defaultSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#020817"/>
      <stop offset="100%" stop-color="#0d1424"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#f97316" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#f97316" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#f97316"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="#f97316" opacity="0.4"/>
  <text x="${W / 2}" y="260" fill="#ffffff" text-anchor="middle" font-size="96" font-weight="900" font-family="${SVG_FONT_STACK}">WKND</text>
  <text x="${W / 2}" y="316" fill="#f97316" text-anchor="middle" font-size="24" font-weight="700" font-family="${SVG_FONT_STACK}">BASKETBALL LEAGUE</text>
  <line x1="400" y1="350" x2="800" y2="350" stroke="#1e293b" stroke-width="2"/>
  <text x="${W / 2}" y="390" fill="#334155" text-anchor="middle" font-size="18" font-weight="600" font-family="${SVG_FONT_STACK}">LIVE SCORES · STATS · RECAPS</text>
</svg>`);
    let logoOverlay = null;
    const logoPath = resolveSocialCoverLogoPath();
    if (logoPath) {
      try {
        logoOverlay = await sharp(logoPath).resize({ width: 220, height: 44, fit: 'contain', withoutEnlargement: true }).png().toBuffer();
      } catch (_) {}
    }
    return sharp(defaultSvg)
      .composite(logoOverlay ? [{ input: logoOverlay, left: 40, top: 28 }] : [])
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  // ── Game cover ────────────────────────────────────────────────────────────
  const teamA = (Array.isArray(teams) ? teams : []).find((t) => t.id === game.teamAId) || null;
  const teamB = (Array.isArray(teams) ? teams : []).find((t) => t.id === game.teamBId) || null;
  const colorA = escapeHtml(String(teamA?.color || '#10b981'));
  const colorB = escapeHtml(String(teamB?.color || '#3b82f6'));
  const teamAName = escapeHtml(String(game.teamAName || 'HOME').toUpperCase());
  const teamBName = escapeHtml(String(game.teamBName || 'AWAY').toUpperCase());
  const teamAScore = Number(game.teamAScore || 0);
  const teamBScore = Number(game.teamBScore || 0);
  const dateText = escapeHtml(String(game.date || '').trim().split('T')[0].replace(/\s+\d{1,2}:\d{2}.*$/i, ''));

  const winA = teamAScore > teamBScore;
  const winB = teamBScore > teamAScore;
  const resultLine = winA ? `${teamAName} WINS` : winB ? `${teamBName} WINS` : 'FINAL · DRAW';
  const resultColor = winA ? colorA : winB ? colorB : '#475569';

  // POTG
  const potg = derivePlayerOfTheGameFromState(game, teams);
  const potgName = escapeHtml(normalizeSocialCoverText(potg?.name || ''));
  const potgStats = escapeHtml(normalizeSocialCoverText(potg?.statsLine || ''));
  const potgMeta = escapeHtml(normalizeSocialCoverText(`#${potg?.number || '–'}  ·  ${potg?.teamName || ''}`));
  const potgInitials = escapeHtml(getInitials(potg?.name || '?'));
  const potgColor = escapeHtml(String(potg?.teamColor || '#f97316'));
  const potgNameSize = !potgName ? 44 : potgName.length <= 18 ? 46 : potgName.length <= 24 ? 38 : 30;

  // Avatar dims (left-anchored in POTG zone)
  const avatarR = 68;
  const avatarCx = 92;
  const avatarCy = 462;
  const avatarSize = avatarR * 2;

  // Team-name adaptive font size
  const teamNameSize = Math.max(teamAName.length, teamBName.length) <= 10 ? 28 : 22;

  let logoOverlay = null;
  let avatarOverlay = null;
  const logoPath = resolveSocialCoverLogoPath();

  if (logoPath) {
    try {
      logoOverlay = await sharp(logoPath)
        .resize({ width: 200, height: 40, fit: 'contain', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (_) {}
  }

  if (potg?.pictureUrl) {
    try {
      const src = await readImageBufferFromSource(potg.pictureUrl, baseOrigin);
      if (src) {
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${avatarSize}" height="${avatarSize}"><circle cx="${avatarR}" cy="${avatarR}" r="${avatarR}" fill="#fff"/></svg>`);
        avatarOverlay = await sharp(src)
          .rotate()
          .resize(avatarSize, avatarSize, { fit: 'cover', position: 'centre' })
          .composite([{ input: mask, blend: 'dest-in' }])
          .png({ compressionLevel: 9 })
          .toBuffer();
      }
    } catch (_) {}
  }

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#020817"/>
      <stop offset="100%" stop-color="#0b1220"/>
    </linearGradient>
    <linearGradient id="tintA" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${colorA}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${colorA}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="tintB" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${colorB}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${colorB}" stop-opacity="0.13"/>
    </linearGradient>
    <linearGradient id="potgFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#020817" stop-opacity="0"/>
      <stop offset="100%" stop-color="#020817" stop-opacity="0.18"/>
    </linearGradient>
    <clipPath id="nameClipA"><rect x="0" y="0" width="530" height="200"/></clipPath>
    <clipPath id="nameClipB"><rect x="670" y="0" width="530" height="200"/></clipPath>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="600" height="${H}" fill="url(#tintA)"/>
  <rect x="600" width="600" height="${H}" fill="url(#tintB)"/>

  <!-- Top bars -->
  <rect x="0" y="0" width="600" height="6" fill="${colorA}"/>
  <rect x="600" y="0" width="600" height="6" fill="${colorB}"/>

  <!-- Side accent bars -->
  <rect x="0" y="6" width="5" height="${H - 12}" fill="${colorA}" opacity="0.65"/>
  <rect x="${W - 5}" y="6" width="5" height="${H - 12}" fill="${colorB}" opacity="0.65"/>

  <!-- Bottom bars -->
  <rect x="0" y="${H - 6}" width="600" height="6" fill="${colorA}" opacity="0.5"/>
  <rect x="600" y="${H - 6}" width="600" height="6" fill="${colorB}" opacity="0.5"/>

  <!-- WKND brand top-left -->
  <text x="52" y="50" fill="#ffffff" font-size="17" font-weight="800" font-family="${SVG_FONT_STACK}">WKND</text>
  <text x="52" y="66" fill="${colorA}" font-size="8" font-weight="700" font-family="${SVG_FONT_STACK}">BASKETBALL</text>

  <!-- ── SCORE ZONE (y: 72–368) ── -->

  <!-- Team A name -->
  <text x="290" y="118" fill="${colorA}" text-anchor="middle" font-size="${teamNameSize}" font-weight="700" font-family="${SVG_FONT_STACK}" clip-path="url(#nameClipA)">${teamAName}</text>

  <!-- Team A score -->
  <text x="290" y="308" fill="${winA ? '#ffffff' : '#94a3b8'}" text-anchor="middle" font-size="152" font-weight="900" font-family="${SVG_FONT_STACK}">${teamAScore}</text>

  <!-- Team A winner underline -->
  ${winA ? `<rect x="168" y="320" width="244" height="5" rx="2.5" fill="${colorA}"/>` : ''}

  <!-- Center vertical divider -->
  <line x1="600" y1="78" x2="600" y2="362" stroke="#1e293b" stroke-width="1"/>

  <!-- Center: FINAL label -->
  <text x="600" y="154" fill="#334155" text-anchor="middle" font-size="13" font-weight="700" font-family="${SVG_FONT_STACK}">FINAL SCORE</text>

  <!-- Center: result line -->
  <text x="600" y="176" fill="${resultColor}" text-anchor="middle" font-size="12" font-weight="700" font-family="${SVG_FONT_STACK}">${resultLine}</text>

  <!-- VS circle -->
  <circle cx="600" cy="248" r="30" fill="#0b1624" stroke="#1e293b" stroke-width="1"/>
  <text x="600" y="254" fill="#334155" text-anchor="middle" font-size="14" font-weight="700" font-family="${SVG_FONT_STACK}">VS</text>

  <!-- Team B name -->
  <text x="910" y="118" fill="${colorB}" text-anchor="middle" font-size="${teamNameSize}" font-weight="700" font-family="${SVG_FONT_STACK}" clip-path="url(#nameClipB)">${teamBName}</text>

  <!-- Team B score -->
  <text x="910" y="308" fill="${winB ? '#ffffff' : '#94a3b8'}" text-anchor="middle" font-size="152" font-weight="900" font-family="${SVG_FONT_STACK}">${teamBScore}</text>

  <!-- Team B winner underline -->
  ${winB ? `<rect x="788" y="320" width="244" height="5" rx="2.5" fill="${colorB}"/>` : ''}

  <!-- Separator -->
  <line x1="40" y1="362" x2="${W - 40}" y2="362" stroke="#1e293b" stroke-width="1"/>

  <!-- ── POTG ZONE (y: 362–562) ── -->
  ${potg ? `
  <!-- Avatar glow rings -->
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 14}" fill="${potgColor}" fill-opacity="0.06"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 6}" fill="${potgColor}" fill-opacity="0.10"/>
  <!-- Avatar base (filled with dark if no photo) -->
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="#0b1220"/>
  ${!avatarOverlay ? `<text x="${avatarCx}" y="${avatarCy + 14}" text-anchor="middle" fill="#334155" font-size="40" font-weight="800" font-family="${SVG_FONT_STACK}">${potgInitials}</text>` : ''}
  <!-- Avatar ring -->
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 2}" fill="none" stroke="${potgColor}" stroke-width="2.5"/>

  <!-- POTG text -->
  <text x="192" y="398" fill="#f97316" font-size="13" font-weight="700" font-family="${SVG_FONT_STACK}">PLAYER OF THE GAME</text>
  <text x="192" y="${398 + potgNameSize + 10}" fill="#ffffff" font-size="${potgNameSize}" font-weight="800" font-family="${SVG_FONT_STACK}">${potgName}</text>
  <text x="192" y="${398 + potgNameSize + 10 + 36}" fill="#e2e8f0" font-size="24" font-weight="700" font-family="${SVG_FONT_STACK}">${potgStats}</text>
  <text x="192" y="${398 + potgNameSize + 10 + 36 + 28}" fill="#64748b" font-size="16" font-family="${SVG_FONT_STACK}">${potgMeta}</text>
  ` : `
  <!-- No POTG: show writeup snippet if available -->
  <text x="${W / 2}" y="468" fill="#334155" text-anchor="middle" font-size="18" font-weight="600" font-family="${SVG_FONT_STACK}">WKNDBASKETBALL.COM</text>
  `}

  <!-- POTG zone bottom fade -->
  <rect x="0" y="468" width="${W}" height="94" fill="url(#potgFade)"/>

  <!-- Footer separator -->
  <line x1="40" y1="562" x2="${W - 40}" y2="562" stroke="#1e293b" stroke-width="1"/>

  <!-- Footer text -->
  <text x="${W / 2}" y="596" fill="#2d3f55" text-anchor="middle" font-size="12" font-weight="600" font-family="${SVG_FONT_STACK}">WKNDBASKETBALL.COM</text>
</svg>`);

  const layers = [];
  if (avatarOverlay) {
    layers.push({ input: avatarOverlay, left: avatarCx - avatarR, top: avatarCy - avatarR });
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

  const manualPotgPlayerId = String(game?.manualPotgPlayerId || '').trim();
  if (manualPotgPlayerId && stats[manualPotgPlayerId]) {
    const manualPlayer = players.find((player) => player.id === manualPotgPlayerId);
    const manualTeam = teamsList.find((team) => (Array.isArray(team?.players) ? team.players : []).some((player) => player.id === manualPotgPlayerId));
    const manualStats = stats[manualPotgPlayerId] || {};
    return {
      name: String(manualPlayer?.name || 'PLAYER').toUpperCase(),
      statsLine: `${Number(manualStats?.pts || 0)} PTS - ${Number(manualStats?.reb || 0)} REB - ${Number(manualStats?.ast || 0)} AST`,
      teamColor: String(manualTeam?.color || '#f97316'),
      number: String(manualPlayer?.number || ''),
      teamName: String(manualTeam?.name || 'Team'),
      pictureUrl: String(manualPlayer?.pictureUrl || ''),
      perScore: computePerStyleScore(manualStats),
      stats: manualStats,
      playerId: manualPotgPlayerId,
      selectionMode: 'manual'
    };
  }

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

  // Prefer direct filesystem reads for locally hosted player avatars so OG/crawler
  // rendering does not depend on external proxy/CDN behavior.
  const readLocalPlayerImage = async (pathnameValue) => {
    const pathname = String(pathnameValue || '').trim();
    if (!pathname.startsWith('/data/player-images/')) return null;
    const fileName = path.basename(pathname);
    if (!fileName || fileName === '.' || fileName === '..') return null;
    const absolutePath = path.join(playerImagesDir, fileName);
    if (!absolutePath.startsWith(playerImagesDir)) return null;
    if (!fs.existsSync(absolutePath)) return null;
    const buffer = fs.readFileSync(absolutePath);
    if (!buffer.length) return null;
    const meta = await sharp(buffer).metadata();
    if (!meta?.width || !meta?.height) return null;
    return buffer;
  };

  try {
    const localBuffer = await readLocalPlayerImage(value);
    if (localBuffer) return localBuffer;
  } catch {}

  try {
    const url = baseOrigin ? new URL(value, baseOrigin) : new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    try {
      const localBuffer = await readLocalPlayerImage(String(url.pathname || ''));
      if (localBuffer) return localBuffer;
    } catch {}

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

  const teamA = (Array.isArray(teams) ? teams : []).find((t) => t.id === game?.teamAId) || null;
  const teamB = (Array.isArray(teams) ? teams : []).find((t) => t.id === game?.teamBId) || null;
  const colorA = escapeHtml(String(teamA?.color || '#10b981'));
  const colorB = escapeHtml(String(teamB?.color || '#3b82f6'));
  const teamAName = escapeHtml(String(game?.teamAName || 'HOME').toUpperCase());
  const teamBName = escapeHtml(String(game?.teamBName || 'AWAY').toUpperCase());
  const teamAScore = Number(game?.teamAScore || 0);
  const teamBScore = Number(game?.teamBScore || 0);
  const dateText = escapeHtml(String(game?.date || '').trim().split('T')[0].replace(/\s+\d{1,2}:\d{2}.*$/i, ''));
  const winA = teamAScore > teamBScore;
  const winB = teamBScore > teamAScore;
  const resultLine = winA ? `${teamAName} WINS` : winB ? `${teamBName} WINS` : 'FINAL · DRAW';
  const resultColor = winA ? colorA : winB ? colorB : '#64748b';
  const isOT = !!(game?.overtime || game?.ot || game?.isOT);
  const finalLabel = escapeHtml(isOT ? 'FINAL / OT' : 'FINAL SCORE');

  const potg = derivePlayerOfTheGameFromState(game, teams);
  const potgName = escapeHtml(normalizeSocialCoverText(potg?.name || ''));
  const potgStats = escapeHtml(normalizeSocialCoverText(potg?.statsLine || ''));
  const potgMeta = escapeHtml(normalizeSocialCoverText(`#${potg?.number || '–'}  ·  ${potg?.teamName || ''}`));
  const potgInitials = escapeHtml(getInitials(potg?.name || '?'));
  const potgColor = escapeHtml(String(potg?.teamColor || '#f97316'));
  const potgNameSize = !potgName ? 38 : potgName.length <= 18 ? 40 : potgName.length <= 24 ? 34 : 28;

  // Avatar in POTG zone
  const avatarR = 60;
  const avatarCx = 88;
  const avatarCy = 522;
  const avatarSize = avatarR * 2;

  let logoOverlay = null;
  let avatarOverlay = null;
  const logoPath = resolveSocialCoverLogoPath();

  if (logoPath) {
    try {
      logoOverlay = await sharp(logoPath)
        .resize({ width: 180, height: 36, fit: 'contain', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (_) {}
  }

  if (potg?.pictureUrl) {
    try {
      const src = await readImageBufferFromSource(potg.pictureUrl, baseOrigin);
      if (src) {
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${avatarSize}" height="${avatarSize}"><circle cx="${avatarR}" cy="${avatarR}" r="${avatarR}" fill="#fff"/></svg>`);
        avatarOverlay = await sharp(src)
          .rotate()
          .resize(avatarSize, avatarSize, { fit: 'cover', position: 'centre' })
          .composite([{ input: mask, blend: 'dest-in' }])
          .png({ compressionLevel: 9 })
          .toBuffer();
      }
    } catch (_) {}
  }

  const overlaySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="txt" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="1" stdDeviation="4" flood-color="#000000" flood-opacity="0.9"/>
    </filter>
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#020817" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#020817" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="botFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#020817" stop-opacity="0"/>
      <stop offset="100%" stop-color="#020817" stop-opacity="0.94"/>
    </linearGradient>
    <filter id="card" x="-40%" y="-30%" width="180%" height="200%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000000" flood-opacity="0.72"/>
    </filter>
    <linearGradient id="cardSheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="scoreClip"><rect x="955" y="474" width="200" height="96" rx="12"/></clipPath>
  </defs>

  <!-- Top gradient (header readability) -->
  <rect x="0" y="0" width="${W}" height="160" fill="url(#topFade)"/>

  <!-- Bottom gradient (POTG readability) -->
  <rect x="0" y="400" width="${W}" height="230" fill="url(#botFade)"/>

  <!-- ── BORDERS (match auto-generated cover) ── -->
  <rect x="0" y="0" width="600" height="6" fill="${colorA}"/>
  <rect x="600" y="0" width="600" height="6" fill="${colorB}"/>
  <rect x="0" y="6" width="5" height="${H - 12}" fill="${colorA}" opacity="0.65"/>
  <rect x="${W - 5}" y="6" width="5" height="${H - 12}" fill="${colorB}" opacity="0.65"/>
  <rect x="0" y="${H - 6}" width="600" height="6" fill="${colorA}" opacity="0.5"/>
  <rect x="600" y="${H - 6}" width="600" height="6" fill="${colorB}" opacity="0.5"/>

  <!-- WKND brand -->
  <text x="52" y="48" fill="#ffffff" font-size="16" font-weight="800" font-family="${SVG_FONT_STACK}" filter="url(#txt)">WKND</text>
  <text x="52" y="63" fill="${colorA}" font-size="8" font-weight="700" font-family="${SVG_FONT_STACK}" filter="url(#txt)">BASKETBALL</text>

  <!-- ── Score card: one unified card, bottom-right ──
       x=955–1155 (200px), y=474–570. Center y=522 = POTG avatarCy.
       Col divider at x=1055. Left col center x=1005, right x=1105.  -->

  <!-- Card: shadow + dark glass body -->
  <rect x="955" y="474" width="200" height="96" rx="12" fill="#040c18" fill-opacity="0.80" filter="url(#card)" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"/>

  <!-- Column color tints — winner more saturated, loser very light -->
  <rect x="955" y="474" width="100" height="96" fill="${colorA}" fill-opacity="${winA ? '0.38' : '0.10'}" clip-path="url(#scoreClip)"/>
  <rect x="1055" y="474" width="100" height="96" fill="${colorB}" fill-opacity="${winB ? '0.38' : '0.10'}" clip-path="url(#scoreClip)"/>

  <!-- Glass sheen over the color tints -->
  <rect x="956" y="475" width="198" height="26" rx="11" fill="url(#cardSheen)"/>

  <!-- Row divider -->
  <line x1="963" y1="500" x2="1147" y2="500" stroke="#ffffff" stroke-width="1" stroke-opacity="0.08"/>

  <!-- Column divider -->
  <line x1="1055" y1="482" x2="1055" y2="562" stroke="#ffffff" stroke-width="1" stroke-opacity="0.08"/>

  <!-- Row 1: team names -->
  <text x="1005" y="493" fill="#ffffff" text-anchor="middle" font-size="12" font-weight="700" font-family="${SVG_FONT_STACK}" clip-path="url(#scoreClip)" filter="url(#txt)" opacity="${winA ? '1' : '0.45'}">${teamAName}</text>
  <text x="1105" y="493" fill="#ffffff" text-anchor="middle" font-size="12" font-weight="700" font-family="${SVG_FONT_STACK}" clip-path="url(#scoreClip)" filter="url(#txt)" opacity="${winB ? '1' : '0.45'}">${teamBName}</text>

  <!-- Row 2: big scores — 48px, centered in lower zone, equal 12px top+bottom padding -->
  <text x="1005" y="548" fill="#ffffff" text-anchor="middle" font-size="48" font-weight="900" font-family="${SVG_FONT_STACK}" clip-path="url(#scoreClip)" filter="url(#txt)" opacity="${winA ? '1' : '0.38'}">${teamAScore}</text>
  <text x="1105" y="548" fill="#ffffff" text-anchor="middle" font-size="48" font-weight="900" font-family="${SVG_FONT_STACK}" clip-path="url(#scoreClip)" filter="url(#txt)" opacity="${winB ? '1' : '0.38'}">${teamBScore}</text>

  <!-- ── POTG ZONE ── -->
  ${potg ? `
  <!-- Avatar glow rings -->
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 12}" fill="${potgColor}" fill-opacity="0.08"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 5}" fill="${potgColor}" fill-opacity="0.12"/>
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR}" fill="#020817" fill-opacity="0.7"/>
  ${!avatarOverlay ? `<text x="${avatarCx}" y="${avatarCy + 12}" text-anchor="middle" fill="#475569" font-size="34" font-weight="800" font-family="${SVG_FONT_STACK}" filter="url(#txt)">${potgInitials}</text>` : ''}
  <circle cx="${avatarCx}" cy="${avatarCy}" r="${avatarR + 2}" fill="none" stroke="${potgColor}" stroke-width="2" stroke-opacity="0.9"/>

  <text x="180" y="452" fill="#f97316" font-size="13" font-weight="700" font-family="${SVG_FONT_STACK}" filter="url(#txt)">PLAYER OF THE GAME</text>
  <text x="180" y="${452 + potgNameSize + 8}" fill="#ffffff" font-size="${potgNameSize}" font-weight="800" font-family="${SVG_FONT_STACK}" filter="url(#txt)">${potgName}</text>
  <text x="180" y="${452 + potgNameSize + 8 + 32}" fill="#e2e8f0" font-size="22" font-weight="700" font-family="${SVG_FONT_STACK}" filter="url(#txt)">${potgStats}</text>
  <text x="180" y="${452 + potgNameSize + 8 + 32 + 24}" fill="#94a3b8" font-size="15" font-family="${SVG_FONT_STACK}" filter="url(#txt)">${potgMeta}</text>
  ` : ''}

  <!-- Footer -->
  <text x="${W / 2}" y="617" fill="#334155" text-anchor="middle" font-size="11" font-weight="600" font-family="${SVG_FONT_STACK}" filter="url(#txt)">WKNDBASKETBALL.COM</text>
</svg>`);

  const layers = [{ input: overlaySvg, top: 0, left: 0 }];
  if (avatarOverlay) {
    layers.push({ input: avatarOverlay, left: avatarCx - avatarR, top: avatarCy - avatarR });
  }
  if (logoOverlay) {
    layers.push({ input: logoOverlay, left: 40, top: 28 });
  }

  return sharp(base)
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function buildPlayerSocialCoverPng(player, team, baseOrigin = '') {
  requireSharp();
  const W = 1200;
  const H = 630;
  const teamColor = escapeHtml(String(team?.color || '#f97316'));
  const teamName = normalizeSocialCoverText(team?.name || '').toUpperCase();
  const playerName = normalizeSocialCoverText(player?.name || 'Player').toUpperCase();
  const number = escapeHtml(String(player?.number || ''));
  const positions = Array.isArray(player?.positions) ? player.positions.join(' · ') : '';

  const gp = Number(player?.gamesPlayed || 0);
  const stats = player?.totalStats || {};
  const ptsAvg = gp > 0 ? (Number(stats.pts || 0) / gp).toFixed(1) : '–';
  const rebAvg = gp > 0 ? (Number(stats.reb || 0) / gp).toFixed(1) : '–';
  const astAvg = gp > 0 ? (Number(stats.ast || 0) / gp).toFixed(1) : '–';
  const fgMade = Number(stats.fg2m || 0) + Number(stats.fg3m || 0);
  const fgAtt = fgMade + Number(stats.fg2m_miss || 0) + Number(stats.fg3m_miss || 0);
  const fgPct = fgAtt > 0 ? `${Math.round((fgMade / fgAtt) * 100)}%` : '–';

  const nameParts = playerName.split(' ');
  const firstName = escapeHtml(nameParts[0] || '');
  const lastName = escapeHtml(nameParts.slice(1).join(' ') || '');
  const maxLen = Math.max((nameParts[0] || '').length, nameParts.slice(1).join(' ').length);
  const nameFontSize = maxLen <= 7 ? 96 : maxLen <= 10 ? 80 : maxLen <= 13 ? 66 : maxLen <= 16 ? 54 : 44;
  const nameLineSpacing = nameFontSize + 12;
  const firstNameY = lastName ? 238 : 285;
  const lastNameY = firstNameY + nameLineSpacing;

  const sublineItems = [number ? `#${number}` : null, teamName || null, positions || null].filter(Boolean);
  const subline = escapeHtml(sublineItems.join('  ·  '));

  const photoWidth = 520;
  const photoLeft = W - photoWidth;

  let photoBuffer = null;
  if (player?.pictureUrl) {
    try {
      const src = await readImageBufferFromSource(player.pictureUrl, baseOrigin);
      if (src) {
        photoBuffer = await sharp(src)
          .rotate()
          .resize(photoWidth, H, { fit: 'cover', position: 'centre' })
          .png()
          .toBuffer();
      }
    } catch (_) {}
  }

  let logoBuffer = null;
  const logoPath = resolveSocialCoverLogoPath();
  if (logoPath) {
    try {
      logoBuffer = await sharp(logoPath)
        .resize({ width: 160, height: 32, fit: 'contain', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (_) {}
  }

  const bgSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#020817"/>
      <stop offset="55%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
</svg>`);

  const overlaySvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#020817" stop-opacity="1"/>
      <stop offset="55%" stop-color="#020817" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#020817" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="textClip">
      <rect x="0" y="0" width="720" height="${H}"/>
    </clipPath>
  </defs>

  ${photoBuffer ? `<rect x="${photoLeft - 80}" y="0" width="${photoWidth + 80}" height="${H}" fill="url(#fade)"/>` : ''}

  <rect x="0" y="0" width="${W}" height="6" fill="${teamColor}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${teamColor}"/>

  <text x="60" y="52" fill="#ffffff" font-size="18" font-weight="800" font-family="${SVG_FONT_STACK}">WKND</text>
  <text x="60" y="68" fill="${teamColor}" font-size="9" font-weight="700" font-family="${SVG_FONT_STACK}">BASKETBALL</text>

  <text x="60" y="142" fill="${teamColor}" font-size="17" font-weight="700" font-family="${SVG_FONT_STACK}">${subline}</text>

  <text x="60" y="${firstNameY}" fill="#ffffff" font-size="${nameFontSize}" font-weight="800" font-family="${SVG_FONT_STACK}" clip-path="url(#textClip)">${firstName}</text>
  ${lastName ? `<text x="60" y="${lastNameY}" fill="#ffffff" font-size="${nameFontSize}" font-weight="800" font-family="${SVG_FONT_STACK}" clip-path="url(#textClip)">${lastName}</text>` : ''}

  <line x1="60" y1="402" x2="680" y2="402" stroke="#1e293b" stroke-width="2"/>

  <text x="60" y="458" fill="${teamColor}" font-size="46" font-weight="900" font-family="${SVG_FONT_STACK}">${gp}</text>
  <text x="60" y="484" fill="#475569" font-size="14" font-weight="600" font-family="${SVG_FONT_STACK}">GP</text>

  <text x="200" y="458" fill="#ffffff" font-size="46" font-weight="900" font-family="${SVG_FONT_STACK}">${escapeHtml(ptsAvg)}</text>
  <text x="200" y="484" fill="#475569" font-size="14" font-weight="600" font-family="${SVG_FONT_STACK}">PTS</text>

  <text x="340" y="458" fill="#ffffff" font-size="46" font-weight="900" font-family="${SVG_FONT_STACK}">${escapeHtml(rebAvg)}</text>
  <text x="340" y="484" fill="#475569" font-size="14" font-weight="600" font-family="${SVG_FONT_STACK}">REB</text>

  <text x="480" y="458" fill="#ffffff" font-size="46" font-weight="900" font-family="${SVG_FONT_STACK}">${escapeHtml(astAvg)}</text>
  <text x="480" y="484" fill="#475569" font-size="14" font-weight="600" font-family="${SVG_FONT_STACK}">AST</text>

  <text x="620" y="458" fill="#ffffff" font-size="46" font-weight="900" font-family="${SVG_FONT_STACK}">${escapeHtml(fgPct)}</text>
  <text x="620" y="484" fill="#475569" font-size="14" font-weight="600" font-family="${SVG_FONT_STACK}">FG%</text>

  <text x="60" y="516" fill="#334155" font-size="12" font-weight="600" font-family="${SVG_FONT_STACK}">SEASON AVERAGES PER GAME</text>

  ${!photoBuffer ? `
  <circle cx="980" cy="315" r="148" fill="#1e293b" stroke="${teamColor}" stroke-width="2" stroke-opacity="0.35"/>
  <text x="980" y="355" text-anchor="middle" fill="#334155" font-size="72" font-weight="800" font-family="${SVG_FONT_STACK}">${escapeHtml(getInitials(player?.name || ''))}</text>
  ` : ''}
</svg>`);

  const layers = [];
  if (photoBuffer) layers.push({ input: photoBuffer, left: photoLeft, top: 0 });
  layers.push({ input: overlaySvg, top: 0, left: 0 });
  if (logoBuffer) layers.push({ input: logoBuffer, left: 40, top: 28 });

  return sharp(bgSvg)
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function buildStandingsSocialCoverPng(state) {
  requireSharp();
  const W = 1200, H = 630;
  const teams = state.teams || [];
  const games = (state.games || []).filter(g =>
    g.teamAScore != null && g.teamBScore != null &&
    (Number(g.teamAScore) + Number(g.teamBScore)) > 0
  );

  const standings = teams.map(team => {
    const rec = {
      name: normalizeSocialCoverText(team.name || 'Team'),
      color: escapeHtml(String(team.color || '#f97316')),
      wins: 0, losses: 0, gamesPlayed: 0, pointsFor: 0, pointsAgainst: 0
    };
    games.forEach(g => {
      if (g.teamAId !== team.id && g.teamBId !== team.id) return;
      const tf = g.teamAId === team.id ? (Number(g.teamAScore) || 0) : (Number(g.teamBScore) || 0);
      const ta = g.teamAId === team.id ? (Number(g.teamBScore) || 0) : (Number(g.teamAScore) || 0);
      rec.gamesPlayed++;
      rec.pointsFor += tf;
      rec.pointsAgainst += ta;
      if (tf > ta) rec.wins++;
      else if (tf < ta) rec.losses++;
    });
    const q = rec.pointsAgainst > 0 ? rec.pointsFor / rec.pointsAgainst : (rec.pointsFor > 0 ? Infinity : 1);
    return { ...rec, quotient: q, pct: rec.gamesPlayed > 0 ? rec.wins / rec.gamesPlayed : 0 };
  }).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.quotient !== a.quotient) return b.quotient - a.quotient;
    return b.pointsFor - a.pointsFor;
  });

  const visible = standings.slice(0, 6);
  const N = visible.length;
  const topColor = visible[0]?.color || '#f97316';
  const secondColor = visible[1]?.color || topColor;
  const maxGP = standings.reduce((m, t) => Math.max(m, t.gamesPlayed), 0);

  const headerH = 100;
  const footerH = 42;
  const contentH = H - headerH - footerH;
  const rowH = N > 0 ? Math.min(94, Math.floor(contentH / N)) : 94;
  const totalH = rowH * N;
  const startY = headerH + Math.floor((contentH - totalH) / 2);

  const rowsSvg = visible.map((team, i) => {
    const rank = i + 1;
    const isLeader = rank === 1;
    const rowY = startY + i * rowH;
    const midY = rowY + Math.floor(rowH / 2);
    const { color, name, wins, losses, pct } = team;
    const barW = Math.round(pct * 340);

    return `
    ${isLeader ? `
    <rect x="40" y="${rowY}" width="1120" height="${rowH}" fill="${color}" fill-opacity="0.10"/>
    <rect x="40" y="${rowY}" width="1120" height="2" fill="${color}" fill-opacity="0.45"/>` : ''}
    <text x="68" y="${midY + 9}" text-anchor="middle" fill="${isLeader ? color : '#2d3a4a'}" font-size="${isLeader ? 28 : 20}" font-weight="900" font-family="${SVG_FONT_STACK}">${rank}</text>
    <rect x="108" y="${rowY + 14}" width="4" height="${rowH - 28}" rx="2" fill="${color}" opacity="${isLeader ? '1' : '0.6'}"/>
    <text x="126" y="${midY + 8}" fill="${isLeader ? '#ffffff' : '#94a3b8'}" font-size="${isLeader ? 22 : 18}" font-weight="${isLeader ? '800' : '600'}" font-family="${SVG_FONT_STACK}" clip-path="url(#nameClip)">${escapeHtml(name)}</text>
    <text x="638" y="${midY - 6}" text-anchor="middle" fill="#2d3a4a" font-size="10" font-weight="700" font-family="${SVG_FONT_STACK}">W</text>
    <text x="638" y="${midY + 14}" text-anchor="middle" fill="${isLeader ? '#ffffff' : '#e2e8f0'}" font-size="${isLeader ? 26 : 22}" font-weight="${isLeader ? '900' : '700'}" font-family="${SVG_FONT_STACK}">${wins}</text>
    <text x="718" y="${midY - 6}" text-anchor="middle" fill="#2d3a4a" font-size="10" font-weight="700" font-family="${SVG_FONT_STACK}">L</text>
    <text x="718" y="${midY + 14}" text-anchor="middle" fill="${isLeader ? '#64748b' : '#475569'}" font-size="${isLeader ? 26 : 22}" font-weight="600" font-family="${SVG_FONT_STACK}">${losses}</text>
    <rect x="800" y="${midY - 4}" width="340" height="8" rx="4" fill="#0c1624"/>
    ${barW > 0 ? `<rect x="800" y="${midY - 4}" width="${barW}" height="8" rx="4" fill="${color}" opacity="${isLeader ? '1' : '0.55'}"/>` : ''}
    ${i < N - 1 ? `<line x1="40" y1="${rowY + rowH}" x2="1160" y2="${rowY + rowH}" stroke="#0c1624" stroke-width="1"/>` : ''}`;
  }).join('');

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="hg" cx="50%" cy="0%" r="70%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${topColor}" stop-opacity="0.13"/>
      <stop offset="100%" stop-color="${topColor}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hdr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d1526"/>
      <stop offset="100%" stop-color="#020817"/>
    </linearGradient>
    <clipPath id="nameClip"><rect x="126" y="0" width="470" height="${H}"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="#020817"/>
  <rect width="${W}" height="${H}" fill="url(#hg)"/>

  <rect x="0" y="0" width="600" height="6" fill="${topColor}"/>
  <rect x="600" y="0" width="600" height="6" fill="${secondColor}"/>
  <rect x="0" y="6" width="5" height="${H - 12}" fill="${topColor}" opacity="0.65"/>
  <rect x="${W - 5}" y="6" width="5" height="${H - 12}" fill="${secondColor}" opacity="0.65"/>
  <rect x="0" y="${H - 6}" width="600" height="6" fill="${topColor}" opacity="0.5"/>
  <rect x="600" y="${H - 6}" width="600" height="6" fill="${secondColor}" opacity="0.5"/>

  <rect x="0" y="0" width="${W}" height="${headerH}" fill="url(#hdr)"/>

  <text x="52" y="50" fill="#ffffff" font-size="16" font-weight="800" font-family="${SVG_FONT_STACK}">WKND</text>
  <text x="52" y="65" fill="${topColor}" font-size="8" font-weight="700" font-family="${SVG_FONT_STACK}">BASKETBALL</text>

  <text x="600" y="50" text-anchor="middle" fill="#ffffff" font-size="28" font-weight="800" font-family="${SVG_FONT_STACK}">SEASON STANDINGS</text>
  ${maxGP > 0 ? `<text x="600" y="71" text-anchor="middle" fill="#334155" font-size="12" font-weight="600" font-family="${SVG_FONT_STACK}">THROUGH ${maxGP} GAME${maxGP !== 1 ? 'S' : ''}</text>` : ''}

  <text x="970" y="56" text-anchor="middle" fill="#2d3a4a" font-size="10" font-weight="700" font-family="${SVG_FONT_STACK}">WIN %</text>
  <rect x="800" y="63" width="340" height="3" rx="1.5" fill="#0c1624"/>
  <rect x="800" y="63" width="340" height="3" rx="1.5" fill="${topColor}" opacity="0.2"/>

  <line x1="40" y1="${headerH}" x2="1160" y2="${headerH}" stroke="#0c1624" stroke-width="1"/>

  ${rowsSvg}

  <text x="${W / 2}" y="${H - 14}" fill="#1e293b" text-anchor="middle" font-size="11" font-weight="600" font-family="${SVG_FONT_STACK}">WKNDBASKETBALL.COM</text>
</svg>`);

  return sharp(svg).png({ compressionLevel: 9 }).toBuffer();
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

let _stateCache = null;
let _stateCacheTs = 0;
const STATE_CACHE_TTL_MS = 1500;
function invalidateStateCache() { _stateCache = null; }

function readState() {
  const now = Date.now();
  if (_stateCache && now - _stateCacheTs < STATE_CACHE_TTL_MS) return _stateCache;
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
      height: player.height || '',
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
    underReview: toInt(game.under_review) === 1,
    youtubeUrl: game.youtube_url || '',
    gameWriteup: game.game_writeup || '',
    potgWriteup: game.potg_writeup || '',
    manualPotgPlayerId: game.manual_potg_player_id || '',
    socialCoverLen: toInt(game.social_cover_data_len)
  }));

  _stateCache = { teams: hydratedTeams, games: hydratedGames };
  _stateCacheTs = Date.now();
  return _stateCache;
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
        height: player.height || '',
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
      under_review: game?.underReview ? 1 : 0,
      youtube_url: typeof game.youtubeUrl === 'string' ? game.youtubeUrl : '',
      game_writeup: typeof game.gameWriteup === 'string' ? game.gameWriteup : '',
      potg_writeup: typeof game.potgWriteup === 'string' ? game.potgWriteup : '',
      manual_potg_player_id: typeof game.manualPotgPlayerId === 'string' ? game.manualPotgPlayerId : '',
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

function rebuildPlayerTotalsFromGameStats() {
  clearPlayerTotalsStmt.run();
  const totalsRows = selectPlayerTotalsAggregateStmt.all();
  totalsRows.forEach((row) => {
    upsertPlayerTotalsStmt.run({
      player_id: row.player_id,
      games_played: toInt(row.games_played),
      pts: toInt(row.pts),
      ast: toInt(row.ast),
      reb: toInt(row.reb),
      stl: toInt(row.stl),
      blk: toInt(row.blk),
      turnover: toInt(row.turnover),
      pf: toInt(row.pf),
      fg2m: toInt(row.fg2m),
      fg3m: toInt(row.fg3m),
      fg2m_miss: toInt(row.fg2m_miss),
      fg3m_miss: toInt(row.fg3m_miss),
      ftm: toInt(row.ftm),
      ft_miss: toInt(row.ft_miss)
    });
  });
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
  invalidateStateCache();
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

function broadcastSessionCleared(sessionInstanceId = '', sourceClientId = null, clearedAt = Date.now()) {
  if (!wss) return;
  const payload = JSON.stringify({
    type: 'session_cleared',
    sourceClientId,
    sessionInstanceId: String(sessionInstanceId || '').trim(),
    clearedAt: toInt(clearedAt)
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

  const activeSession = readActiveSession();
  const activeSessionId = String(activeSession?.liveSessionInstanceId || activeSession?.sessionInstanceId || '').trim();
  const eventSessionId = String(event?.sessionInstanceId || activeSessionId || '').trim();
  if (!activeSessionId || !eventSessionId || eventSessionId !== activeSessionId) {
    return null;
  }

  const activeSessionStatusRow = selectMatchSessionByIdStmt.get(activeSessionId);
  const activeSessionStatus = String(activeSessionStatusRow?.status || '').trim().toLowerCase();
  if (activeSessionStatus === 'ended' || activeSessionStatus === 'discarded') {
    return null;
  }

  if (!event?.sessionInstanceId) {
    event = { ...event, sessionInstanceId: activeSessionId };
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

    // Sync fallback: persist accepted live events into active session so clients
    // that miss live_event transport can still converge via sync/session polling.
    const currentSession = readActiveSession();
    const currentSessionId = String(currentSession?.liveSessionInstanceId || currentSession?.sessionInstanceId || '').trim();
    const recordSessionId = String(record?.event?.sessionInstanceId || '').trim();
    if (
      currentSession
      && currentSessionId
      && recordSessionId
      && currentSessionId === recordSessionId
    ) {
      const existingGameLog = Array.isArray(currentSession.gameLog) ? currentSession.gameLog : [];
      const hasGameLogEvent = existingGameLog.some((item) => item?.id === record.event.id);
      const nextGameLog = hasGameLogEvent
        ? existingGameLog
        : [record.event, ...existingGameLog].slice(0, 5000);

      const existingLoggedHistory = Array.isArray(currentSession.loggedHistory) ? currentSession.loggedHistory : [];
      const shouldAddHistory = record.event.kind === 'stat' && !record.event.isUndoCompensation;
      const hasHistoryEvent = existingLoggedHistory.some((item) => item?.id === record.event.id);
      const nextLoggedHistory = (shouldAddHistory && !hasHistoryEvent)
        ? [record.event, ...existingLoggedHistory].slice(0, 5000)
        : existingLoggedHistory;

      const nextSessionRevision = Math.max(toInt(currentSession.sessionRevision), 0) + 1;
      const nextSession = {
        ...currentSession,
        gameLog: nextGameLog,
        loggedHistory: nextLoggedHistory,
        sessionUpdatedAt: Date.now(),
        sessionRevision: nextSessionRevision
      };

      upsertActiveSessionStmt.run({
        session_json: JSON.stringify(nextSession)
      });
      upsertMatchSessionRunningStmt.run({
        session_id: currentSessionId,
        created_at: toInt(nextSession.sessionCreatedAt) || Date.now(),
        updated_at: Date.now()
      });
      broadcastSync({ sourceClientId });
    }
  }

  return record;
}

function writeActiveSession(session, sourceClientId = null) {
  const existingSession = readActiveSession();
  const existingSessionInstanceId = String(existingSession?.liveSessionInstanceId || existingSession?.sessionInstanceId || '').trim();
  const incomingSessionUpdatedAt = toInt(session?.sessionUpdatedAt);
  const existingSessionUpdatedAt = toInt(existingSession?.sessionUpdatedAt);
  const incomingSessionRevision = toInt(session?.sessionRevision);
  const existingSessionRevision = toInt(existingSession?.sessionRevision);
  const incomingSessionInstanceId = String(session?.liveSessionInstanceId || session?.sessionInstanceId || '').trim();
  const incomingSessionCreatedAt = toInt(session?.sessionCreatedAt);
  const isSameSessionInstance = Boolean(
    existingSessionInstanceId
    && incomingSessionInstanceId
    && existingSessionInstanceId === incomingSessionInstanceId
  );

  if (!incomingSessionInstanceId) {
    return false;
  }

  const incomingSessionStatusRow = selectMatchSessionByIdStmt.get(incomingSessionInstanceId);
  const incomingSessionStatus = String(incomingSessionStatusRow?.status || '').trim().toLowerCase();
  if (incomingSessionStatus === 'ended' || incomingSessionStatus === 'discarded') {
    return false;
  }

  if (isSameSessionInstance && incomingSessionRevision > 0 && incomingSessionRevision < existingSessionRevision) {
    return false;
  }

  // Equal-revision writes are common during multi-client contention. Accept them only
  // when they carry a strictly newer sessionUpdatedAt; otherwise they can re-apply a
  // stale clock/snapshot and roll back a just-started period.
  if (
    isSameSessionInstance
    && incomingSessionRevision > 0
    && existingSessionRevision > 0
    && incomingSessionRevision === existingSessionRevision
  ) {
    if (incomingSessionUpdatedAt <= 0 || (existingSessionUpdatedAt > 0 && incomingSessionUpdatedAt <= existingSessionUpdatedAt)) {
      return false;
    }
  }

  if (
    incomingSessionInstanceId &&
    lastDiscardedSessionInstanceId &&
    incomingSessionInstanceId === lastDiscardedSessionInstanceId &&
    (incomingSessionCreatedAt <= 0 || incomingSessionCreatedAt <= toInt(lastDiscardedSessionClearedAt))
  ) {
    return false;
  }

  // Keep compatibility with clients that may omit sessionUpdatedAt.
  // If missing, synthesize a monotonic timestamp for merge persistence.
  if (incomingSessionUpdatedAt <= 0) {
    session = { ...session, sessionUpdatedAt: Date.now() };
  }

  lastActiveSessionSourceId = sourceClientId;
  const mergedSession = mergeActiveSession(existingSession, session || {});
  const nextSessionRevision = isSameSessionInstance
    ? Math.max(existingSessionRevision, incomingSessionRevision, existingSessionRevision + 1)
    : Math.max(incomingSessionRevision, 1);
  mergedSession.sessionRevision = nextSessionRevision;
  if (toInt(mergedSession.sessionCreatedAt) <= 0) {
    mergedSession.sessionCreatedAt = incomingSessionCreatedAt > 0 ? incomingSessionCreatedAt : Date.now();
  }
  upsertMatchSessionRunningStmt.run({
    session_id: incomingSessionInstanceId,
    created_at: toInt(mergedSession.sessionCreatedAt),
    updated_at: Date.now()
  });
  upsertActiveSessionStmt.run({
    session_json: JSON.stringify(mergedSession)
  });
  broadcastSync({ sourceClientId });
  return true;
}

function clearActiveSession(sourceClientId = null, options = {}) {
  lastActiveSessionSourceId = sourceClientId;
  const existingSession = readActiveSession();
  const existingSessionInstanceId = String(existingSession?.liveSessionInstanceId || existingSession?.sessionInstanceId || '').trim();
  const discardedSessionInstanceId = String(options?.discardedSessionInstanceId || existingSessionInstanceId || '').trim();
  const terminationStatus = normalizeTerminationStatus(options?.terminationStatus);
  const terminatedSessionInstanceId = String(existingSessionInstanceId || discardedSessionInstanceId || '').trim();
  const terminatedSessionCreatedAt = toInt(options?.discardedSessionCreatedAt)
    || toInt(existingSession?.sessionCreatedAt)
    || 0;
  if (terminatedSessionInstanceId) {
    markMatchSessionStatus(terminatedSessionInstanceId, terminationStatus, terminatedSessionCreatedAt);
  }
  if (discardedSessionInstanceId) {
    lastDiscardedSessionInstanceId = discardedSessionInstanceId;
    lastDiscardedSessionClearedAt = Date.now();
  }
  lastActiveSessionClearedAt = Date.now();
  persistLiveSessionGuards();
  deleteActiveSessionStmt.run();
  broadcastSessionCleared(terminatedSessionInstanceId, sourceClientId, lastActiveSessionClearedAt);
  // NOTE: live_events cleanup is controlled by callers (e.g. DELETE /api/active-session)
  // so they can choose whether to preserve or clear replay history.
  broadcastSync({ sourceClientId });
}

function clearLiveEvents(sourceClientId = null) {
  lastActiveSessionSourceId = sourceClientId;
  deleteLiveEventsStmt.run();
}

function shouldApplyActiveSessionDelete(options = {}) {
  const existingSession = readActiveSession();
  if (!existingSession) return true;

  const existingSessionId = String(existingSession?.liveSessionInstanceId || existingSession?.sessionInstanceId || '').trim();
  const existingSessionCreatedAt = toInt(existingSession?.sessionCreatedAt);
  const requestedSessionId = String(options?.discardedSessionInstanceId || '').trim();
  const requestedSessionCreatedAt = toInt(options?.discardedSessionCreatedAt);

  if (!existingSessionId || existingSessionCreatedAt <= 0) {
    return true;
  }

  // If a client explicitly targets an older/different session, ignore the clear.
  if (requestedSessionId && requestedSessionId !== existingSessionId) {
    if (requestedSessionCreatedAt > 0 && requestedSessionCreatedAt < existingSessionCreatedAt) {
      return false;
    }
  }

  // If timestamps indicate the request is for an older session generation, ignore it.
  if (requestedSessionCreatedAt > 0 && requestedSessionCreatedAt < existingSessionCreatedAt) {
    return false;
  }

  return true;
}

function persistLiveSessionGuards() {
  const payload = {
    lastActiveSessionClearedAt: toInt(lastActiveSessionClearedAt),
    lastDiscardedSessionInstanceId: String(lastDiscardedSessionInstanceId || '').trim(),
    lastDiscardedSessionClearedAt: toInt(lastDiscardedSessionClearedAt)
  };
  upsertConfigValueStmt.run(LIVE_SESSION_GUARDS_KEY, JSON.stringify(payload));
}

function hydrateLiveSessionGuards() {
  const raw = parseJsonSafe((selectLegacyConfigStmt.get(LIVE_SESSION_GUARDS_KEY) || {}).value_json, null);
  if (!raw || typeof raw !== 'object') return;
  lastActiveSessionClearedAt = Math.max(
    toInt(lastActiveSessionClearedAt),
    toInt(raw.lastActiveSessionClearedAt)
  );
  const persistedDiscardedSessionId = String(raw.lastDiscardedSessionInstanceId || '').trim();
  if (persistedDiscardedSessionId) {
    lastDiscardedSessionInstanceId = persistedDiscardedSessionId;
  }
  lastDiscardedSessionClearedAt = Math.max(
    toInt(lastDiscardedSessionClearedAt),
    toInt(raw.lastDiscardedSessionClearedAt)
  );
}

function readPublicAwardsPageEnabled() {
  const raw = parseJsonSafe((selectLegacyConfigStmt.get(PUBLIC_AWARDS_PAGE_KEY) || {}).value_json, null);
  if (typeof raw === 'boolean') return raw;
  if (raw && typeof raw === 'object' && typeof raw.enabled === 'boolean') return raw.enabled;
  return false;
}

function clearOrphanedLiveEvents() {
  const hasActiveSession = Boolean(readActiveSession());
  if (!hasActiveSession) {
    clearLiveEvents(null);
  }
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
hydrateLiveSessionGuards();
clearOrphanedLiveEvents();

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

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

app.use((error, _req, res, next) => {
  if (error?.type === 'entity.too.large' || error?.status === 413) {
    res.status(413).json({
      error: 'Request body too large.',
      limit: REQUEST_BODY_LIMIT
    });
    return;
  }
  next(error);
});

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
    const isStandingsView = pathParts[0] === 'standings' && pathParts.length === 1;
    const isPlayerView = pathParts[0] === 'teams' && pathParts[1] === 'player' && pathParts[2] && pathParts[3];
    const playerViewTeamId = isPlayerView ? decodeURIComponent(String(pathParts[2] || '').trim()) : '';
    const playerViewPlayerId = isPlayerView ? decodeURIComponent(String(pathParts[3] || '').trim()) : '';

    const state = readState();
    const game = isGameView ? ((state.games || []).find((item) => item.id === gameId) || null) : null;
    const teams = state.teams || [];

    let playerViewPlayer = null;
    let playerViewTeam = null;
    if (isPlayerView && playerViewPlayerId) {
      for (const team of teams) {
        const match = (team.players || []).find((p) => p.id === playerViewPlayerId);
        if (match) {
          playerViewPlayer = match;
          playerViewTeam = team;
          break;
        }
      }
    }

    const indexPath = path.join(__dirname, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    let metaTags = '';
    let gaHeadSnippet = '';

    try {
      if (isStandingsView) {
        metaTags = buildStandingsSocialMetaTags({ req, state });
      } else if (isPlayerView && playerViewPlayer) {
        metaTags = buildPlayerSocialMetaTags({ req, player: playerViewPlayer, team: playerViewTeam });
      } else {
        metaTags = buildSocialMetaTags({ req, game, teams });
      }
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
  '/awards',
  '/history',
  '/history/game/:gameId',
  '/teams/player/:teamId/:playerId'
], (req, res) => {
  renderInjectedIndex(req, res);
});

app.use(express.static(__dirname, { index: false }));

app.get('/api/state', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json(readState());
});

app.get('/api/bootstrap', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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
    gaMeasurementId: gaEnabled ? GA_MEASUREMENT_ID : '',
    publicAwardsPageEnabled: readPublicAwardsPageEnabled()
  });
});

app.put('/api/client-config', (req, res) => {
  const role = String(req.body?.role || '').trim();
  if (role !== 'admin') {
    res.status(403).json({ error: 'Only admin can update client config.' });
    return;
  }

  const publicAwardsPageEnabled = Boolean(req.body?.publicAwardsPageEnabled);
  upsertConfigValueStmt.run(PUBLIC_AWARDS_PAGE_KEY, JSON.stringify({ enabled: publicAwardsPageEnabled }));
  res.json({ ok: true, publicAwardsPageEnabled });
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

app.get('/api/social-cover/standings.png', async (req, res) => {
  try {
    if (!sharp) {
      res.status(501).json({ error: 'Social cover generation is disabled in this build because sharp is not installed.' });
      return;
    }
    const state = readState();
    const png = await buildStandingsSocialCoverPng(state);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(png);
  } catch (err) {
    console.error('Standings cover error:', err);
    res.status(500).json({ error: 'Failed to build standings cover.' });
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
    const coverRow = selectGameCoverByIdStmt.get(gameId);
    const customDataUrl = String(coverRow?.social_cover_data_url || '').trim();
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

app.get('/api/social-cover/player/:playerId.png', async (req, res) => {
  try {
    if (!sharp) {
      res.status(501).json({ error: 'Social cover generation is disabled in this build because sharp is not installed.' });
      return;
    }
    const playerId = String(req.params.playerId || '').trim();
    if (!playerId) {
      res.status(400).json({ error: 'Missing playerId.' });
      return;
    }
    const baseOrigin = `${req.protocol}://${req.get('host')}`;
    const state = readState();
    const teams = state.teams || [];
    let foundPlayer = null;
    let foundTeam = null;
    for (const team of teams) {
      const match = (team.players || []).find((p) => p.id === playerId);
      if (match) {
        foundPlayer = match;
        foundTeam = team;
        break;
      }
    }
    if (!foundPlayer) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }
    const png = await buildPlayerSocialCoverPng(foundPlayer, foundTeam, baseOrigin);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(png);
  } catch {
    res.status(500).json({ error: 'Failed to build player social cover.' });
  }
});

app.post('/api/generate-writeup', async (req, res) => {
  if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
    res.status(400).json({ error: 'Neither Gemini nor OpenAI API key is configured on the server.' });
    return;
  }

  const { game, playerOfTheGame, originalPlayerOfTheGame, potgSelectionMode, bestPerformers, standoutPerformersByTeam, playByPlay, finalMoments, leadSwingSummary, lineupPatternSummary } = req.body || {};
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

  // If manual POTG override, ensure original best player appears at the top of outstanding performers
  if (potgSelectionMode === 'manual' && originalPlayerOfTheGame) {
    const originalTeamName = originalPlayerOfTheGame.teamName || '';
    const formattedOriginal = formatPerformerLine(originalPlayerOfTheGame);
    const isInTeamA = originalTeamName === (game.teamAName || '');
    const targetList = isInTeamA ? teamAStandoutLines : teamBStandoutLines;
    
    // Check if original player already mentioned in their team's standout list
    const alreadyMentioned = targetList.some(line => 
      (originalPlayerOfTheGame.number && line.includes(`#${originalPlayerOfTheGame.number}`)) ||
      (originalPlayerOfTheGame.name && line.includes(originalPlayerOfTheGame.name))
    );
    
    // Add original player at the TOP of list if not already mentioned
    if (!alreadyMentioned) {
      if (isInTeamA) {
        teamAStandoutLines.unshift(formattedOriginal);
      } else {
        teamBStandoutLines.unshift(formattedOriginal);
      }
    }
  }

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

// Upsert a single game record without touching teams or rewriting other games.
// Used by the client's import-game-log flow so large payloads (all teams + all games)
// are never needed just to persist one game.
app.put('/api/games/:gameId', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  if (!gameId) {
    res.status(400).json({ error: 'gameId is required' });
    return;
  }

  const game = req.body?.game;
  if (!game || typeof game !== 'object') {
    res.status(400).json({ error: 'Body must include game object' });
    return;
  }

  if (String(game.id || '') !== gameId) {
    res.status(400).json({ error: 'game.id must match URL :gameId' });
    return;
  }

  const teamAScoreValue = toInt(game.teamAScore);
  const teamBScoreValue = toInt(game.teamBScore);
  const winnerTeamId = teamAScoreValue === teamBScoreValue
    ? ''
    : (teamAScoreValue > teamBScoreValue ? String(game.teamAId || '') : String(game.teamBId || ''));
  const manualPotgPlayerId = String(game.manualPotgPlayerId || '').trim();
  if (manualPotgPlayerId && winnerTeamId) {
    const playerTeamRow = selectPlayerTeamIdStmt.get(manualPotgPlayerId);
    if (String(playerTeamRow?.team_id || '') && String(playerTeamRow.team_id) !== winnerTeamId) {
      res.status(400).json({ error: 'Manual POTG must come from the winning team.' });
      return;
    }
  }

  try {
    const existingCoverRow = selectGameCoverByIdStmt.get(gameId);
    const existingCoverUrl = String(existingCoverRow?.social_cover_data_url || '');
    const upsertGameTransaction = db.transaction(() => {
      // Remove this game's player stats and re-insert (safe upsert pattern).
      db.prepare('DELETE FROM game_player_stats WHERE game_id = ?').run(gameId);
      db.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      insertGameStmt.run({
        id: game.id,
        date: game.date || new Date().toISOString(),
        team_a_id: game.teamAId || '',
        team_b_id: game.teamBId || '',
        team_a_name: game.teamAName || '',
        team_b_name: game.teamBName || '',
        team_a_score: toInt(game.teamAScore),
        team_b_score: toInt(game.teamBScore),
        game_log_json: JSON.stringify(Array.isArray(game.gameLog) ? game.gameLog : []),
        period_snapshots_json: JSON.stringify(Array.isArray(game.periodSnapshots) ? game.periodSnapshots : []),
        dnp_players_json: JSON.stringify(Array.isArray(game.dnpPlayers) ? game.dnpPlayers : []),
        under_review: game.underReview ? 1 : 0,
        youtube_url: typeof game.youtubeUrl === 'string' ? game.youtubeUrl : '',
        game_writeup: typeof game.gameWriteup === 'string' ? game.gameWriteup : '',
        potg_writeup: typeof game.potgWriteup === 'string' ? game.potgWriteup : '',
        manual_potg_player_id: typeof game.manualPotgPlayerId === 'string' ? game.manualPotgPlayerId : '',
        social_cover_data_url: typeof game.socialCoverDataUrl === 'string' ? game.socialCoverDataUrl : existingCoverUrl,
        sort_order: 0
      });

      const playerStats = game.playerStats || {};
      Object.entries(playerStats).forEach(([playerId, stats]) => {
        if (!playerId) return;
        const playerTeamRow = selectPlayerTeamIdStmt.get(playerId);
        const fallbackTeamId = String(playerId).startsWith('b') ? (game.teamBId || '') : (game.teamAId || '');
        insertGamePlayerStatStmt.run({
          game_id: gameId,
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

    upsertGameTransaction();
    broadcastSync();
    res.json({ ok: true, game });
  } catch (error) {
    console.error('PUT /api/games/:gameId error:', error);
    res.status(500).json({ error: 'Failed to persist game.' });
  }
});

app.put('/api/state', async (req, res) => {
  const { teams, games } = req.body || {};
  if (!Array.isArray(teams) || !Array.isArray(games)) {
    res.status(400).json({ error: 'Body must include teams[] and games[]' });
    return;
  }

  try {
    const existingCovers = selectAllGameCoversStmt.all();
    const existingCoverByGameId = new Map(
      existingCovers.map((row) => [String(row.id || ''), String(row.social_cover_data_url || '')])
    );
    const gamesWithPreservedCovers = games.map((game) => {
      if (!game || typeof game !== 'object') return game;
      if (typeof game.socialCoverDataUrl === 'string') return game;
      const existingCover = existingCoverByGameId.get(String(game.id || ''));
      if (!existingCover) return game;
      return {
        ...game,
        socialCoverDataUrl: existingCover
      };
    });

    const teamsWithCachedImages = await persistPlayerImagesForTeams(teams);
    writeState(teamsWithCachedImages, gamesWithPreservedCovers);
    res.json({ ok: true, teams: teamsWithCachedImages, games: gamesWithPreservedCovers });
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
    // Persist teams independently. Rewriting all games here can fail player saves
    // due to unrelated historical game-data issues.
    writeTeamsTransaction(teamsWithCachedImages);
    broadcastSync();
    res.json({ ok: true, teams: teamsWithCachedImages });
  } catch (error) {
    console.error('PUT /api/teams error:', error);
    res.status(500).json({ error: 'Failed to persist teams.' });
  }
});

app.put('/api/players/:playerId/profile', async (req, res) => {
  const playerId = String(req.params.playerId || '').trim();
  const { teamId, player } = req.body || {};
  const normalizedTeamId = String(teamId || '').trim();
  if (!playerId || !normalizedTeamId) {
    res.status(400).json({ error: 'playerId and teamId are required.' });
    return;
  }

  try {
    const existing = selectPlayerByIdAndTeamStmt.get(playerId, normalizedTeamId);
    if (!existing) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }

    const incoming = (player && typeof player === 'object') ? player : {};
    const nextName = typeof incoming.name === 'string' ? incoming.name.trim() : String(existing.name || '').trim();
    const nextNumber = typeof incoming.number === 'string' ? incoming.number.trim() : String(existing.number || '').trim();
    if (!nextName || !nextNumber) {
      res.status(400).json({ error: 'Player name and number are required.' });
      return;
    }

    const nextPositions = normalizePlayerPositionsForStorage(
      Object.prototype.hasOwnProperty.call(incoming, 'positions') ? incoming.positions : undefined,
      parseJsonSafe(existing.positions, [])
    );
    const rawPictureUrl = typeof incoming.pictureUrl === 'string'
      ? incoming.pictureUrl.trim()
      : String(existing.picture_url || '').trim();
    const cachedPictureUrl = rawPictureUrl
      ? await cacheRemotePlayerImage(rawPictureUrl, playerId)
      : '';

    const nextHeight = typeof incoming.height === 'string' ? incoming.height.trim() : String(existing.height || '').trim();
    const nextBirthday = typeof incoming.birthday === 'string' ? incoming.birthday.trim() : String(existing.birthday || '').trim();
    const nextEmail = typeof incoming.email === 'string' ? incoming.email.trim() : String(existing.email || '').trim();
    const nextSocial = typeof incoming.social === 'string' ? incoming.social.trim() : String(existing.social || '').trim();
    const nextContact = typeof incoming.contact === 'string' ? incoming.contact.trim() : String(existing.contact || '').trim();
    const nextWriteup = typeof incoming.writeup === 'string' ? incoming.writeup.trim() : String(existing.writeup || '').trim();

    const updateResult = updatePlayerProfileStmt.run({
      id: playerId,
      team_id: normalizedTeamId,
      name: nextName,
      number: nextNumber,
      positions: JSON.stringify(nextPositions),
      height: nextHeight,
      picture_url: cachedPictureUrl,
      birthday: nextBirthday,
      email: nextEmail,
      social: nextSocial,
      contact: nextContact,
      writeup: nextWriteup
    });

    if (!updateResult?.changes) {
      res.status(500).json({ error: 'No player row was updated.' });
      return;
    }

    broadcastSync();
    res.json({
      ok: true,
      player: {
        id: playerId,
        teamId: normalizedTeamId,
        name: nextName,
        number: nextNumber,
        positions: nextPositions,
        height: nextHeight,
        pictureUrl: cachedPictureUrl,
        birthday: nextBirthday,
        email: nextEmail,
        social: nextSocial,
        contact: nextContact,
        writeup: nextWriteup
      }
    });
  } catch (error) {
    console.error('PUT /api/players/:playerId/profile error:', error);
    res.status(500).json({ error: 'Failed to persist player profile.' });
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

app.delete('/api/games/:gameId', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  if (!gameId) {
    res.status(400).json({ error: 'gameId is required.' });
    return;
  }

  const state = readState();
  const targetGame = (state.games || []).find((game) => String(game?.id || '').trim() === gameId);
  if (!targetGame) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  const deleteGameTransaction = db.transaction((targetGameId) => {
    deleteGamePlayerStatsByGameStmt.run(targetGameId);
    deleteGameByIdStmt.run(targetGameId);
    rebuildPlayerTotalsFromGameStats();
  });

  try {
    deleteGameTransaction(gameId);
    broadcastSync();
    res.json({ ok: true, gameId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete game.' });
  }
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

  const existing = selectGameCoverByIdStmt.get(gameId);
  if (!existing) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  updateGameCoverStmt.run(imageDataUrl, gameId);
  invalidateStateCache();
  broadcastSync();
  res.json({ ok: true });
});

app.delete('/api/games/:gameId/social-cover', (req, res) => {
  const gameId = String(req.params.gameId || '').trim();
  if (!gameId) {
    res.status(400).json({ error: 'gameId is required.' });
    return;
  }

  const existing = selectGameCoverByIdStmt.get(gameId);
  if (!existing) {
    res.status(404).json({ error: 'Game not found.' });
    return;
  }

  updateGameCoverStmt.run('', gameId);
  invalidateStateCache();
  broadcastSync();
  res.json({ ok: true });
});

app.get('/api/active-session', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ session: readActiveSession() });
});

app.get('/api/live-events', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
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
    if (!record) {
      console.log('[live-events] ignored', {
        eventId: String(event?.id || ''),
        eventSessionId: String(event?.sessionInstanceId || ''),
        activeSessionId: String(readActiveSession()?.liveSessionInstanceId || readActiveSession()?.sessionInstanceId || ''),
        sourceClientId: sourceClientId || null
      });
      res.json({ ok: true, ignored: true });
      return;
    }
    console.log('[live-events] accepted', {
      seq: record.seq,
      eventId: record.eventId,
      eventSessionId: String(record?.event?.sessionInstanceId || ''),
      sourceClientId: sourceClientId || null
    });
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
  console.log('[active-session] put', {
    applied,
    incomingSessionId: String(session?.liveSessionInstanceId || session?.sessionInstanceId || ''),
    incomingRevision: toInt(session?.sessionRevision),
    incomingCreatedAt: toInt(session?.sessionCreatedAt),
    activeSessionId: String(readActiveSession()?.liveSessionInstanceId || readActiveSession()?.sessionInstanceId || ''),
    lastDiscardedSessionInstanceId,
    lastDiscardedSessionClearedAt: toInt(lastDiscardedSessionClearedAt),
    sourceClientId: sourceClientId || null
  });
  res.json({ ok: true, applied });
});

app.delete('/api/active-session', (req, res) => {
  const {
    sourceClientId,
    clearLiveEvents: shouldClearLiveEvents,
    discardedSessionInstanceId,
    discardedSessionCreatedAt,
    terminationStatus
  } = req.body || {};
  const applied = shouldApplyActiveSessionDelete({
    discardedSessionInstanceId,
    discardedSessionCreatedAt
  });
  if (!applied) {
    res.json({ ok: true, applied: false });
    return;
  }
  const clearLiveEventsOnDelete = shouldClearLiveEvents !== false;
  clearActiveSession(sourceClientId || null, {
    discardedSessionInstanceId,
    discardedSessionCreatedAt,
    terminationStatus
  });
  if (clearLiveEventsOnDelete) {
    clearLiveEvents(sourceClientId || null);
  }
  res.json({ ok: true, applied: true });
});

wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'sync', ...buildSyncPayload() }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`WKND Stats server running at http://localhost:${PORT}`);
});
