from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from database import get_conn, init_db
from models import (
    SessionStart, SessionEnd, SessionItem,
    LessonStatusPatch, HomeworkCreate,
)

app = FastAPI(title="SweetEnglish Teacher API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_dict(row) -> dict:
    return dict(row) if row else {}


# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()
    print("Teacher backend running at http://localhost:8000")
    print("API docs at http://localhost:8000/docs")


# ── Sessions ───────────────────────────────────────────────────────────────────

@app.post("/sessions/start")
def start_session(body: SessionStart):
    with get_conn() as conn:
        cur = conn.execute(
            """INSERT INTO sessions
               (started_at, lesson_id, lesson_title, unit_id, unit_title, level, mode)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (now_iso(), body.lesson_id, body.lesson_title,
             body.unit_id, body.unit_title, body.level, body.mode),
        )
        session_id = cur.lastrowid

        # upsert lessons_status
        conn.execute(
            """INSERT INTO lessons_status (lesson_id, unit_id, level, first_seen, last_practiced,
               times_practiced, status)
               VALUES (?, ?, ?, ?, ?, 1, 'in_progress')
               ON CONFLICT(lesson_id) DO UPDATE SET
                 last_practiced  = excluded.last_practiced,
                 times_practiced = times_practiced + 1,
                 status = CASE WHEN status = 'not_started' THEN 'in_progress' ELSE status END""",
            (body.lesson_id, body.unit_id, body.level, now_iso(), now_iso()),
        )

    return {"session_id": session_id}


@app.post("/sessions/{session_id}/end")
def end_session(session_id: int, body: SessionEnd):
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE sessions SET ended_at=?, duration_secs=?, notes=? WHERE id=?",
            (now_iso(), body.duration_secs, body.notes, session_id),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "Session not found")
    return {"ok": True}


@app.post("/sessions/{session_id}/items")
def add_item(session_id: int, body: SessionItem):
    with get_conn() as conn:
        row = conn.execute("SELECT id FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Session not found")

        conn.execute(
            """INSERT INTO session_items
               (session_id, item_id, item_type, phase, prompt, expected_answer,
                student_answer, correct, attempts, response_secs)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_id, body.item_id, body.item_type, body.phase,
             body.prompt, body.expected_answer, body.student_answer,
             body.correct, body.attempts or 1, body.response_secs),
        )

        # update weak_words when the item has an expected_answer (vocab)
        if body.expected_answer:
            word = body.expected_answer.strip()
            if body.correct:
                conn.execute(
                    """INSERT INTO weak_words (word, lesson_id, unit_id, last_seen, correct_count)
                       VALUES (?, ?, ?, ?, 1)
                       ON CONFLICT(word) DO UPDATE SET
                         correct_count = correct_count + 1,
                         last_seen     = excluded.last_seen""",
                    (word, None, None, now_iso()),
                )
            else:
                conn.execute(
                    """INSERT INTO weak_words (word, lesson_id, unit_id, last_seen, wrong_count)
                       VALUES (?, ?, ?, ?, 1)
                       ON CONFLICT(word) DO UPDATE SET
                         wrong_count = wrong_count + 1,
                         last_seen   = excluded.last_seen""",
                    (word, None, None, now_iso()),
                )

    return {"ok": True}


@app.get("/sessions")
def list_sessions(limit: int = Query(default=20, ge=1, le=200)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [row_to_dict(r) for r in rows]


@app.get("/sessions/{session_id}")
def get_session(session_id: int):
    with get_conn() as conn:
        session = conn.execute(
            "SELECT * FROM sessions WHERE id=?", (session_id,)
        ).fetchone()
        if not session:
            raise HTTPException(404, "Session not found")
        items = conn.execute(
            "SELECT * FROM session_items WHERE session_id=? ORDER BY id",
            (session_id,),
        ).fetchall()
    return {**row_to_dict(session), "items": [row_to_dict(i) for i in items]}


# ── Weak words ─────────────────────────────────────────────────────────────────

@app.get("/weak_words")
def list_weak_words(limit: int = Query(default=20, ge=1, le=200)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM weak_words ORDER BY wrong_count DESC LIMIT ?", (limit,)
        ).fetchall()
    return [row_to_dict(r) for r in rows]


# ── Progress ───────────────────────────────────────────────────────────────────

@app.get("/progress")
def get_progress():
    with get_conn() as conn:
        total_sessions = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]

        total_secs = conn.execute(
            "SELECT COALESCE(SUM(duration_secs), 0) FROM sessions"
        ).fetchone()[0]

        lessons_completed = conn.execute(
            "SELECT COUNT(*) FROM lessons_status WHERE status='completed'"
        ).fetchone()[0]

        lessons_in_progress = conn.execute(
            "SELECT COUNT(*) FROM lessons_status WHERE status='in_progress'"
        ).fetchone()[0]

        weak_words_count = conn.execute("SELECT COUNT(*) FROM weak_words").fetchone()[0]

        # current level: most frequent level across all sessions
        level_row = conn.execute(
            "SELECT level FROM sessions GROUP BY level ORDER BY COUNT(*) DESC LIMIT 1"
        ).fetchone()
        current_level = level_row[0] if level_row else None

        # sessions this week (ISO week, UTC)
        week_start = datetime.now(timezone.utc).strftime("%Y-W%W")
        sessions_this_week = conn.execute(
            """SELECT COUNT(*) FROM sessions
               WHERE strftime('%Y-W%W', started_at) = ?""",
            (week_start,),
        ).fetchone()[0]

    return {
        "total_sessions":      total_sessions,
        "total_minutes":       round(total_secs / 60, 1),
        "lessons_completed":   lessons_completed,
        "lessons_in_progress": lessons_in_progress,
        "current_level":       current_level,
        "weak_words_count":    weak_words_count,
        "sessions_this_week":  sessions_this_week,
    }


# ── Lessons status ─────────────────────────────────────────────────────────────

@app.get("/lessons_status")
def list_lessons_status():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM lessons_status ORDER BY lesson_id").fetchall()
    return [row_to_dict(r) for r in rows]


@app.patch("/lessons_status/{lesson_id}")
def patch_lesson_status(lesson_id: str, body: LessonStatusPatch):
    fields, values = [], []
    if body.status is not None:
        fields.append("status=?")
        values.append(body.status)
    if body.best_score is not None:
        fields.append("best_score=?")
        values.append(body.best_score)
    if not fields:
        return {"ok": True}
    values.append(lesson_id)
    with get_conn() as conn:
        cur = conn.execute(
            f"UPDATE lessons_status SET {', '.join(fields)} WHERE lesson_id=?", values
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "Lesson not found")
    return {"ok": True}


# ── Homework ───────────────────────────────────────────────────────────────────

@app.post("/homework")
def create_homework(body: HomeworkCreate):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO homework_log (lesson_id, assigned_at, notes) VALUES (?, ?, ?)",
            (body.lesson_id, now_iso(), body.notes),
        )
    return {"homework_id": cur.lastrowid}


@app.patch("/homework/{homework_id}/complete")
def complete_homework(homework_id: int):
    with get_conn() as conn:
        cur = conn.execute(
            "UPDATE homework_log SET completed_at=? WHERE id=?",
            (now_iso(), homework_id),
        )
    if cur.rowcount == 0:
        raise HTTPException(404, "Homework not found")
    return {"ok": True}
