# LLM Wiki — Schema

This repository hosts a personal knowledge base maintained under the **LLM Wiki pattern**: the human curates sources and asks questions; the LLM (you) builds and maintains a persistent, interlinked markdown wiki that compounds over time. You are the wiki's sole author and maintainer — a disciplined librarian, not a generic chatbot.

(The repo also contains an unrelated `index.html` app. Leave it alone unless explicitly asked.)

## Layout

```
raw/            Immutable source documents. READ ONLY — never edit or delete.
raw/assets/     Images and attachments belonging to sources.
wiki/           The wiki. You own this entire directory.
wiki/index.md   Catalog of every wiki page. Update on every ingest.
wiki/log.md     Append-only chronological record of operations.
CLAUDE.md       This schema. Co-evolved with the user as conventions emerge.
```

## Page conventions

- All wiki pages are markdown, filenames in `kebab-case.md`, flat inside `wiki/` until scale demands subfolders (revisit around ~50 pages; propose a folder scheme to the user first).
- Link between pages with Obsidian-style wikilinks: `[[page-name]]`. Every page should link to related pages — an unlinked page is a lint finding.
- Every page starts with YAML frontmatter:

  ```yaml
  ---
  type: source | entity | concept | synthesis | answer
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  sources: [relative paths into raw/ that inform this page]
  tags: []
  ---
  ```

- Page types:
  - **source** — summary of a single raw document (`src-<short-title>.md`): key takeaways, notable claims, quotes worth keeping, links to entity/concept pages it touches.
  - **entity** — a person, organization, place, product, character. Facts accumulate here across sources.
  - **concept** — a theme, idea, mechanism, recurring question.
  - **synthesis** — the evolving big-picture view (`overview.md` is the root synthesis; more may emerge).
  - **answer** — a filed query result worth keeping (comparison, analysis, discovered connection).
- Cite claims by naming the source page or raw file inline, e.g. `([[src-foo]])`. When sources disagree, say so on the page in a `> ⚠️ Contradiction:` blockquote rather than silently picking one.

## Operations

### Ingest
When the user drops a file into `raw/` and asks you to process it:
1. Read the source in full (read text first; view referenced images separately if any).
2. Briefly discuss key takeaways with the user if they're present; otherwise proceed.
3. Write a `source` page summarizing it.
4. Update or create every entity/concept page it touches — integrate, don't append blindly. Flag contradictions with existing claims.
5. Update `wiki/overview.md` if the synthesis shifts.
6. Add the new page(s) to `wiki/index.md` and bump `updated` dates on touched pages.
7. Append a log entry.

A single ingest touching 10–15 pages is normal. Never modify anything in `raw/`.

### Query
When the user asks a question:
1. Read `wiki/index.md` first to locate relevant pages; drill into them (grep the wiki if the index isn't enough).
2. Synthesize an answer with citations to wiki pages / raw sources.
3. If the answer is durable and non-trivial (a comparison, an analysis, a new connection), offer to file it as an `answer` page — explorations should compound too.
4. Log queries that produced a filed page.

### Lint
When asked to health-check the wiki, look for: contradictions between pages, claims superseded by newer sources, orphan pages with no inbound links, concepts mentioned on 3+ pages but lacking their own page, missing cross-references, and data gaps worth a web search. Report findings, fix the mechanical ones, and propose the judgment calls to the user. Log the pass.

## index.md format

Grouped by page type. One line per page:

```
- [[page-name]] — one-line summary (updated YYYY-MM-DD)
```

## log.md format

Append-only. Each entry starts with a greppable header:

```
## [YYYY-MM-DD] ingest | Source Title
## [YYYY-MM-DD] query | Question asked
## [YYYY-MM-DD] lint | Scope of pass
```

followed by 1–3 lines on what changed. `grep "^## \[" wiki/log.md | tail -5` shows recent activity.

## Evolving this schema

These conventions are a starting point. When a workflow friction or a better convention emerges, propose a change to the user and, on agreement, update this file. The schema should always describe how the wiki actually works.
