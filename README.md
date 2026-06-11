# SweetEnglish

Two separate apps hosted on GitHub Pages.

## Apps

| App | URL |
|-----|-----|
| Student | https://derekramosmils.github.io/SweetEnglish-app/student/ |
| Teacher | https://derekramosmils.github.io/SweetEnglish-app/teacher/ |
| Lesson Studio | https://derekramosmils.github.io/SweetEnglish-app/admin.html |

## Teacher app

Password protected. Default password: `teacher123`

The password is stored in `sessionStorage` — it clears when the tab is closed.

## Backend (local only)

The teacher backend runs on the teacher's machine only. It is never hosted publicly.

```bash
cd backend
pip3 install -r requirements.txt
uvicorn main:app --reload
```

API available at http://localhost:8000 · Docs at http://localhost:8000/docs

## File structure

```
student/
  index.html        ← student PWA (offline-capable)
  manifest.json     ← PWA manifest
  sw.js             ← service worker
teacher/
  index.html        ← teacher PWA (password gated)
  manifest.json     ← PWA manifest
  sw.js             ← service worker
  syllabus.json     ← 32-unit A1–C1 syllabus
  syllabus.md       ← human-readable syllabus
backend/
  main.py           ← FastAPI app (13 endpoints)
  database.py       ← SQLite schema + connection
  models.py         ← Pydantic request models
  requirements.txt
admin.html          ← Lesson Studio (create/edit/export lessons)
app.html            ← legacy student app
.nojekyll           ← disables Jekyll on GitHub Pages
```
