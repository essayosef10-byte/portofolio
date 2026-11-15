# CLAUDE.md — Vortex (CEO) Platform

You are the coding agent for the Vortex platform. Follow these rules exactly. Product decisions come from the owner; do not invent features, content, or visuals.

## 1. Product (summary)

Vortex is a public learning platform for all Egyptian university students. It is a separate product from the Vortex Academy LMS. Sign-in is Google only, with no password. The backend is intentionally minimal. The front-end quality (UI and UX) is the main goal, but **design is not in scope until design files are provided**.

Main areas (four tabs):

| Area | Meaning |
|---|---|
| Sessions | Weekly recorded sessions explained by a doctor |
| Courses | Free and paid courses; paid access is time-limited |
| Diplomas | Structured programs such as research-qualification courses (final name to be confirmed) |
| Camps | Bookable camps, usually free |

Also planned but out of scope now: Quizzes/Games ("Coming Soon"), checkout, Google sign-in, admin panel.

## 2. Roles

Visitor, Student, Admin (5 partners), Owner (Yousef). Students have an auto-generated Student ID and a profile with University, Faculty, Year.

## 3. Terminology (use exactly these words)

Session, Course, Diploma, Camp, Booking, Order, Enrollment, Student ID, Draft, Scheduled, Published, Archived, Active, Expired. Do not use synonyms such as "Class", "Purchase", "Subscription".

## 4. Key rules (for later features)

- Paid Courses and Diplomas need an Active Enrollment. Expiry = purchase date + duration set by an Admin. After expiry, content is locked and the student sees Expired with a Renew option.
- Camp booking is a reservation; one Booking per student per Camp; capacity applies.
- Archived items are hidden from new users. Archived Sessions can be restored.

## 5. Technical rules

- **Stack:** React 18 with `react-scripts` 5.0.1, `react-router-dom` 6. JavaScript, not TypeScript.
- **Always deliver a complete project structure:** `package.json`, `public/index.html`, `src/index.js`, `src/App.js`, and every file that is imported.
- `package.json` must contain the scripts `start` and `build` using `react-scripts`.
- The project must run on a clean machine with `npm install && npm start` and zero errors, and `npm run build` must exit with code 0.
- Allowed libraries (install commands):
  - `npm install react@18.3.1 react-dom@18.3.1 react-scripts@5.0.1 react-router-dom@6`
  - No other library without the owner's approval.
- Do not write ESLint rule comments (`eslint-disable`, `exhaustive-deps`) and do not add ESLint configuration.
- Code must be clean: no syntax errors, no missing imports, no undefined components, no unused placeholder files. Every import path must match the real file structure exactly.
- No placeholder, lorem ipsum, or random data. Use only content from this file or provided by the owner. If content is missing, render an empty state.
- Use relative links and the `public` folder for static assets (logo goes in `public/`).
- Support RTL and LTR readiness: do not hard-code left/right in structural CSS where logical properties (`margin-inline-start`, etc.) work.
- Keep components small and in separate files: `src/pages`, `src/components`, `src/layout`.

## 6. Working rules

- One task at a time from `TASKS.md`. Change only what the task needs.
- After every change, run `npm run build` and fix errors before finishing.
- Never run `git push`. Work on branch `hermes/work`.
- At the end of every task, print: the files created or changed, the install commands used, and the run commands.
