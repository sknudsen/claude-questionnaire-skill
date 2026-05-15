---
name: questionnaire
description: >
  Present a configurable questionnaire as an inline widget and return structured
  answers. Use this skill whenever the user says "run questionnaire", "ask me a
  questionnaire", "present a questionnaire", or whenever another skill needs to
  collect structured input across one or more questions (with 7-point Likert
  ratings, free-text responses, and optional notes).
  Renders via show_widget using a CDN-hosted widget; receives results back via
  sendPrompt and (optionally) writes them to disk.
compatibility: >
  Requires show_widget for inline rendering. CDN load from cdn.jsdelivr.net.
  File write to disk is optional — used only when outputPath is provided or
  a default output directory is available.
---

# Questionnaire Skill

A reusable skill that renders a configurable multi-page questionnaire and
returns structured answers. Widget design and full schema docs live in the
repo's [README](README.md).

---

## Global Rules

- **Conciseness:** The widget contains all the user-facing content. Do not
  re-render the prompts in chat, summarise the questions, or narrate what is
  about to happen before the widget appears. After submission, surface only
  the structured result (the `questionnaire:` payload from `sendPrompt`) and
  any file-write confirmation. No restating of answers in prose.
- **No tool searches needed** — the widget is loaded via `show_widget` and
  uses only the standard chat surface. File writes use the host's standard
  file tools when present.
- **Trust the schema** — if input validation fails, surface the exact error
  (missing field, duplicate ID, etc.) rather than guessing what the author meant.

---

## 1. Input

The skill is invoked with either:

a. **Inline JSON** in the trigger message, e.g.:
   ```
   run questionnaire {"configuration": {...}, "questions": [...]}
   ```
b. **A path to a JSON file** containing the same shape:
   ```
   run questionnaire ./path/to/checkin.json
   ```
c. **Called by another skill** with the config object passed programmatically.

Schema: see [README §Configuration](README.md#configuration).

Minimum required fields:
- `configuration.title` (string)
- `questions` (array of 1–10 question objects, each with at least `id` and `prompt`)

### Validation (skill-side, before launching widget)

| Check | Action on failure |
|---|---|
| `questions.length` between 1 and 10 | Refuse with the count |
| All `id` values unique within `questions` | Refuse and list duplicates |
| All `prompt` values non-empty | Refuse and list offending IDs |
| If `pages` is set: every question ID appears in exactly one page | Refuse with the offending IDs |
| If `pages` is set: every `questionIds[]` entry maps to a real question | Refuse with unknown IDs |

Apply defaults silently:
- `responseShape` → `"likert+text+note"`
- `charLimitText` → `200`
- `charLimitNote` → `100`
- `configuration.submitLabel` → `"Submit"`

---

## 2. Render the widget

Use `show_widget` with the following template. Inject only:
- `{config_json}` — the validated input config, JSON-stringified.

```html
<div id="qw-root"></div>
<script src="https://cdn.jsdelivr.net/gh/sknudsen/claude-questionnaire-skill@main/widget/questionnaire-widget.js"></script>
<script>
  initQuestionnaire({config_json});
</script>
```

The widget handles layout, validation, navigation, and submission. Do not
build a custom UI around it.

### CDN fallback

If the CDN load fails (network/cache issue, surfaced as
`window.initQuestionnaire is not defined`), fall back to a plain-text
walk-through: prompt each question one at a time in chat, with the Likert
asked as a number 1–7, the text and notes as free-form responses. Submit
the same JSON payload manually.

---

## 3. Receive the result

The widget calls `sendPrompt('questionnaire:' + JSON.stringify(payload))`
on submit. The skill recognises the `questionnaire:` prefix and parses the
JSON tail.

Payload shape: see [README §Output](README.md#output). Always includes the
echoed `configuration`, `questions`, the new `results[]` array, and `meta`
(timestamp + schemaVersion).

---

## 4. Write the result to disk

### When to write

- If `configuration.outputPath` is set in the input: write there.
- Else if a default output directory is available (e.g. a mounted OneDrive
  folder under `PARA-meta`): write to:
  ```
  {output_root}/Questionnaire_results/{slugified_title}/YYYY-MM-DD_HH-mm-ss.json
  ```
- Else: skip the file write and surface a "no file written" notice.

### How to write

Write the full payload as pretty-printed JSON (2-space indent). Create
parent directories as needed. On write failure, surface the error path and
the structured payload so the user can save it manually.

### Slugification rule

`configuration.title` → lowercase, spaces and special chars replaced with
hyphens, collapsed to single hyphens, trimmed. Example:
`"Daily evening check-in — bounded fields"` → `daily-evening-check-in-bounded-fields`.

---

## 5. Confirmation

After widget submission and (if applicable) file write, surface:

```
✓ Questionnaire submitted: {title}
  File: {outputPath or "not written"}
  Results: {N answered}/{N total}
```

Do not summarise individual answers. The file and the structured payload
are the durable record; chat doesn't need to duplicate them.

The structured payload remains in the conversation, so downstream skills
(e.g. a future evening-checkin skill writing a synthesis paragraph) can
consume it directly.

---

## Edge cases

| Situation | Handling |
|---|---|
| Inline JSON malformed | Refuse with the parse error and the failing snippet |
| File path doesn't exist or unreadable | Refuse with the path and reason |
| `show_widget` unavailable | Fall back to plain-text walk-through (see §2) |
| Widget never submits (user closes/cancels) | Surface "no submission received"; do not write a partial result |
| `outputPath` directory unwritable | Surface error path + structured payload for manual save |
| Two questionnaire submissions in one session | Treat each independently — slugified path includes timestamp, so no collision |

---

## Quick-Start Checklist

- [ ] Parse input (inline JSON or file path)
- [ ] Validate config per §1
- [ ] Apply defaults
- [ ] `show_widget` with template from §2
- [ ] Wait for `sendPrompt('questionnaire:' + …)`
- [ ] Parse the JSON tail
- [ ] Write to `outputPath` or default location per §4
- [ ] Surface the confirmation block per §5
