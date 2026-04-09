import { useState, useRef } from "react";
import { FileUp } from "lucide-react";

// ── Models ────────────────────────────────────────────────────────────────────

const HAIKU  = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-6";

// ── System prompts ────────────────────────────────────────────────────────────

const EXECUTOR_SYSTEM = `You are executing a test case for a Claude skill. You receive the full SKILL.md contents and a test prompt. Your job is to simulate exactly what Claude would do if it had this skill active — following its instructions faithfully.

Write a markdown execution report. Use this exact structure:

## Steps Taken
[Numbered list of every action taken, tool used, decision made]

## Output Produced
[Describe what you actually output — include the output itself if it fits, or a detailed summary if long]

## Files Created
[List any files produced, or "None"]

## Skill Instructions Followed
[Explicit Y/N for each major instruction in the skill — did you follow it? Why or why not?]

## Notes
[Anything worth flagging — ambiguities, edge cases, unclear instructions]

Be specific. Quote the skill instructions you are following. Show your work.`;

const COMPARATOR_SYSTEM = `You are a blind output comparator. You receive two execution transcripts labelled A and B — you do NOT know which skill version produced which. Judge purely on output quality and task completion.

Generate a rubric appropriate for the task, score both outputs, pick a winner.

Return ONLY raw JSON, no markdown fences:
{
  "winner": "A|B|TIE",
  "reasoning": "why winner was chosen — specific, not vague",
  "rubric": {
    "A": { "content": { "correctness": 5, "completeness": 5, "accuracy": 4 }, "structure": { "organization": 4, "formatting": 5, "usability": 4 }, "content_score": 4.7, "structure_score": 4.3, "overall_score": 9.0 },
    "B": { "content": { "correctness": 3, "completeness": 2, "accuracy": 3 }, "structure": { "organization": 3, "formatting": 2, "usability": 3 }, "content_score": 2.7, "structure_score": 2.7, "overall_score": 5.4 }
  },
  "output_quality": {
    "A": { "score": 9, "strengths": ["specific strength"], "weaknesses": ["specific weakness"] },
    "B": { "score": 5, "strengths": ["specific strength"], "weaknesses": ["specific weakness"] }
  }
}`;

const ANALYZER_SYSTEM = `You are a post-hoc skill improvement analyzer. You receive both skill versions (SKILL.md contents), all execution transcripts, and the comparator verdicts. Your job: identify exactly which instructions caused the winner to win, and produce a prioritised, actionable improvement plan for the losing version.

Write a markdown report. Use this structure:

# Skill Comparison Analysis

**Overall verdict:** [which version won and by how much — be direct]

## Why the Winner Won
[Specific instructions or structural choices that produced better output — quote the skill text]

## Why the Loser Lost
[Specific gaps, missing constraints, positional failures, or framing issues — quote the skill text]

## Prioritised Improvements
[HIGH/MEDIUM/LOW — each with the exact change to make and what it will fix]

## Instruction-Level Diff
[Side-by-side comparison of the most impactful differences between the two skill versions]`;

// ── API helpers ───────────────────────────────────────────────────────────────

async function callClaudeMd(system, userContent, model = SONNET, maxTokens = 8000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.filter(b => b.type === "text").map(b => b.text).join("");
}

async function callClaudeJson(system, userContent, model = SONNET, maxTokens = 8000) {
  const text = await callClaudeMd(system, userContent, model, maxTokens);
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}

// ── Zip loader ────────────────────────────────────────────────────────────────

async function ensureJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = res; s.onerror = () => rej(new Error("Failed to load JSZip"));
    document.head.appendChild(s);
  });
  return window.JSZip;
}

