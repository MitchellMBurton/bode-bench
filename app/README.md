# Frontend App

Shared React + Vite frontend for the scientific listening instrument.

This is the primary product surface used by both:

- browser development / local sharing
- the Tauri desktop shell

## Commands

```bash
cd app
npm install
npm run dev
npm run lint
npm run build
```

## Key Responsibilities

- local media ingest
- transport and review UX
- live analysis surfaces
- diagnostics log UI
- video presentation modes
- optional annotation overlays

## Notes

- Keep runtime behavior general-purpose.
- Do not assume Bach-specific media or metadata in shared frontend logic.
- The sample overlay pipeline remains available, but it is optional.
