# claude-questionnaire-skill

A reusable questionnaire widget for Claude's Visualizer, loaded via CDN. Renders a configurable multi-page form with 7-point Likert ratings, free-text responses, and optional notes, then returns structured results to Claude via `sendPrompt`.

Seed use case is a daily evening check-in. The widget is intended for any questionnaire-shaped artifact (weekly review, post-mortem, mood log, etc.) that fits the same response shapes.

## Why this exists

Claude's Visualizer streams widget code token-by-token before rendering. By hosting the widget externally and loading it via CDN, each invocation shrinks to a small per-questionnaire config payload, cutting load time and keeping the skill prompt lean.

## Usage

### In a Claude `show_widget` call

```html
<div id="qw-root"></div>
<script src="https://cdn.jsdelivr.net/gh/sknudsen/claude-questionnaire-skill@main/widget/questionnaire-widget.js"></script>
<script>
initQuestionnaire({
  configuration: {
    title: "Daily evening check-in",
    intro: "A few quick items.",
    submitLabel: "Submit",
    pages: [
      { id: "ratings", title: "How today felt", intro: "Four agreement items.", questionIds: ["L1a", "L3a"] },
      { id: "reflections", title: "What today took and gave", questionIds: ["B1"] }
    ]
  },
  questions: [
    { id: "L1a", responseShape: "likert+text+note", prompt: "Today I had the energy I wished for.", charLimitText: 200, charLimitNote: 100 },
    { id: "L3a", responseShape: "likert+text+note", prompt: "I worked on things that matter to me right now.", charLimitText: 200, charLimitNote: 100 },
    { id: "B1",  responseShape: "text-only", prompt: "What did today take from me?", description: "\"Nothing today\" is a valid response.", charLimitText: 300 }
  ]
});
</script>
```

A full working example sits in [`examples/evening-checkin.json`](examples/evening-checkin.json).

## Configuration

### `configuration` (object)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | yes | Heading at the top of the widget on every page |
| `intro` | string | no | Short paragraph; rendered on the first page only |
| `submitLabel` | string | no | Defaults to `"Submit"` |
| `pages` | array | no | Page sequence (see below). If omitted, all questions render on a single implicit page with no per-page framing |

### `configuration.pages[]` (object)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Stable identifier, e.g. `"ratings"` |
| `title` | string | no | Heading at the top of the page |
| `intro` | string | no | Framing text shown above the page's questions |
| `questionIds` | array of strings | yes | IDs of the questions on this page, in render order |

Every question ID must appear in exactly one page when `pages` is set.

### `questions[]` (array, 1–10 items)

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | string | yes | — | Stable identifier; used as the result key |
| `responseShape` | `"likert+text+note"` \| `"text-only"` | no | `"likert+text+note"` | Determines which input slots render |
| `prompt` | string | yes | — | For `likert+text+note`, an agreement statement; for `text-only`, an open invitation |
| `description` | string | no | — | Optional hint line below the prompt |
| `charLimitText` | number | no | `200` | Soft cap on the free-text slot; counter turns amber at the limit but typing continues |
| `charLimitNote` | number | no | `100` | Soft cap on the note slot (only used by `likert+text+note`) |

The textarea height derives from `charLimitText` as `round(charLimitText / 200 × 62px)`, so larger caps get proportionally taller textareas.

## Response shapes

### `likert+text+note`

Renders, in order: free-text response (full width), slider (full width) with optional note input (right half, single line) below.

The Likert scale is fixed: 1 (Strongly disagree) ↔ 7 (Strongly agree). Until first interaction, the slider thumb is muted (opacity 0.35, grayscale) and the answer is `null`. The first pointerdown or keydown commits the current value.

### `text-only`

Renders the prompt with a free-text response only. Used for open prompts that aren't agreement statements (e.g. "What did today take from me?").

## Validation

| Rule | When it fires |
|---|---|
| Likert required | All `likert+text+note` questions on the form must have a rating |
| Text required | All questions (both shapes) must have non-empty text after trim |
| Char limits | Soft caps — counter turns amber at limit, but overflow is accepted and preserved |

The Next button is disabled when current-page items are missing input; Submit on the final page is disabled when *any* question across all pages is incomplete.

## Output

On submit, the widget calls:

```js
sendPrompt("questionnaire:" + JSON.stringify(payload))
```

where `payload` echoes the full `configuration` and `questions`, plus:

```json
{
  "results": [
    { "id": "L1a", "responseShape": "likert+text+note", "text": "…", "likert": 3, "note": "" },
    { "id": "B1",  "responseShape": "text-only",        "text": "Nothing today" }
  ],
  "meta": {
    "submittedAt": "2026-05-15T21:42:13.000Z",
    "schemaVersion": 1
  }
}
```

Echoing the full input makes each result self-describing — readable without the original config, useful for longitudinal analysis.

## License

**Interim — all rights reserved.** See [LICENSE](LICENSE) for the full notice.

No permission is granted to use, copy, modify, or distribute this software at
this time. The repository is public for collaboration and review only.
The author is evaluating permissive open-source options (current candidate:
the Do No Harm License) and intends to relicense once a decision is made.
