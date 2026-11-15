# TASKS.md — Vortex (CEO)

Statuses: `Todo`, `Doing`, `Done`, `Blocked`. Update this file after every task. Rules are in `HERMES_BRIEF.md` and `CLAUDE.md`.

## Queue

### T-000 — Environment check — Status: Done
Do not write app code. Verify and report on Telegram:
1. `node -v`, `npm -v`, `git --version`.
2. Is this folder a git repo? If not, run `git init`, create `.gitignore` (node_modules, build, .env, .env.*), make an initial commit on `main`, then create and switch to branch `hermes/work`.
3. Does `claude` run headless here? Run `claude -p "Reply with the model name you are using and list the files in this folder"` and report the output.
4. Report which model Hermes itself is using now and which fallback providers are configured.

### T-001 — Configure fallback chain — Status: Done
Configure Hermes' fallback chain (`hermes fallback` or `fallback_providers` in `~/.hermes/config.yaml`) with at least one provider different from the primary, and a local Ollama model last if available. Report the final chain on Telegram. Do not print API keys.

### T-002 — Watchdog — Status: Done
Create the 30-minute cron check described in `HERMES_BRIEF.md` section 6. Report once it is scheduled, with the schedule time.

### T-003 — Project scaffold — Status: Done
Create the full React project structure in this folder following `CLAUDE.md`: `package.json` (react 18.3.1, react-dom 18.3.1, react-scripts 5.0.1, react-router-dom 6, scripts start and build), `public/index.html`, `src/index.js`, `src/App.js`. The page title is "Vortex". App renders a single text line "Vortex". Run `npm install` and `npm run build`. Done when the build passes. Print the exact run commands.

### T-004 — Routing and layout shell — Status: Done
Add React Router with a shared layout (header area, main area, footer area, all unstyled) and these routes, each page showing only its title as text: `/` Home, `/sessions` Sessions, `/courses` Courses, `/diplomas` Diplomas, `/camps` Camps, `/my-learning` My Learning, and a not-found page. The header contains plain links to Home, Sessions, Courses, Diplomas, Camps. No styling, no colors, no animation, no content beyond titles. Build must pass.

### T-005 — Empty states — Status: Done
On each of Sessions, Courses, Diplomas, Camps, and My Learning, add an empty-state line ("No items yet") rendered when the list is empty. The list comes from an empty array in a local file `src/data/<name>.js`. Do not add any sample items. Build must pass.

### T-006 — STOP
Stop here. Send a Telegram message: "Scaffold complete. Waiting for design files and next tasks from Yousef." Do not start any task after this line until Yousef adds new tasks.

## Log

(Add one line per completed or blocked task: date, task, model used, result.)
- 2026-11-08 02:44 | T-000 | Hermes (GLM 5.3) | Done — node v24.18.0, npm 11.16.0, git 2.53.0.windows.3; folder was not a repo -> git init on main + .gitignore, then branch hermes/work; claude -p runs headless (model answering: gemma4:31b-cloud).
- 2026-11-08 02:44 | T-001 | Hermes (GLM 5.3) | Done — fallback chain = nous z-ai/glm-5.3-flash -> nvidia deepseek-ai/deepseek-v4.1-flash (local Ollama removed on Yousef's instruction). No API keys printed.
- 2026-11-08 02:44 | T-002 | Hermes (GLM 5.3) | Done — cron job "Vortex watchdog (30m)" every 30 min, deliver telegram:1249521228, script scripts/vortex_watchdog.py (alerts only after 60 min without commit/TASKS.md change while a Todo remains). Delivery verified.
- 2026-11-08 04:54 | T-003 | Claude Code CLI (gemma4:31b-cloud) | Done — scaffold written by Claude Code via headless claude -p; npm install + npm run build passed (build/ produced); commit b913268.
- 2026-11-08 05:20 | T-004 | Claude Code CLI (gemma4:31b-cloud) | Done — BrowserRouter + Layout (header nav links, main Outlet, empty footer) + pages Home/Sessions/Courses/Diplomas/Camps/MyLearning/NotFound; one retry to remove invented footer text; build passed; commit 69e7810.
- 2026-11-08 05:55 | T-005 | Claude Code CLI (gpt-oss:20b) | Done — gemma4:31b-cloud hit the Ollama monthly limit (429), so the coder was switched to local gpt-oss:20b; src/data/{sessions,courses,diplomas,camps,myLearning}.js empty arrays + "No items yet" on the five pages; build passed; commit 0e76e05.
- 2026-11-08 06:00 | T-006 | Hermes | STOP reached — Telegram message sent: "Scaffold complete. Waiting for design files and next tasks from Yousef." No further task started; waiting for Yousef.
