# SweetEnglish — Teacher Backend

Local FastAPI + SQLite server. No external database needed.

## Install

```bash
cd backend
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload
```

## Stop

`Ctrl+C`

## URLs

| | |
|---|---|
| API base | http://localhost:8000 |
| Auto-docs (Swagger) | http://localhost:8000/docs |
| ReDoc | http://localhost:8000/redoc |

## Database

File: `backend/english_teacher.db` (SQLite, auto-created on first run).

Tables: `sessions`, `session_items`, `weak_words`, `lessons_status`, `homework_log`.

## Notes

- CORS is open (`*`) — safe because this only runs locally.
- All timestamps are ISO 8601 UTC.
- The teacher frontend connects to `http://localhost:8000`.
