# Decisions — [REPO_NAME]

Durable architectural decisions. Record here, not in chat.

---

## Inherited from template

### DEC-001 — docs/ index format
BM25 (k1=1.5, b=0.75) + TF-IDF + RRF (k=60) XML index. Chunking by H1→H2→H3 heading hierarchy. Always rebuild via `scripts/build_index.py` — never edit `_index.xml` directly.

### DEC-002 — PDF/Office file handling
Convert to Markdown via `markitdown[all]` before committing. No binary document files in the repo.

### DEC-003 — Skill packaging
All SKILL.md files written and packaged using SAVVY. No manual editing without SAVVY.

### DEC-004 — One skill = one responsibility
No bundling of multiple capabilities into one skill.

---

*Add project-specific decisions below.*