async function loadSkillZip(file) {
  const JSZip = await ensureJSZip();
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const entries = Object.keys(zip.files);
  const root = entries[0].split("/")[0] + "/";

  const skillMdFile = zip.files[root + "SKILL.md"];
  if (!skillMdFile) throw new Error(`SKILL.md not found in ${file.name}`);
  const skillMd = await skillMdFile.async("string");

  // Extract name from frontmatter
  const nameMatch = skillMd.match(/^name:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim() || file.name.replace(".skill", "");

  // Load evals if present
  const evalsFile = zip.files[root + "evals/evals.json"];
  const evals = evalsFile
    ? JSON.parse(await evalsFile.async("string"))
    : null;

  // Collect all reference files for richer context
  const refs = {};
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!entry.dir && path.includes("/references/")) {
      refs[path.split("/").pop()] = await entry.async("string");
    }
  }

  return { name, skillMd, evals, refs };
}

function buildSkillContext(skill) {
  let ctx = `SKILL.md:\n\n${skill.skillMd}`;
  const refEntries = Object.entries(skill.refs);
  if (refEntries.length > 0) {
    ctx += "\n\n---\n\nREFERENCE FILES:\n";
    for (const [name, content] of refEntries) {
      ctx += `\n### ${name}\n${content.slice(0, 2000)}${content.length > 2000 ? "\n[truncated]" : ""}`;
    }
  }
  return ctx;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SkillComparator() {
  const [v1, setV1]         = useState(null);   // { name, skillMd, evals, refs }
  const [v2, setV2]         = useState(null);
  const [loadingV1, setLoadingV1] = useState(false);
  const [loadingV2, setLoadingV2] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Per-eval results: { id, name, prompt, transcriptA, transcriptB, comparison }
  const [results, setResults]   = useState([]);
  const [running, setRunning]   = useState(false);
  const [stage, setStage]       = useState("");
  const [analyzerMd, setAnalyzerMd] = useState("");
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState("");

  const v1Ref = useRef(null);
  const v2Ref = useRef(null);

  // ── Load handlers ─────────────────────────────────────────────────────────

  async function loadSlot(file, slot) {
    setLoadError(""); setError("");
    if (slot === "v1") setLoadingV1(true);
    else setLoadingV2(true);
    try {
      const data = await loadSkillZip(file);
      if (slot === "v1") setV1(data);
      else setV2(data);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      if (slot === "v1") setLoadingV1(false);
      else setLoadingV2(false);
    }
  }

  // ── Run comparison ────────────────────────────────────────────────────────

  function updateResult(id, patch) {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  async function runComparison() {
    setRunning(true); setError(""); setResults([]); setAnalyzerMd("");

    // Evals come from v1 (they should be identical between versions)
    const evalsData = v1.evals?.evals || [];
    if (!evalsData.length) {
      setError("No evals found in v1 — add evals/evals.json to your .skill file.");
      setRunning(false);
      return;
    }

    const v1Context = buildSkillContext(v1);
    const v2Context = buildSkillContext(v2);

    // Initialise result rows
    const initial = evalsData.map(e => ({
      id: e.id,
      name: e.eval_name || `eval-${e.id}`,
      prompt: e.prompt,
      transcriptA: null,
      transcriptB: null,
      comparison: null,
      status: "idle"
    }));
    setResults(initial);

    const allResults = [];

    for (const ev of evalsData) {
      // ── Executor A (v1)
      updateResult(ev.id, { status: "exec-a" });
      setStage(`Eval ${ev.id}: executing v1…`);
      let transcriptA;
      try {
        transcriptA = await callClaudeMd(
          EXECUTOR_SYSTEM,
          `${v1Context}\n\n---\n\nTest prompt:\n${ev.prompt}`,
          HAIKU, 8000
        );
        updateResult(ev.id, { transcriptA });
      } catch (e) {
        updateResult(ev.id, { status: "error", transcriptA: `**Error:** ${e.message}` });
        continue;
      }

      // ── Executor B (v2)
      updateResult(ev.id, { status: "exec-b" });
      setStage(`Eval ${ev.id}: executing v2…`);
      let transcriptB;
      try {
        transcriptB = await callClaudeMd(
          EXECUTOR_SYSTEM,
          `${v2Context}\n\n---\n\nTest prompt:\n${ev.prompt}`,
          HAIKU, 8000
        );
        updateResult(ev.id, { transcriptB });
      } catch (e) {
        updateResult(ev.id, { status: "error", transcriptB: `**Error:** ${e.message}` });
        continue;
      }

      // ── Comparator (blind)
      updateResult(ev.id, { status: "comparing" });
      setStage(`Eval ${ev.id}: comparing…`);
      try {
        const comparison = await callClaudeJson(
          COMPARATOR_SYSTEM,
          `Test prompt: ${ev.prompt}\n\nTranscript A:\n${transcriptA}\n\nTranscript B:\n${transcriptB}`,
          SONNET, 8000
        );
        updateResult(ev.id, { comparison, status: "done" });
        allResults.push({ name: ev.name, prompt: ev.prompt, transcriptA, transcriptB, comparison });
      } catch (e) {
        updateResult(ev.id, { status: "error" });
      }
    }

    // ── Analyzer
    if (allResults.length > 0) {
      setStage("Analysing results…");
      try {
        const md = await callClaudeMd(
          ANALYZER_SYSTEM,
          `Skill A (v1) — "${v1.name}":\n\n${v1.skillMd}\n\n---\n\nSkill B (v2) — "${v2.name}":\n\n${v2.skillMd}\n\n---\n\nComparison results:\n${JSON.stringify(allResults.map(r => ({ name: r.name, prompt: r.prompt, comparison: r.comparison })), null, 2)}\n\nFull transcripts:\n${allResults.map(r => `### ${r.name}\n\nA:\n${r.transcriptA}\n\nB:\n${r.transcriptB}`).join("\n\n---\n\n")}`,
          SONNET, 8000
        );
        setAnalyzerMd(md);
      } catch (e) {
        setError("Analyzer failed: " + e.message);
      }
    }

    setStage("");
    setRunning(false);
  }

  function copyReport() {
    const doneResults = results.filter(r => r.comparison);
    const lines = [
      `# Skill Comparison: ${v1?.name} vs ${v2?.name}`,
      "",
      ...doneResults.map(r => {
        const c = r.comparison;
        return [
          `## ${r.name}`,
          `Winner: **${c.winner}**`,
          `Reasoning: ${c.reasoning}`,
          `Scores — A: ${c.rubric?.A?.overall_score ?? "—"} | B: ${c.rubric?.B?.overall_score ?? "—"}`,
          ""
        ].join("\n");
      }),
      analyzerMd
    ].join("\n");

    (navigator.clipboard?.writeText(lines) ?? Promise.reject()).catch(() => {
      const ta = document.createElement("textarea"); ta.value = lines;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    });
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  }

  // ── Derived
  const bothLoaded  = v1 && v2;
  const allDone     = results.length > 0 && results.every(r => r.status === "done" || r.status === "error");
  const aWins       = results.filter(r => r.comparison?.winner === "A").length;
  const bWins       = results.filter(r => r.comparison?.winner === "B").length;
  const ties        = results.filter(r => r.comparison?.winner === "TIE").length;
  const overallWinner = allDone && results.length > 0
    ? aWins > bWins ? "v1" : bWins > aWins ? "v2" : "TIE"
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--color-bg-base); }
        .wrap {
          --color-bg-base: #141413;
          --color-bg-surface: #1a1917;
          --color-bg-raised: #1e1d1b;
          --color-bg-overlay: #2d2c2a;
          --color-text-primary: #ebebeb;
          --color-text-body: #d2d0c8;
          --color-text-secondary: #b0aea5;
          --color-text-muted: #908e85;
          --color-text-faint: #706e65;
          --color-border-default: #2d2c2a;
          --color-border-emphasis: #3d3c3a;
          --color-accent-primary: #d97757;
          --color-accent-primary-hover: #c9673f;
          --color-accent-on-primary: #ebebeb;
          --color-status-positive-bg: #1e2418;
          --color-status-positive-border: #3a5a28;
          --color-status-positive-text: #b0d080;
          --color-status-negative-bg: #2a2418;
          --color-status-negative-border: #5a4a28;
          --color-status-negative-text: #d4a060;
          --color-status-caution-bg: #2a2010;
          --color-status-caution-border: #8a6a2a;
          --color-status-caution-text: #d4a84a;
          --color-state-yes-bg: #2d3d20;
          --color-state-yes-border: #788c5d;
          --color-state-yes-text: #b0d080;
          --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px; --space-8: 32px;
          --font-size-caption: 12px;
          --font-size-interaction: 14px;
          --font-size-body: 16px;
          --font-size-heading: 18px;
          --line-height-compact: 20px;
          --line-height-reading: 24px;
          --font-weight-medium: 500;
          --font-weight-semibold: 600;
          --radius-interactive: 8px;
          --radius-container: 12px;
          --duration-fast: 100ms;
          --duration-normal: 150ms;
          --ease-out: cubic-bezier(0.2, 0, 0, 1);
          --ease-press: cubic-bezier(0.2, 0, 0.2, 1);
          font-family: 'Plus Jakarta Sans', Arial, sans-serif;
          font-optical-sizing: auto;
          background: var(--color-bg-base);
          min-height: 100vh;
          padding: var(--space-4);
        }
        .inner { max-width: 640px; margin: 0 auto; padding: var(--space-2) 0 var(--space-8); }

        .header { background: var(--color-accent-primary); border-radius: var(--radius-container); padding: 16px 20px; margin-bottom: var(--space-4); }
        .header-title { font-size: var(--font-size-heading); font-weight: var(--font-weight-semibold); color: var(--color-accent-on-primary); letter-spacing: -0.01em; line-height: var(--line-height-compact); margin-bottom: var(--space-1); }
        .header-sub { font-size: var(--font-size-caption); color: rgba(235,235,235,0.65); line-height: var(--line-height-compact); }

        .slot-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4); }
        .slot { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-container); padding: var(--space-4); }
        .slot.loaded { border-color: var(--color-status-positive-border); }
        .slot.error  { border-color: var(--color-status-negative-border); }
        .slot-label { font-size: var(--font-size-caption); font-weight: var(--font-weight-semibold); color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: var(--space-3); }
        .slot-label span { color: var(--color-accent-primary); }

        .drop-zone { border: 1.5px dashed var(--color-border-default); border-radius: var(--radius-interactive); padding: 24px var(--space-4); text-align: center; cursor: pointer; transition: background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); background: var(--color-bg-base); user-select: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); }
        .drop-zone:hover, .drop-zone.drag { border-color: var(--color-accent-primary); background: var(--color-bg-surface); }
        .drop-zone:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
        .drop-text { font-size: var(--font-size-interaction); color: var(--color-text-muted); }
        .drop-hint { font-size: var(--font-size-caption); color: var(--color-text-faint); margin-top: 2px; }

        .skill-loaded { display: flex; align-items: center; gap: var(--space-2); }
        .skill-loaded-name { font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); color: var(--color-text-primary); font-family: 'Courier New', monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .skill-loaded-clear { font-size: var(--font-size-caption); color: var(--color-text-faint); cursor: pointer; flex-shrink: 0; padding: 8px; min-height: 48px; min-width: 48px; display: flex; align-items: center; justify-content: center; }
        .skill-loaded-clear:hover { color: var(--color-status-negative-text); }
        .skill-loaded-meta { font-size: var(--font-size-caption); color: var(--color-text-faint); margin-top: var(--space-1); }

        .loading-pill { font-size: var(--font-size-caption); color: var(--color-accent-primary); display: flex; align-items: center; gap: var(--space-2); }
        .spinner { width: 12px; height: 12px; border: 2px solid var(--color-border-default); border-top-color: var(--color-accent-primary); border-radius: 50%; animation: spin 0.75s linear infinite; flex-shrink: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .run-btn { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); font-weight: var(--font-weight-semibold); padding: 15px 0 17px; min-height: 48px; width: 100%; border-radius: var(--radius-interactive); border: none; background: var(--color-accent-primary); color: var(--color-accent-on-primary); cursor: pointer; transition: transform var(--duration-fast) var(--ease-press), opacity var(--duration-normal) var(--ease-out), background-color var(--duration-normal) var(--ease-out); display: block; margin-bottom: var(--space-4); -webkit-tap-highlight-color: transparent; }
        .run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .run-btn:active:not(:disabled) { transform: scale(0.97); }
        .run-btn:hover:not(:disabled) { background: var(--color-accent-primary-hover); }
        .run-btn:focus-visible { outline: 2px solid var(--color-text-primary); outline-offset: 2px; }
        .run-btn.ghost { background: transparent; border: 0.5px solid var(--color-border-default); color: var(--color-text-muted); font-weight: var(--font-weight-medium); }
        .run-btn.ghost:hover:not(:disabled) { background: var(--color-bg-raised); color: var(--color-text-secondary); }

        .stage-label { font-size: var(--font-size-caption); color: var(--color-accent-primary); margin-bottom: var(--space-4); display: flex; align-items: center; gap: var(--space-2); }

        .verdict-bar { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); padding: var(--space-4); margin-bottom: var(--space-4); display: flex; align-items: center; justify-content: space-between; }
        .verdict-label { font-size: var(--font-size-caption); color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: var(--space-1); }
        .verdict-detail { font-size: var(--font-size-caption); color: var(--color-text-faint); }
        .verdict-winner { font-size: 20px; font-weight: var(--font-weight-semibold); }
        .verdict-winner.v1 { color: var(--color-status-positive-text); }
        .verdict-winner.v2 { color: var(--color-status-caution-text); }
        .verdict-winner.TIE { color: var(--color-status-caution-text); }

        .result-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
        .result-card { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); overflow: hidden; transition: border-color var(--duration-normal) var(--ease-out); }
        .result-card.done { border-color: #2a3a50; }
        .result-card.error { border-color: var(--color-status-negative-border); }
        .result-card.exec-a, .result-card.exec-b, .result-card.comparing { border-color: var(--color-status-caution-border); }
        .result-head { padding: 12px var(--space-4); min-height: 48px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .result-name { font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); }
        .result-badge { font-size: var(--font-size-caption); font-weight: var(--font-weight-semibold); padding: 3px 8px 5px; border-radius: 4px; letter-spacing: 0.03em; white-space: nowrap; }
        .result-badge.idle      { background: var(--color-bg-raised); color: var(--color-text-faint); }
        .result-badge.exec-a    { background: var(--color-status-caution-bg); color: var(--color-status-caution-text); }
        .result-badge.exec-b    { background: var(--color-status-positive-bg); color: var(--color-status-positive-text); }
        .result-badge.comparing { background: var(--color-status-caution-bg); color: var(--color-status-caution-text); }
        .result-badge.done.A    { background: #1e2d18; color: var(--color-status-positive-text); }
        .result-badge.done.B    { background: var(--color-status-caution-bg); color: var(--color-status-caution-text); }
        .result-badge.done.TIE  { background: #2a2510; color: var(--color-status-caution-text); }
        .result-badge.error     { background: var(--color-status-negative-bg); color: var(--color-status-negative-text); }
        .result-body { padding: 0 var(--space-4) 12px; border-top: 0.5px solid var(--color-border-default); }
        .result-prompt { font-size: var(--font-size-caption); color: var(--color-text-muted); margin: var(--space-3) 0; line-height: var(--line-height-reading); }

        .scores-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-3); }
        .score-card { background: var(--color-bg-base); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); padding: 12px var(--space-3); }
        .score-card-label { font-size: var(--font-size-caption); font-weight: var(--font-weight-semibold); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-faint); margin-bottom: var(--space-2); }
        .score-card-label.A { color: var(--color-status-positive-text); }
        .score-card-label.B { color: var(--color-status-caution-text); }
        .score-overall { font-size: 20px; font-weight: var(--font-weight-semibold); color: var(--color-text-primary); margin-bottom: var(--space-1); }
        .score-breakdown { font-size: var(--font-size-caption); color: var(--color-text-faint); line-height: var(--line-height-reading); }
        .strength-list, .weakness-list { font-size: var(--font-size-caption); line-height: var(--line-height-reading); margin-top: var(--space-1); }
        .strength-list { color: #7a9a60; }
        .weakness-list { color: #8a5050; }

        .reasoning-box { font-size: var(--font-size-caption); color: var(--color-text-secondary); line-height: var(--line-height-reading); background: var(--color-bg-base); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); padding: var(--space-3); margin-bottom: var(--space-2); }

        .transcript-toggle { font-size: var(--font-size-caption); color: var(--color-border-emphasis); cursor: pointer; user-select: none; margin-top: var(--space-1); }
        .transcript-toggle:hover { color: var(--color-text-faint); }
        .transcript-block { font-family: 'Courier New', monospace; font-size: var(--font-size-caption); color: var(--color-text-muted); line-height: var(--line-height-reading); white-space: pre-wrap; word-break: break-word; background: var(--color-bg-base); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); padding: var(--space-3); margin-top: var(--space-2); max-height: 260px; overflow-y: auto; }

        .analyzer-card { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-container); padding: var(--space-4); margin-top: var(--space-2); }
        .analyzer-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
        .out-label { font-size: var(--font-size-caption); font-weight: var(--font-weight-medium); color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.07em; line-height: var(--line-height-compact); }
        .copy-btn { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); padding: 11px 16px 13px; min-height: 48px; border-radius: var(--radius-interactive); border: 0.5px solid var(--color-border-default); background: var(--color-bg-raised); color: var(--color-text-secondary); cursor: pointer; transition: color var(--duration-normal) var(--ease-out), background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); }
        .copy-btn.ok { background: var(--color-state-yes-bg); border-color: var(--color-state-yes-border); color: var(--color-state-yes-text); }
        .copy-btn:hover:not(.ok) { border-color: var(--color-border-emphasis); color: var(--color-text-body); }
        .copy-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
        .md-block { font-family: 'Courier New', monospace; font-size: var(--font-size-caption); color: var(--color-text-secondary); line-height: var(--line-height-reading); white-space: pre-wrap; word-break: break-word; background: var(--color-bg-base); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); padding: var(--space-4); max-height: 600px; overflow-y: auto; }

        .error-box { margin: 0 0 var(--space-4); padding: 11px 16px 13px; background: var(--color-status-negative-bg); border: 0.5px solid var(--color-status-negative-border); border-radius: var(--radius-interactive); font-size: var(--font-size-interaction); line-height: var(--line-height-compact); color: var(--color-status-negative-text); }
        .load-error { font-size: var(--font-size-caption); color: var(--color-status-negative-text); margin-top: var(--space-2); }

        .nav-attr { display: flex; justify-content: center; align-items: center; gap: var(--space-1); padding: var(--space-4) var(--space-4) 0; margin-top: var(--space-8); font-size: var(--font-size-caption); color: var(--color-text-faint); border-top: 0.5px solid var(--color-border-default); }
        .nav-attr-link { color: var(--color-accent-primary); opacity: 0.65; text-decoration: none; transition: opacity var(--duration-normal) var(--ease-out); cursor: pointer; padding: 8px 4px; min-height: 36px; display: inline-flex; align-items: center; }
        .nav-attr-link:hover { opacity: 1; }

        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @media (prefers-reduced-motion: no-preference) {
          .fade-up { animation: fadeUp 0.2s cubic-bezier(0.05, 0.7, 0.1, 1); }
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
        }
        @media (max-width: 520px) {
          .slot-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="wrap">
        <div className="inner">

          <div className="header">
            <div className="header-title">Skill Comparator</div>
            <div className="header-sub">Upload v1 and v2 of your .skill file. Copy the analysis and paste it back to Claude.</div>
          </div>

          {/* ── Upload slots ── */}
          <div className="slot-row">
            {[
              { key: "v1", label: "V1", state: v1, loading: loadingV1, ref: v1Ref, color: "#9ab870" },
              { key: "v2", label: "V2", state: v2, loading: loadingV2, ref: v2Ref, color: "#d9a050" }
            ].map(({ key, label, state, loading, ref, color }) => (
              <div key={key} className={`slot${state ? " loaded" : ""}`}>
                <div className="slot-label">Skill <span style={{ color }}>{label}</span> — {key === "v1" ? "original" : "iterated"}</div>
                {loading ? (
                  <div className="loading-pill"><div className="spinner" />Loading…</div>
                ) : state ? (
                  <>
                    <div className="skill-loaded">
                      <div className="skill-loaded-name">{state.name}</div>
                      <div className="skill-loaded-clear" onClick={() => key === "v1" ? setV1(null) : setV2(null)}>✕</div>
                    </div>
                    <div className="skill-loaded-meta">
                      {state.evals ? `${state.evals.evals?.length || 0} evals` : "no evals"} · {Object.keys(state.refs).length} refs
                    </div>
                  </>
                ) : (
                  <div
                    className="drop-zone"
                    onClick={() => ref.current?.click()}
                    onDragOver={e => { e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadSlot(f, key); }}
                  >
                    <FileUp size={28} strokeWidth={1.25} style={{color:"var(--color-text-faint)",marginBottom:"var(--space-2)"}} />
                    <div className="drop-text">Drop .skill or click</div>
                    <div className="drop-hint">.skill zip archive</div>
                    <input ref={ref} type="file" accept=".skill" style={{ display: "none" }}
                      onChange={e => { if (e.target.files[0]) loadSlot(e.target.files[0], key); }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {loadError && <div className="error-box">{loadError}</div>}

          {/* ── Evals warning ── */}
          {v1 && !v1.evals && (
            <div className="error-box">v1 has no evals/evals.json — add evals to your .skill file before comparing.</div>
          )}

          {/* ── Run button ── */}
          {bothLoaded && v1.evals && !running && !allDone && (
            <button className="run-btn" onClick={runComparison}>
              Run Comparison →
            </button>
          )}

          {running && stage && (
            <div className="stage-label"><div className="spinner" />{stage}</div>
          )}

          {error && <div className="error-box">{error}</div>}

          {/* ── Overall verdict ── */}
          {allDone && overallWinner && (
            <div className="verdict-bar fade-up">
              <div>
                <div className="verdict-label">Overall verdict</div>
                <div className="verdict-detail">
                  {aWins} eval{aWins !== 1 ? "s" : ""} → v1 &nbsp;·&nbsp;
                  {bWins} eval{bWins !== 1 ? "s" : ""} → v2 &nbsp;·&nbsp;
                  {ties} tie{ties !== 1 ? "s" : ""}
                </div>
              </div>
              <div className={`verdict-winner ${overallWinner}`}>
                {overallWinner === "TIE" ? "TIE" : `${overallWinner} wins`}
              </div>
            </div>
          )}

          {/* ── Result cards ── */}
          {results.length > 0 && (
            <div className="result-list">
              {results.map(r => <ResultCard key={r.id} r={r} v1name={v1?.name} v2name={v2?.name} />)}
            </div>
          )}

          {/* ── Analyzer ── */}
          {analyzerMd && (
            <div className="analyzer-card fade-up">
              <div className="analyzer-head">
                <span className="out-label">Analysis — paste back to Claude</span>
                <button className={`copy-btn${copied ? " ok" : ""}`} onClick={copyReport}>
                  {copied ? "Copied ✓" : "Copy Report"}
                </button>
              </div>
              <div className="md-block">{analyzerMd}</div>
            </div>
          )}

          {/* ── Reset ── */}
          {(v1 || v2 || results.length > 0) && (
            <button className="run-btn ghost" style={{ marginTop: "0.5rem" }}
              onClick={() => { setV1(null); setV2(null); setResults([]); setAnalyzerMd(""); setError(""); setLoadError(""); }}>
              ← Start over
            </button>
          )}

          <div className="nav-attr">
            <a className="nav-attr-link" href="https://claude.ai/public/artifacts/a6f41506-53ad-4753-a2f1-2e90ad2fcbbd" target="_blank" rel="noopener noreferrer">Unusual Claude Showcase</a>
            <span style={{opacity:0.3}}> · </span>
            <a className="nav-attr-link" href="https://github.com/elb-pr" target="_blank" rel="noopener noreferrer">elb-pr</a>
          </div>

        </div>
      </div>
    </>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ r, v1name, v2name }) {
  const [open, setOpen]     = useState(false);
  const [showA, setShowA]   = useState(false);
  const [showB, setShowB]   = useState(false);
  const c = r.comparison;
  const winner = c?.winner;

  const badgeLabel = {
    idle:       "—",
    "exec-a":   `Executing ${v1name || "v1"}…`,
    "exec-b":   `Executing ${v2name || "v2"}…`,
    comparing:  "Comparing…",
    done:       winner ? `${winner === "A" ? (v1name || "v1") : winner === "B" ? (v2name || "v2") : "TIE"} wins` : "Done",
    error:      "Error"
  }[r.status] || "—";

  const badgeClass = r.status === "done" ? `done ${winner}` : r.status;

  return (
    <div className={`result-card ${r.status}`}>
      <div className="result-head" onClick={() => setOpen(o => !o)}>
        <div className="result-name">{r.name}</div>
        <span className={`result-badge ${badgeClass}`}>{badgeLabel}</span>
      </div>

      {open && (
        <div className="result-body">
          <div className="result-prompt">{r.prompt}</div>

          {c && (
            <>
              <div className="reasoning-box">{c.reasoning}</div>
              <div className="scores-row">
                {["A", "B"].map(side => {
                  const q = c.output_quality?.[side];
                  const rb = c.rubric?.[side];
                  const label = side === "A" ? (v1name || "v1") : (v2name || "v2");
                  return (
                    <div key={side} className="score-card">
                      <div className={`score-card-label ${side}`}>{label} ({side}){winner === side ? " ✓" : ""}</div>
                      <div className="score-overall">{q?.score ?? rb?.overall_score ?? "—"}<span style={{ fontSize: 11, color: "#6a6860" }}>/10</span></div>
                      <div className="score-breakdown">
                        Content: {rb?.content_score?.toFixed(1) ?? "—"} · Structure: {rb?.structure_score?.toFixed(1) ?? "—"}
                      </div>
                      {q?.strengths?.length > 0 && (
                        <div className="strength-list">{q.strengths.map((s, i) => <div key={i}>+ {s}</div>)}</div>
                      )}
                      {q?.weaknesses?.length > 0 && (
                        <div className="weakness-list">{q.weaknesses.map((s, i) => <div key={i}>− {s}</div>)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {r.transcriptA && (
            <>
              <div className="transcript-toggle" onClick={() => setShowA(s => !s)}>
                {showA ? "▾" : "▸"} {v1name || "v1"} transcript
              </div>
              {showA && <div className="transcript-block">{r.transcriptA}</div>}
            </>
          )}

          {r.transcriptB && (
            <>
              <div className="transcript-toggle" onClick={() => setShowB(s => !s)}>
                {showB ? "▾" : "▸"} {v2name || "v2"} transcript
              </div>
              {showB && <div className="transcript-block">{r.transcriptB}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
