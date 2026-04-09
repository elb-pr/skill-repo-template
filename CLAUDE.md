# CLAUDE.md — [REPO_NAME]

Session orientation for Claude. Read this first, every time.

---

## What this repo is

[DESCRIPTION — one paragraph explaining what this skill repo does and who it's for.]

---

## Repo structure

```
[REPO_NAME]/
├── CLAUDE.md                  ← you are here
├── README.md                  ← project overview
├── .gitignore
│
├── skills/                    ← skill library
│   ├── [category]/
│   │   └── [skill-name]/
│   │       └── SKILL.md
│   └── README.md              ← skills index
│
├── docs/                      ← source documents
│   ├── README.md              ← doc manifest + retrieval notes
│   ├── _index.xml             ← BM25+TF-IDF+RRF retrieval index (generated)
│   └── [category]/            ← topic subfolders (rename from category-one/)
│
├── scripts/
│   └── build_index.py         ← rebuilds docs/_index.xml
│
└── .claude/
    ├── skills/                ← working tools for Claude
    │   ├── savvy/             ← skill packaging framework
    │   └── index-builder/     ← retrieval index skill
    └── docs/
        ├── plans-tasks-decisions.md
        ├── tasks/tasks.md
        ├── decisions/decisions.md
        ├── sync.md
        └── claude-personal-notes.md
```

---

## Skills architecture

Each skill lives at `skills/<category>/<skill-name>/SKILL.md`.

**Always use the SAVVY skill** (`.claude/skills/savvy/`) to write or repackage any SKILL.md. Do not write skill content without it.

| Category | Skills |
|----------|--------|
| [category] | [skill-name], [skill-name] |

*Fill this table in as you define the skill taxonomy.*

---

## Working with docs

Source documents live in `docs/<category>/`. Six suggested categories — adjust to suit the domain:

| Folder | Content |
|--------|---------|
| `category-one/` | [describe] |
| `category-two/` | [describe] |

*Define and rename these to match the domain. Delete `category-one/` once real folders are in place.*

**Adding docs:** Drop Markdown files into the correct subfolder. PDFs and Office files → convert with `markitdown` first. After any addition, rebuild the index:

```bash
cd scripts && python3 build_index.py
```

The index-builder skill (`.claude/skills/index-builder/`) documents the full BM25+TF-IDF+RRF methodology if you need to understand or extend it.

---

## Key conventions

- **British English** throughout
- **Kebab-case** for all filenames and directories
- **No PDFs committed** — convert to Markdown via markitdown first
- **SAVVY for all skill packaging** — no manual SKILL.md editing
- **One skill = one responsibility**
- Commit prefixes: `skills:`, `docs:`, `scripts:`, `.claude:`

---

## Project management

Active tasks → `.claude/docs/tasks/tasks.md`
Decisions → `.claude/docs/decisions/decisions.md`
Check tasks before starting. Update after each completed action.

---

## What not to do

- Don't edit `docs/_index.xml` directly — rebuild via `scripts/build_index.py`
- Don't commit PDFs
- Don't write SKILL.md content without SAVVY
- Don't bundle multiple capabilities into one skill
