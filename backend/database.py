import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "english_teacher.db"

DDL = """
CREATE TABLE IF NOT EXISTS sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at    TEXT    NOT NULL,
    ended_at      TEXT,
    lesson_id     TEXT    NOT NULL,
    lesson_title  TEXT    NOT NULL,
    unit_id       TEXT    NOT NULL,
    unit_title    TEXT    NOT NULL,
    level         TEXT    NOT NULL,
    duration_secs INTEGER,
    mode          TEXT    NOT NULL,
    notes         TEXT
);

CREATE TABLE IF NOT EXISTS session_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES sessions(id),
    item_id         TEXT    NOT NULL,
    item_type       TEXT    NOT NULL,
    phase           TEXT,
    prompt          TEXT,
    expected_answer TEXT,
    student_answer  TEXT,
    correct         INTEGER NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 1,
    response_secs   INTEGER
);

CREATE TABLE IF NOT EXISTS weak_words (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    word          TEXT    NOT NULL UNIQUE,
    translation   TEXT,
    phonetic      TEXT,
    wrong_count   INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    last_seen     TEXT,
    lesson_id     TEXT,
    unit_id       TEXT
);

CREATE TABLE IF NOT EXISTS lessons_status (
    lesson_id       TEXT PRIMARY KEY,
    unit_id         TEXT NOT NULL,
    level           TEXT NOT NULL,
    first_seen      TEXT,
    last_practiced  TEXT,
    times_practiced INTEGER NOT NULL DEFAULT 0,
    best_score      REAL,
    status          TEXT NOT NULL DEFAULT 'not_started'
);

CREATE TABLE IF NOT EXISTS homework_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id    TEXT    NOT NULL,
    assigned_at  TEXT    NOT NULL,
    completed_at TEXT,
    notes        TEXT
);
"""


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(DDL)
