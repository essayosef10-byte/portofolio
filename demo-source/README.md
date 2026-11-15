# Portfolio demo copies

These are isolated copies of the six project frontends. The original folders on `D:\` were left untouched, and private `.env*` files, dependency folders, build outputs, and Git history were not copied.

## What demo mode does

- Field CRM, Vortex Academy, and CEO by Vortex open with a sample visitor/admin identity instead of the real sign-in flow.
- Those apps use an in-memory Supabase-shaped adapter with sample records. Changes made while browsing live only in that tab and never reach the real database.
- Yara Shop uses the same local adapter for catalog and review interactions.
- Lecture Companion opens with a sample transcript, lecture map, and local canned answers when its URL includes `?demo=1`; it does not call an AI provider for that sample.
- Vortex Tricora is already a public, static storefront frontend and has no account gate in this copy.

## Run locally

Install dependencies once in each app folder with `npm install`, then start it with the command below. Open each in a separate terminal. Change `PORT` before starting additional Create React App projects.

| App | Folder | Command | Default URL |
| --- | --- | --- | --- |
| Field CRM | `field-crm` | `$env:PORT='3001'; npm run start:demo` | `http://localhost:3001` |
| Vortex Academy | `vortex-academy` | `npm run dev:demo -- -p 3005` | `http://localhost:3005` |
| CEO by Vortex | `ceo-vortex` | `$env:PORT='3002'; npm run start:demo` | `http://localhost:3002` |
| Lecture Companion | `lecture-companion` | `$env:PORT='3003'; npm start` | `http://localhost:3003/?demo=1` |
| Vortex Tricora | `vortex-tricora` | `npm run dev -- -p 3006` | `http://localhost:3006` |
| Yara Shop | `yara-shop` | `$env:PORT='3004'; npm run start:demo` | `http://localhost:3004` |

To create deployment builds, use `npm run build:demo` for the four apps that define it. The demos still need to be published by a hosting provider before they can be sent as public links; each app can be deployed as its own site. Configure the same demo flag in that app's build environment if the host builds with a different command.
