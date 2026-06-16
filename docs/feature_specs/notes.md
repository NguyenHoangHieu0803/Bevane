# Feature Spec — Notes

**Area:** Notes tab. **Screens:** notes list → editor → checklist / reminder / lock.
Tags: **[WORKING]** · **[STUB]** · **[ROADMAP]**.

## Core features

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| Create / read / update / delete | Full CRUD on a personal note (title + body). | **[WORKING]** |
| Notes list | List notes most-recent-first. | **[WORKING]** |
| Rich text | Bold/italic/lists/headings in the body. | **[STUB]** |
| Folders / categories | Organize notes into folders. | **[STUB]** (recommend `folder` column) |
| Pin note | Pin a note to the top. | **[STUB]** (recommend `pinned` column) |
| Search notes | Full-text search across notes. | **[STUB]** |
| Color labels | Assign a color label to a note. | **[STUB]** (recommend `color` column) |
| Checklist | Tickable checklist items in a note. | **[STUB]** (recommend `checklist` column) |
| Image attachment | Attach an image to a note. | **[STUB]** |
| Voice-to-note | Dictate a note via speech. | **[STUB]** |
| Reminder | Set a time-based reminder on a note. | **[STUB]** (recommend `reminder_at`; system alarm [ROADMAP]) |
| Share / export PDF | Share a note or export it to PDF. | **[STUB]** |
| History / versions | View/restore previous versions of a note. | **[STUB]** |
| Lock (Face ID / PIN) | Lock a note behind biometrics/PIN. | **[STUB]** (recommend `locked` column; Face ID unavailable on web → PIN [ROADMAP]) |

## AI features (offline, deterministic via `src/ai.js`)

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| Generate note from conversation | Summary + action items from a chat, saved as a note. | **[WORKING]** |
| Write assistant | Expand/continue/draft text from a prompt. | **[STUB]** |
| Auto-summarize note | Condense the current note to key points. | **[STUB]** (recommend `/api/ai/note-summarize`) |
| Smart tags | Suggest tags/labels for the note. | **[STUB]** (recommend `/api/ai/smart-tags`) |
| Grammar check | Flag/fix grammar issues. | **[STUB]** |
| Action-item extractor | Pull TODOs/action items from the note. | **[STUB]** (recommend `/api/ai/action-items`) |
| Ask AI about this note | Q&A against the note's content. | **[STUB]** (recommend `/api/ai/ask-about-note`) |

## Notes for Frontend
- Editor toolbar hosts rich-text + AI buttons (summarize, tags, grammar, action-items, ask, write) — stubs emit "Coming soon" unless a backend endpoint exists.
- List screen hosts folder filter, search, pin toggle, color labels (stubs).
- Lock and reminder open dedicated sub-screens (stubbed).
- All AI output must be clearly labeled AI-generated.
