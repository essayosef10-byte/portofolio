# Project: lecture-companion

Goal: web app (like NotebookLM) where the user uploads a lecture audio file + the lecture PDF. The app transcribes the audio, reads the PDF, links what the lecturer said to specific slides/pages, then explains the lecture (e.g. "at slide 7 the doctor asked a question", "at slide 12 he added extra info not on the slide").

## Rules (follow strictly)
- Work fully autonomously. NEVER ask me questions or for permission. If something is unclear, choose the most reasonable option and write the decision in NOTES.md.
- If a task is blocked after 2 attempts, skip it, write why in NOTES.md, and continue to the next task.
- Work only inside this project folder. Never delete files outside it. No destructive commands.
- Do not read the whole project at once. Read only the files needed for the current task.
- Do ONE task at a time. After each task: run the relevant tests, fix failures, then `git add . && git commit -m "<task name>"`. Do not push.
- After each task, append to NOTES.md: what was done, what is left, known problems.
- Do not invent features or fake data. Use only what actually works.

## LLM access
Users cannot log in with their normal ChatGPT/Gemini chat account (no official way). Implement: user enters their own API key (Gemini first, optional OpenAI) in a settings page, stored locally in the browser/server config, never committed to git.

## Tasks (in order)
1. Read the folder structure, run the existing tests (test/ folder), and write NOTES.md with: what exists, what works, what fails.
2. Fix failing tests and obvious bugs in the existing code.
3. PDF: extract text per page/slide reliably (extract_pdf.py). Add tests.
4. Audio: transcription with timestamps (transcribe_local.py). Test with a short sample file. Add tests.
5. Linking: match each transcript segment to the most relevant PDF page (use the LLM API or embeddings). Add tests.
6. Explanation: generate a structured lecture explanation with the events: questions asked, extra info added by the lecturer, slide-by-slide summary.
7. UI: upload audio + PDF, show progress, show results per slide with transcript segments. Make it work on 127.0.0.1:3000.
8. Run all tests, fix remaining bugs, test the full flow end to end.
9. Write DEPLOY.md: exact steps for me to run and deploy this (commands, env vars, where to put the API key).

## When finished
Write the final summary at the top of NOTES.md and stop.
