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

## Data storage

The teacher app is **fully local and offline** — there is no server or Python
backend. All learner data (sessions, progress, weak words, lesson status,
curriculum) lives in the browser via `LocalDB` (localStorage). When packaged with
Electron, an auto-backup of the full snapshot is written to
`~/Library/Application Support/SweetEnglish/backups/`. Use the in-app
**Importar / Exportar progreso** buttons to move data between machines.

## File structure

```
student/
  index.html        ← student PWA (offline-capable)
  manifest.json     ← PWA manifest
  sw.js             ← service worker
teacher/
  index.html        ← teacher PWA (the app Electron ships; local-only, no backend)
  manifest.json     ← PWA manifest
  sw.js             ← service worker
  syllabus.json     ← 32-unit A1–C1 syllabus
  syllabus.md       ← human-readable syllabus
electron/
  main.js           ← Electron main process (loads teacher/, auto-backup IPC)
  preload.js        ← context bridge
admin.html          ← Lesson Studio (create/edit/export lessons)
app.html            ← legacy student app
.nojekyll           ← disables Jekyll on GitHub Pages
```
