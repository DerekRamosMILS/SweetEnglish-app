from typing import Optional
from pydantic import BaseModel


# ── Sessions ──────────────────────────────────────────────────────────────────

class SessionStart(BaseModel):
    lesson_id:    str
    lesson_title: str
    unit_id:      str
    unit_title:   str
    level:        str
    mode:         str


class SessionEnd(BaseModel):
    duration_secs: int
    notes:         Optional[str] = None


class SessionItem(BaseModel):
    item_id:         str
    item_type:       str
    phase:           Optional[str] = None
    prompt:          Optional[str] = None
    expected_answer: Optional[str] = None
    student_answer:  Optional[str] = None
    correct:         int
    attempts:        Optional[int] = 1
    response_secs:   Optional[int] = None


# ── Lessons status ────────────────────────────────────────────────────────────

class LessonStatusPatch(BaseModel):
    status:     Optional[str]  = None
    best_score: Optional[float] = None
    notes:      Optional[str]  = None


# ── Homework ──────────────────────────────────────────────────────────────────

class HomeworkCreate(BaseModel):
    lesson_id: str
    notes:     Optional[str] = None
