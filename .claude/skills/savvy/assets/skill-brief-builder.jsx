import { useState, useRef, useEffect } from "react";
import { Info, Atom, Telescope, FileUp } from "lucide-react";

// ─── System prompts (baked in - no placeholders needed) ──────────────────────

const ENHANCE_SYSTEM = `You are an expert at writing Claude skill descriptions that reliably activate through transformer attention mechanics.

Rewrite the provided skill fields using these principles:
- Front-load strong action verbs (primacy zone placement - first tokens get disproportionate attention weight)
- Pack trigger phrases with the exact vocabulary users type: imperative verbs, domain nouns, task-specific jargon
- Write descriptions that are "pushy" enough to prevent undertriggering - Claude has a known bias toward undertriggering
- Use the pattern: "Use this skill whenever [specific context]. Triggers on [keyword list]."
- Output format description should name the concrete artifact: file type, structure, format, not vague outcomes
- Include 2-3 near-miss anti-patterns for triggers (things that look similar but shouldn't fire)

Return ONLY raw JSON, no markdown, no code fences:
{"purpose":"enhanced purpose","triggers":"enhanced trigger description","output":"enhanced output format"}`;

const BRIEF_SYSTEM = `You are generating a skill brief for the Claude savvy workflow.

The brief must match exactly what savvy's Capture Intent phase expects across four dimensions: Purpose, Trigger, Output, Testability.

Description rules (critical):
- Under 1024 characters
- No XML angle brackets
- Must include both WHAT it does AND WHEN to trigger (specific user phrases)
- Pushy style to prevent undertriggering: "Use this skill whenever X. Triggers on Y."
- Front-loaded with action verbs for primacy zone attention

Return ONLY raw JSON, no markdown, no code fences:
{
  "name": "kebab-case-name",
  "purpose": "2-3 sentence purpose: what problem, for whom, what makes it distinct",
  "triggers": ["exact user phrase 1", "exact user phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "antiTriggers": ["similar-looking query that should NOT trigger", "another near-miss", "third near-miss"],
  "outputFormat": "concrete: name the file type, structure, fields - not vague outcomes",
  "needsTestCases": true,
  "testCasesReasoning": "one sentence: objectively verifiable = yes, subjective = no",
  "description": "Full skill description under 1024 chars. Pushy, front-loaded, includes both purpose and trigger phrases."
}`;

const DISCOVERY_SYSTEM = `You are helping someone prepare to build a Claude skill. Your job: identify exactly what documentation, examples, reference files, API docs, sample inputs/outputs, or domain knowledge they need to gather BEFORE writing the skill.

Ask ONE focused, high-value question per turn. Prioritise by information value - only ask if the answer would meaningfully change what to collect.

Return ONLY raw JSON, no markdown, no code fences:
{
  "question": "Your single most valuable next question",
  "collected": ["specific item to gather - cumulative, add new ones each turn"],
  "ready": false
}

Set ready: true only when you can specify all four dimensions clearly: Purpose (specific problem + who), Trigger (exact phrases), Output (concrete format), Testability (verifiable or not). Typically 3-5 questions.

Keep collected items concrete and actionable: "3 example input files showing edge cases" not "examples". "Notion API reference for database queries" not "API docs".`;

const FROM_FILE_SYSTEM = `Extract a skill brief from the provided document. Infer what a Claude skill built from this content would do, when it would trigger, and what it would produce.

Return ONLY raw JSON, no markdown, no code fences:
{
  "name": "kebab-case-name",
  "purpose": "2-3 sentences: what problem this solves, for whom, what makes it distinct",
  "triggers": ["exact user phrase 1", "exact user phrase 2", "phrase 3", "phrase 4", "phrase 5"],
  "antiTriggers": ["similar-looking query that should NOT trigger", "near-miss 2", "near-miss 3"],
  "outputFormat": "concrete: file type, structure, key fields - not vague outcomes",
  "needsTestCases": true,
  "testCasesReasoning": "one sentence: objectively verifiable = yes, subjective = no",
  "description": "Full skill description under 1024 chars. Pushy, front-loaded, includes both purpose and trigger phrases. Pattern: Use this skill whenever X. Triggers on Y."
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-20250514";

async function callClaude(system, messages, maxTokens = 1500) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.filter(b => b.type === "text").map(b => b.text).join("");
}

// Streaming variant with thinking blocks -- used for Extract
async function callClaudeStreaming(system, messages, maxTokens = 5000, onThinking, onText) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: "enabled", budget_tokens: 3000 },
        system,
        messages,
        stream: true,
      })
    });

    if (!res.ok) {
      let msg = "Stream failed";
      try { const e = await res.json(); msg = e.error?.message || msg; } catch {}
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let thinkingText = "";
    let responseText = "";
    let currentType = null;
    let thinkStart = Date.now();
    let stopped = false;

    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") { stopped = true; break; }
        try {
          const evt = JSON.parse(raw);
          if (evt.type === "message_stop") { stopped = true; break; }
          if (evt.type === "error") { throw new Error(evt.error?.message || "Stream error"); }
          if (evt.type === "content_block_start") {
            currentType = evt.content_block?.type;
            if (currentType === "thinking") thinkStart = Date.now();
          }
          if (evt.type === "content_block_delta") {
            if (evt.delta?.type === "thinking_delta") {
              thinkingText += evt.delta.thinking;
              onThinking && onThinking({ text: thinkingText, done: false, elapsed: Math.round((Date.now()-thinkStart)/1000) });
            }
            if (evt.delta?.type === "text_delta") {
              responseText += evt.delta.text;
              onText && onText(responseText);
            }
          }
          if (evt.type === "content_block_stop" && currentType === "thinking") {
            onThinking && onThinking({ text: thinkingText, done: true, elapsed: Math.round((Date.now()-thinkStart)/1000) });
          }
        } catch (parseErr) {
          if (parseErr.message === "Stream error") throw parseErr;
          // Skip unparseable SSE lines (keep-alive, malformed fragments)
        }
      }
    }

    if (!responseText.trim()) throw new Error("Empty response from model");
    return responseText;
  } finally {
    clearTimeout(timeout);
  }
}

// Fallback: non-streaming with thinking (returns text only, simulates thinking via timing)
async function callClaudeWithThinkingFallback(system, messages, maxTokens = 5000, onThinking) {
  const startTime = Date.now();
  onThinking && onThinking({ text: "Analysing document content...", done: false, elapsed: 0 });
  const ticker = setInterval(() => {
    onThinking && onThinking({ text: "Analysing document content...", done: false, elapsed: Math.round((Date.now()-startTime)/1000) });
  }, 1000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const elapsed = Math.round((Date.now()-startTime)/1000);
    onThinking && onThinking({ text: "Analysis complete.", done: true, elapsed });
    return data.content.filter(b => b.type === "text").map(b => b.text).join("");
  } finally {
    clearInterval(ticker);
  }
}

function parseJSON(text) {
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}

function autoGrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

function briefToText(data) {
  return [
    `SKILL: ${data.name || "-"}`,
    `\nPURPOSE\n${data.purpose || "-"}`,
    data.triggers?.length ? `\nTRIGGERS\n${data.triggers.map(t => `• ${t}`).join("\n")}` : "",
    data.antiTriggers?.length ? `\nANTI-TRIGGERS (should NOT trigger)\n${data.antiTriggers.map(t => `• ${t}`).join("\n")}` : "",
    `\nOUTPUT FORMAT\n${data.outputFormat || "-"}`,
    `\nTEST CASES\n${data.needsTestCases ? "✓ Recommended" : "✗ Not needed"} - ${data.testCasesReasoning || ""}`,
    data.description ? `\nSUGGESTED DESCRIPTION (paste to savvy)\n${data.description}` : "",
  ].filter(Boolean).join("\n");
}

// ─── Info tooltip ─────────────────────────────────────────────────────────────

function InfoTooltip({ text }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="info-tip-wrap">
      <button
        type="button"
        className="info-tip-btn"
        aria-label="More information"
        onClick={() => setVisible(v => !v)}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        <Info size={13} strokeWidth={1.25} />
      </button>
      {visible && <span className="info-tip-popup" role="tooltip">{text}</span>}
    </span>
  );
}

// ─── Brief card (shared across tabs) ─────────────────────────────────────────

function BriefCard({ data, copyKey, copied, onCopy }) {
  if (!data) return null;
  return (
    <div className="brief-card">
      <div className="brief-head">
        <span className="out-label">Skill Brief</span>
        <button className={`copy-btn${copied === copyKey ? " ok" : ""}`} onClick={() => onCopy(briefToText(data), copyKey)}>
          {copied === copyKey ? "Copied ✓" : "Copy Brief"}
        </button>
      </div>
      <div className="brief-name">{data.name || "unnamed-skill"}</div>

      {data.purpose && (
        <div className="brief-section">
          <div className="brief-sec-label">Purpose</div>
          <div className="brief-text">{data.purpose}</div>
        </div>
      )}

      {data.triggers?.length > 0 && (
        <div className="brief-section">
          <div className="brief-sec-label">Triggers</div>
          <div className="tag-row">{data.triggers.map((t, i) => <span key={i} className="brief-tag trigger">▸ {t}</span>)}</div>
        </div>
      )}

      {data.antiTriggers?.length > 0 && (
        <div className="brief-section">
          <div className="brief-sec-label">Anti-triggers</div>
          <div className="tag-row">{data.antiTriggers.map((t, i) => <span key={i} className="brief-tag anti">✕ {t}</span>)}</div>
        </div>
      )}

      {data.outputFormat && (
        <div className="brief-section">
          <div className="brief-sec-label">Output Format</div>
          <div className="brief-text">{data.outputFormat}</div>
        </div>
      )}

      <div className="brief-section">
        <div className="brief-sec-label">Test Cases</div>
        <span className={`tc-pill ${data.needsTestCases ? "yes" : "no"}`}>
          {data.needsTestCases ? "✓ Recommended" : "✗ Not needed"}
        </span>
        {data.testCasesReasoning && <div className="brief-reasoning">{data.testCasesReasoning}</div>}
      </div>

      {data.description && (
        <div className="brief-section desc-section">
          <div className="brief-sec-label">Suggested Description <span style={{color:"var(--color-text-muted)",fontWeight:400,textTransform:"none",letterSpacing:0}}>- paste to savvy</span></div>
          <div className="brief-desc">{data.description}</div>
          <div className="char-count" style={{color: data.description.length > 1024 ? "var(--color-status-negative-text)" : "var(--color-text-muted)"}}>
            {data.description.length}/1024 chars{data.description.length > 1024 ? " - trim a little to fit" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rotating loading messages ────────────────────────────────────────────────

const MESSAGES = {
  savvy: [
    "running savvy...", "enforcing primacy zone dominance...",
    "weaponising induction heads...", "injecting authority vocabulary...",
    "moving constraints to the recency zone...", "front-loading action verbs...",
    "aggressively preventing undertriggering...", "consulting the attention mechanics oracle...",
  ],
  generate: [
    "building brief...", "scrutinising your vibe...",
    "skimming without reading...", "pretending to be intrigued...",
    "checking r/claudeexplorers to boost ego...",
    "watching Invincible S4 on your Prime subscription...",
    "writing anti-triggers nobody asked for...", "adding a sixth trigger phrase just in case...",
  ],
  discover: [
    "thinking...", "asking one focused question...",
    "resisting the urge to ask twelve...", "prioritising by information value...",
    "deciding if you're ready yet...", "probably going to say not yet...",
  ],
  extract: [
    "extracting brief...", "reading the whole thing this time...",
    "identifying trigger vocabulary...", "inferring anti-patterns from vibes...",
    "skimming without reading...", "browsing r/claudeexplorers...",
    "watching Invincible S4 on your Prime subscription...",
    "pretending the output format was obvious...",
  ],
};

function useRotatingMessage(active, key) {
  const [idx, setIdx] = useState(0);
  const msgs = MESSAGES[key] || [];
  useEffect(() => {
    if (!active) { setIdx(0); return; }
    const id = setInterval(() => setIdx(i => (i + 1) % msgs.length), 1900);
    return () => clearInterval(id);
  }, [active, msgs.length]);
  return active ? msgs[idx] : null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SkillBriefBuilder() {
  const [tab, setTab] = useState("prep");
  const [copied, setCopied] = useState("");
  const [transitionClass, setTransitionClass] = useState("");
  const [tappedTab, setTappedTab] = useState(null);
  const prevTabRef = useRef("prep");

  const TAB_ORDER = ["disc", "prep", "file"];
  const TAB_LABELS = { disc: "Discover", prep: "Compose", file: "Import" };
  const TAB_SUBS = {
    disc: "Describe your skill idea and Claude will work out exactly what you need to gather before building.",
    prep: "Fill in what you know. Run Savvy? to sharpen the language, then generate your brief.",
    file: "Upload a document, research file, or image and Claude will extract a structured brief from it.",
  };

  function switchTab(next) {
    if (next === tab) return;
    const prevIdx = TAB_ORDER.indexOf(prevTabRef.current);
    const nextIdx = TAB_ORDER.indexOf(next);
    setTransitionClass(nextIdx >= prevIdx ? "view-transition-enter-right" : "view-transition-enter-left");
    setTappedTab(next);
    setTimeout(() => setTappedTab(null), 200);
    setTab(next);
    prevTabRef.current = next;
  }

  // Prep tab
  const [skillName, setSkillName]   = useState("");
  const [purpose, setPurpose]       = useState("");
  const [triggers, setTriggers]     = useState("");
  const [outputFmt, setOutputFmt]   = useState("");
  const [enhancing, setEnhancing]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief]           = useState(null);
  const [prepError, setPrepError]   = useState("");
  const [savvyRan, setSavvyRan]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Discovery tab
  const [discIdea, setDiscIdea]         = useState("");
  const [discHistory, setDiscHistory]   = useState([]);
  const [discCollected, setDiscCollected] = useState([]);
  const [discQuestion, setDiscQuestion] = useState("");
  const [discAnswer, setDiscAnswer]     = useState("");
  const [discReady, setDiscReady]       = useState(false);
  const [discRunning, setDiscRunning]   = useState(false);
  const [discStarted, setDiscStarted]   = useState(false);
  const [discError, setDiscError]       = useState("");

  // From File tab
  const [files, setFiles]         = useState([]);
  const [fileRunning, setFileRunning] = useState(false);
  const [fileProgress, setFileProgress] = useState({ step: 0, total: 0 });
  const [fileThinking, setFileThinking] = useState(null); // {text, done, elapsed}
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [fileBrief, setFileBrief] = useState(null);
  const [fileError, setFileError] = useState("");
  const fileInputRef = useRef(null);
  const [dragging, setDragging]   = useState(false);

  // Rotating loading messages -- must be after all state declarations
  const savvyMsg    = useRotatingMessage(enhancing, "savvy");
  const generateMsg = useRotatingMessage(generating, "generate");
  const discMsg     = useRotatingMessage(discRunning, "discover");
  const fileMsg     = useRotatingMessage(fileRunning, "extract");

  // ── Shared copy
  function copyText(text, key) {
    const write = () => { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); };
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).catch(write);
    setCopied(key);
    setTimeout(() => setCopied(""), 2200);
  }

  // ── Prep tab
  async function enhance() {
    if (!purpose && !triggers && !outputFmt) return;
    setEnhancing(true); setPrepError("");
    try {
      const raw = await callClaude(ENHANCE_SYSTEM, [{
        role: "user",
        content: `Purpose: ${purpose}\nTriggers: ${triggers}\nOutput format: ${outputFmt}`
      }]);
      const p = parseJSON(raw);
      if (p.purpose) setPurpose(p.purpose);
      if (p.triggers) setTriggers(p.triggers);
      if (p.output) setOutputFmt(p.output);
      setSavvyRan(true);
    } catch (e) { setPrepError("Couldn't run Savvy right now - try again in a moment"); }
    finally { setEnhancing(false); }
  }

  async function generateBrief() {
    if (!savvyRan) { setShowConfirm(true); return; }
    await runGenerateBrief();
  }

  async function runGenerateBrief() {
    setShowConfirm(false);
    setGenerating(true); setPrepError(""); setBrief(null);
    try {
      const raw = await callClaude(BRIEF_SYSTEM, [{
        role: "user",
        content: `Name hint: ${skillName || "not provided"}\nPurpose: ${purpose}\nTriggers: ${triggers}\nOutput format: ${outputFmt}\nTest cases: yes`
      }], 2000);
      setBrief(parseJSON(raw));
    } catch (e) { setPrepError("Brief generation paused - " + e.message + ". Worth another try"); }
    finally { setGenerating(false); }
  }

  // ── Discovery tab
  async function startDiscovery() {
    if (!discIdea.trim()) return;
    setDiscRunning(true); setDiscError(""); setDiscStarted(true);
    try {
      const userMsg = `My skill idea: ${discIdea}`;
      const raw = await callClaude(DISCOVERY_SYSTEM, [{ role: "user", content: userMsg }]);
      const p = parseJSON(raw);
      setDiscHistory([{ role: "user", content: userMsg }, { role: "assistant", content: raw }]);
      setDiscQuestion(p.question || "");
      setDiscCollected(p.collected || []);
      setDiscReady(p.ready || false);
    } catch (e) { setDiscError("Discovery hit a snag - " + e.message + ". Try again?"); setDiscStarted(false); }
    finally { setDiscRunning(false); }
  }

  async function answerDiscovery() {
    if (!discAnswer.trim()) return;
    setDiscRunning(true); setDiscError("");
    const newHistory = [...discHistory, { role: "user", content: discAnswer }];
    setDiscAnswer("");
    try {
      const raw = await callClaude(DISCOVERY_SYSTEM, newHistory);
      const p = parseJSON(raw);
      setDiscHistory([...newHistory, { role: "assistant", content: raw }]);
      setDiscQuestion(p.question || "");
      setDiscCollected(p.collected || discCollected);
      setDiscReady(p.ready || false);
    } catch (e) { setDiscError("Lost the thread - " + e.message + ". Try answering again"); }
    finally { setDiscRunning(false); }
  }

  // ── From File tab
  async function processFiles() {
    if (!files.length) return;
    setFileRunning(true); setFileError(""); setFileBrief(null);
    setFileThinking(null); setThinkingOpen(false);
    setFileProgress({ step: 0, total: files.length });
    try {
      const textTypes = ["txt","md","js","jsx","ts","tsx","py","json","yaml","yml","html","css","csv","xml","sh","rb","go","rs","swift","kt","java","c","cpp","h"];
      const contentParts = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setFileProgress({ step: i + 1, total: files.length });
        const ext = f.name.split(".").pop().toLowerCase();

        if (textTypes.includes(ext)) {
          const text = await f.text();
          contentParts.push({ type: "text", text: `File ${i+1} (${f.name}):\n${text.slice(0, 8000)}` });
        } else {
          const b64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(",")[1]);
            r.onerror = () => rej(new Error("Read failed"));
            r.readAsDataURL(f);
          });
          if (ext === "pdf" || f.type === "application/pdf") {
            contentParts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
            contentParts.push({ type: "text", text: `(above is file ${i+1}: ${f.name})` });
          } else if (["png","jpg","jpeg","gif","webp"].includes(ext)) {
            contentParts.push({ type: "image", source: { type: "base64", media_type: f.type || "image/png", data: b64 } });
            contentParts.push({ type: "text", text: `(above is file ${i+1}: ${f.name})` });
          } else {
            throw new Error(`Unsupported file type: ${f.name}`);
          }
        }
      }

      contentParts.push({ type: "text", text: "Extract a single unified skill brief from all the above files." });

      let raw;
      const thinkingCb = (t) => { setFileThinking(t); if (!t.done) setThinkingOpen(true); };
      try {
        raw = await callClaudeStreaming(
          FROM_FILE_SYSTEM,
          [{ role: "user", content: contentParts }],
          5000,
          thinkingCb,
          () => {}
        );
      } catch (streamErr) {
        // Streaming failed - fall back to non-streaming
        console.warn("Streaming failed, falling back:", streamErr.message);
        setFileThinking(null);
        raw = await callClaudeWithThinkingFallback(
          FROM_FILE_SYSTEM,
          [{ role: "user", content: contentParts }],
          5000,
          thinkingCb
        );
      }
      setFileBrief(parseJSON(raw));
    } catch (e) { setFileError("Couldn't process files - " + e.message); }
    finally { setFileRunning(false); setFileProgress({ step: 0, total: 0 }); }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) { setFiles(f => [...f, ...dropped]); setFileBrief(null); }
  }

  // Bundle all state+handlers for TabContent
  const tabProps = {
    skillName, setSkillName, purpose, setPurpose, triggers, setTriggers,
    outputFmt, setOutputFmt, enhancing, generating,
    savvyMsg, generateMsg, enhance, generateBrief, prepError, brief, copied, copyText,
    discStarted, discIdea, setDiscIdea, discRunning, discError, startDiscovery,
    discCollected, discReady, discQuestion, discAnswer, setDiscAnswer, answerDiscovery, discMsg,
    dragging, setDragging, fileInputRef, setFiles, setFileBrief, files, fileError,
    fileRunning, fileProgress, fileMsg, processFiles, fileBrief, handleDrop,
    fileThinking, thinkingOpen, setThinkingOpen,
  };

  // ── Render
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--color-bg-base); }
        .wrap {
          /* ── Tier 2: Semantic Tokens ── */
          /* Surfaces */
          --color-bg-base: #141413;
          --color-bg-surface: #1a1917;
          --color-bg-raised: #1e1d1b;
          --color-bg-overlay: #2d2c2a;
          /* Text */
          --color-text-primary: #ebebeb;
          --color-text-body: #d2d0c8;
          --color-text-secondary: #b0aea5;
          --color-text-muted: #908e85;
          --color-text-faint: #706e65;
          /* Borders */
          --color-border-default: #2d2c2a;
          --color-border-emphasis: #3d3c3a;
          /* Accent */
          --color-accent-primary: #d97757;
          --color-accent-primary-hover: #c9673f;
          --color-accent-on-primary: #ebebeb;
          /* Status: trigger (blue - chroma reduced x0.75 for H-K at H≈260°) */
          --color-status-trigger-bg: #182838;
          --color-status-trigger-border: #2e5878;
          --color-status-trigger-text: #8cb8d0;
          /* Status: anti-trigger / caution (amber) */
          --color-status-caution-bg: #2a2010;
          --color-status-caution-border: #8a6a2a;
          --color-status-caution-text: #d4a84a;
          /* Status: positive */
          --color-status-positive-bg: #1e2418;
          --color-status-positive-border: #3a5a28;
          --color-status-positive-text: #b0d080;
          /* Status: negative - warm amber, not aggressive red (emotional-design: reduce visual intensity at error moments) */
          --color-status-negative-bg: #2a2418;
          --color-status-negative-border: #5a4a28;
          --color-status-negative-text: #d4a060;
          /* State: yes toggle */
          --color-state-yes-bg: #2d3d20;
          --color-state-yes-border: #788c5d;
          --color-state-yes-text: #b0d080;
          /* State: no toggle */
          --color-state-no-bg: #2d2320;
          --color-state-no-border: #7d5040;
          --color-state-no-text: #d09070;

          /* Spacing (4px base grid) */
          --space-1: 4px;
          --space-2: 8px;
          --space-3: 12px;
          --space-4: 16px;
          --space-6: 24px;
          --space-8: 32px;
          --space-12: 48px;

          /* Typography */
          --font-size-caption: 12px;
          --font-size-interaction: 14px;
          --font-size-body: 16px;
          --font-size-heading: 18px;
          --font-size-icon: 20px; /* compensated for dark mode irradiation (Material grade: -25 equivalent) */
          --line-height-compact: 20px;
          --line-height-reading: 24px;
          --font-weight-normal: 500;
          --font-weight-medium: 500;
          --font-weight-semibold: 600;

          /* Radius */
          --radius-interactive: 8px;
          --radius-container: 12px;
          --radius-pill: 20px;

          /* Elevation (tonal - dark mode first, shadows invisible) */
          --elevation-base: var(--color-bg-base);
          --elevation-surface: var(--color-bg-surface);
          --elevation-raised: var(--color-bg-raised);
          --elevation-overlay: var(--color-bg-overlay);

          /* Motion (functional only - feedback, state transition) */
          --duration-fast: 100ms;
          --duration-normal: 150ms;
          --duration-enter: 200ms;
          --duration-exit: 150ms;
          --ease-out: cubic-bezier(0.2, 0, 0, 1);
          --ease-enter: cubic-bezier(0.05, 0.7, 0.1, 1);
          --ease-press: cubic-bezier(0.2, 0, 0.2, 1);

          font-family: 'Plus Jakarta Sans', Arial, sans-serif;
          font-optical-sizing: auto;
          background: var(--color-bg-base);
          min-height: 100vh;
          padding: var(--space-4);
        }
        .inner { max-width: 640px; margin: 0 auto; padding: var(--space-2) 0 calc(72px + var(--space-8)); }

        .header { background: var(--color-accent-primary); border-radius: var(--radius-container); padding: 16px 20px; margin-bottom: var(--space-4); }
        .header-title { font-size: var(--font-size-heading); font-weight: var(--font-weight-semibold); color: var(--color-accent-on-primary); letter-spacing: -0.01em; line-height: var(--line-height-compact); margin-bottom: var(--space-1); }
        .header-sub { font-size: var(--font-size-caption); color: rgba(235,235,235,0.65); line-height: var(--line-height-compact); }

        /* ── Entrance animations (matched to Reverse Recruit system) ── */
        .tab-viewport { position: relative; }
        .rise { animation: rise 0.65s cubic-bezier(0.16, 1, 0.3, 1) both; opacity: 0; transform: translateY(20px); }
        @keyframes rise { to { opacity: 1; transform: translateY(0); } }
        .rd1 { animation-delay: 50ms; }
        .rd2 { animation-delay: 110ms; }
        .rd3 { animation-delay: 170ms; }
        .rd4 { animation-delay: 230ms; }
        .rd5 { animation-delay: 290ms; }
        .view-transition-enter-right { animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .view-transition-enter-left  { animation: slideInLeft  0.35s cubic-bezier(0.16, 1, 0.3, 1) both; }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInLeft  { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes tabTap { 0% { transform: scale(1); } 50% { transform: scale(0.92); } 100% { transform: scale(1); } }
        .tab-tap { animation: tabTap 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .rise, .view-transition-enter-right, .view-transition-enter-left { animation: none !important; opacity: 1; transform: none; }
          .tab-tap { animation: none !important; }
        }

        /* Bottom nav - fixed, thumb zone, Hoober 2013 N=1333: 75% one-handed, comfortable zone bottom 2/3 */
        .tabs { position: fixed; bottom: 0; left: 0; right: 0; display: flex; flex-direction: column; background: var(--color-bg-surface); border-top: 0.5px solid var(--color-border-default); z-index: 50; padding-bottom: env(safe-area-inset-bottom, 0px); }
        .nav-attr { display: flex; justify-content: center; align-items: center; gap: var(--space-1); padding: 0 var(--space-4); font-size: var(--font-size-caption); color: var(--color-text-faint); border-bottom: 0.5px solid var(--color-border-default); }
        .nav-attr-link { color: var(--color-accent-primary); opacity: 0.65; text-decoration: none; transition: opacity var(--duration-normal) var(--ease-out); cursor: pointer; padding: 8px 4px; min-height: 36px; display: inline-flex; align-items: center; }
        .nav-attr-link:hover { opacity: 1; }
        .tabs-inner { display: flex; width: 100%; max-width: 640px; margin: 0 auto; padding: 0 var(--space-4); }
        .tab-btn { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); flex: 1; padding: 14px 8px 16px; min-height: 56px; border-radius: 0; border: none; border-top: 2px solid transparent; background: transparent; color: var(--color-text-faint); cursor: pointer; transition: color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); white-space: nowrap; }
        .tab-btn.active { color: var(--color-accent-primary); border-top-color: var(--color-accent-primary); font-weight: var(--font-weight-semibold); }
        .tab-btn-center { display: flex; flex-direction: column; align-items: center; gap: 3px; padding-top: 10px; padding-bottom: 12px; }
        .tab-btn-center span { font-size: var(--font-size-caption); line-height: 1; }
        .tab-btn:hover:not(.active) { color: var(--color-text-muted); }
        .tab-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: -2px; }

        .field { margin-bottom: var(--space-4); position: relative; }
        .field-label { font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); line-height: var(--line-height-compact); margin-bottom: var(--space-2); display: flex; justify-content: space-between; align-items: center; }
        /* Placeholder-as-label: meets 4.5:1 AA on surface bg (accessibility-design: placeholder MUST meet full contrast) */
        .field-input::placeholder { color: var(--color-text-muted); opacity: 0.8; font-weight: 400; }
        /* Info icon overlay: floats top-right inside the field box */
        .field-info { position: absolute; top: 10px; right: 10px; z-index: 2; }
        .info-tip-wrap { position: relative; display: inline-flex; align-items: center; }
        /* Touch target: visual icon 13px, tap area 48px via padding + negative margin (Apple HIG / Material minimum) */
        .info-tip-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; background: transparent; color: var(--color-text-faint); cursor: pointer; padding: 14px; margin: -14px; box-sizing: content-box; border-radius: 4px; transition: color var(--duration-normal) var(--ease-out); flex-shrink: 0; }
        .info-tip-btn:hover { color: var(--color-text-muted); }
        .info-tip-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
        /* Tooltip: max-width + white-space wrap prevents viewport clipping on narrow mobile */
        .info-tip-popup { position: absolute; right: 0; left: auto; bottom: calc(100% + 6px); background: var(--color-bg-overlay); border: 0.5px solid var(--color-border-emphasis); border-radius: var(--radius-interactive); padding: 8px 12px 10px; font-size: var(--font-size-caption); color: var(--color-text-secondary); white-space: normal; max-width: 200px; width: max-content; z-index: 10; pointer-events: none; line-height: var(--line-height-compact); font-weight: var(--font-weight-normal); }
        .field-input { width: 100%; font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); padding: 12px 36px 12px 16px; border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); background: var(--color-bg-surface); color: var(--color-text-body); line-height: var(--line-height-reading); letter-spacing: 0.01em; resize: none; overflow: hidden; outline: none; transition: border-color var(--duration-normal) var(--ease-out); }
        .field-input:focus { border-color: var(--color-accent-primary); outline: 2px solid var(--color-accent-primary); outline-offset: 1px; }
        input.field-input { resize: none; padding-right: 36px; }

        .tc-row { display: flex; gap: var(--space-2); }
        .tc-opt { flex: 1; padding: 11px 12px 13px; min-height: 48px; border-radius: var(--radius-interactive); border: 0.5px solid var(--color-border-emphasis); background: var(--color-bg-overlay); color: var(--color-text-muted); font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); cursor: pointer; text-align: center; transition: color var(--duration-normal) var(--ease-out), background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); line-height: var(--line-height-compact); }
        .tc-opt.yes { background: var(--color-state-yes-bg); border-color: var(--color-state-yes-border); color: var(--color-state-yes-text); }
        .tc-opt.no  { background: var(--color-state-no-bg); border-color: var(--color-state-no-border); color: var(--color-state-no-text); }
        .tc-opt:hover:not(.yes):not(.no) { border-color: var(--color-border-emphasis); color: var(--color-text-secondary); }
        .tc-opt:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }

        .btn-row { display: flex; gap: var(--space-2); margin-top: var(--space-6); }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; padding: var(--space-4); }
        .modal { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-emphasis); border-top: 2px solid var(--color-accent-primary); border-radius: var(--radius-container); padding: var(--space-6); max-width: 400px; width: 100%; }
        .modal-title { font-size: var(--font-size-heading); font-weight: var(--font-weight-semibold); color: var(--color-text-primary); margin-bottom: var(--space-3); letter-spacing: -0.01em; line-height: var(--line-height-compact); }
        .modal-body { font-size: var(--font-size-interaction); color: var(--color-text-secondary); line-height: var(--line-height-reading); margin-bottom: var(--space-6); }
        .modal-actions { display: flex; gap: var(--space-2); }
        .run-btn { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); font-weight: var(--font-weight-semibold); padding: 15px 0 17px; min-height: 48px; flex: 2; border-radius: var(--radius-interactive); border: none; background: var(--color-accent-primary); color: var(--color-accent-on-primary); cursor: pointer; transition: transform var(--duration-fast) var(--ease-press), opacity var(--duration-normal) var(--ease-out), background-color var(--duration-normal) var(--ease-out); -webkit-tap-highlight-color: transparent; }
        .run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .run-btn:active:not(:disabled) { transform: scale(0.97); }
        .run-btn:hover:not(:disabled) { background: var(--color-accent-primary-hover); }
        .run-btn:focus-visible { outline: 2px solid var(--color-text-primary); outline-offset: 2px; }
        .run-btn.ghost { flex: 1; background: transparent; border: 0.5px solid var(--color-border-default); color: var(--color-text-muted); font-weight: var(--font-weight-medium); }
        .run-btn.ghost:hover:not(:disabled) { background: var(--color-bg-raised); color: var(--color-text-secondary); }
        .run-btn.full { display: block; width: 100%; }

        .error { margin: 0 0 var(--space-4); padding: 11px 16px 13px; background: var(--color-status-negative-bg); border: 0.5px solid var(--color-status-negative-border); border-radius: var(--radius-interactive); font-size: var(--font-size-interaction); line-height: var(--line-height-compact); color: var(--color-status-negative-text); }

        .out-label { font-size: var(--font-size-caption); font-weight: var(--font-weight-medium); color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.07em; line-height: var(--line-height-compact); }
        .copy-btn { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); padding: 11px 16px 13px; min-height: 48px; border-radius: var(--radius-interactive); border: 0.5px solid var(--color-border-default); background: var(--color-bg-raised); color: var(--color-text-secondary); cursor: pointer; transition: color var(--duration-normal) var(--ease-out), background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); }
        .copy-btn.ok { background: var(--color-state-yes-bg); border-color: var(--color-state-yes-border); color: var(--color-state-yes-text); }
        .copy-btn:hover:not(.ok) { border-color: var(--color-border-emphasis); color: var(--color-text-body); }
        .copy-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }

        /* Brief card */
        .brief-card { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-top: 2px solid var(--color-accent-primary); border-radius: var(--radius-container); padding: var(--space-6); margin-top: var(--space-8); }
        @media (prefers-reduced-motion: no-preference) {
          .brief-card { animation: fadeUp var(--duration-enter) var(--ease-enter); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
        }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .brief-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
        .brief-name { font-size: var(--font-size-heading); font-weight: var(--font-weight-semibold); color: var(--color-accent-primary); letter-spacing: -0.02em; line-height: var(--line-height-compact); margin-bottom: var(--space-4); font-family: 'Courier New', monospace; word-break: break-all; }
        .brief-section { margin-bottom: var(--space-4); }
        .brief-sec-label { font-size: var(--font-size-caption); font-weight: var(--font-weight-medium); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.07em; line-height: var(--line-height-compact); margin-bottom: var(--space-2); }
        .brief-text { font-size: var(--font-size-body); color: var(--color-text-body); line-height: var(--line-height-reading); letter-spacing: 0.01em; }
        .tag-row { display: flex; flex-wrap: wrap; gap: var(--space-2); }
        .brief-tag { padding: 3px 12px 5px; border-radius: var(--radius-pill); font-size: var(--font-size-caption); line-height: 1.5; }
        .brief-tag.trigger { background: var(--color-status-trigger-bg); border: 0.5px solid var(--color-status-trigger-border); color: var(--color-status-trigger-text); }
        .brief-tag.anti { background: var(--color-status-caution-bg); border: 0.5px solid var(--color-status-caution-border); color: var(--color-status-caution-text); }
        .tc-pill { display: inline-block; padding: 3px 12px 5px; border-radius: var(--radius-pill); font-size: var(--font-size-caption); font-weight: var(--font-weight-medium); margin-bottom: var(--space-2); }
        .tc-pill.yes { background: var(--color-status-trigger-bg); border: 0.5px solid var(--color-status-trigger-border); color: var(--color-status-trigger-text); }
        .tc-pill.no  { background: var(--color-status-caution-bg); border: 0.5px solid var(--color-status-caution-border); color: var(--color-status-caution-text); }
        .brief-reasoning { font-size: var(--font-size-interaction); color: var(--color-text-muted); line-height: var(--line-height-compact); letter-spacing: 0.01em; }
        .desc-section { border-top: 0.5px solid var(--color-border-default); padding-top: 16px; }
        .brief-desc { font-size: var(--font-size-body); color: var(--color-text-body); line-height: var(--line-height-reading); letter-spacing: 0.01em; background: var(--color-bg-base); border-radius: var(--radius-interactive); padding: var(--space-4); border: 0.5px solid var(--color-border-default); white-space: pre-wrap; }
        .char-count { font-size: var(--font-size-caption); margin-top: var(--space-2); text-align: end; color: var(--color-text-faint); }

        /* Discovery */
        .disc-question { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-top: 2px solid var(--color-accent-primary); border-radius: var(--radius-container); padding: var(--space-4); margin-bottom: var(--space-4); font-size: var(--font-size-body); font-weight: var(--font-weight-medium); color: var(--color-text-body); line-height: var(--line-height-reading); letter-spacing: 0.01em; }
        .disc-checklist { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-container); padding: var(--space-4); margin-bottom: var(--space-4); }
        .disc-checklist-label { font-size: var(--font-size-caption); font-weight: var(--font-weight-medium); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.07em; line-height: var(--line-height-compact); margin-bottom: var(--space-3); }
        .disc-item { font-size: var(--font-size-body); color: var(--color-text-body); padding: 8px 0; border-bottom: 0.5px solid var(--color-border-default); display: flex; gap: var(--space-2); align-items: flex-start; line-height: var(--line-height-reading); letter-spacing: 0.01em; }
        .disc-item:last-child { border-bottom: none; padding-bottom: 0; }
        .disc-bullet { color: var(--color-accent-primary); flex-shrink: 0; font-size: var(--font-size-caption); margin-top: 4px; }
        .ready-banner { background: var(--color-status-positive-bg); border: 0.5px solid var(--color-status-positive-border); border-radius: var(--radius-container); padding: var(--space-4); margin-bottom: var(--space-4); font-size: var(--font-size-interaction); line-height: var(--line-height-compact); color: var(--color-status-positive-text); text-align: center; font-weight: var(--font-weight-medium); }
        .disc-copy-row { margin-top: var(--space-6); }

        /* File upload */
        .drop-zone { border: 1.5px dashed var(--color-border-default); border-radius: var(--radius-container); padding: 48px 16px; text-align: center; cursor: pointer; transition: background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); background: var(--color-bg-surface); user-select: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); }
        .drop-zone:hover, .drop-zone.drag { border-color: var(--color-accent-primary); background: var(--color-bg-raised); }
        .drop-zone:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
        .drop-icon { font-size: var(--font-size-icon); margin-bottom: var(--space-2); color: var(--color-text-faint); }
        .drop-text { font-size: var(--font-size-interaction); color: var(--color-text-muted); margin-bottom: var(--space-1); line-height: 1.4; }
        .drop-hint { font-size: var(--font-size-caption); color: var(--color-text-faint); }
        .thinking-block { margin-top: var(--space-3); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-container); overflow: hidden; }
        .thinking-toggle { width: 100%; display: flex; align-items: center; gap: var(--space-2); padding: 12px var(--space-4); min-height: 48px; background: var(--color-bg-surface); border: none; cursor: pointer; font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-caption); color: var(--color-text-muted); text-align: left; }
        .thinking-dot-row { display: flex; gap: 3px; align-items: center; }
        .thinking-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--color-accent-primary); animation: thinkPulse 1.2s ease-in-out infinite; }
        .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
        .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes thinkPulse { 0%,80%,100% { opacity:0.3; transform:scale(0.8); } 40% { opacity:1; transform:scale(1); } }
        .thinking-check { color: var(--color-status-positive-text); font-size: var(--font-size-caption); }
        .thinking-chevron { margin-left: auto; font-size: 9px; color: var(--color-text-faint); }
        .thinking-body { padding: 12px var(--space-4); font-size: var(--font-size-caption); color: var(--color-text-muted); line-height: var(--line-height-compact); white-space: pre-wrap; background: var(--color-bg-base); border-top: 0.5px solid var(--color-border-default); max-height: 200px; overflow-y: auto; }

        .file-list { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
        .file-pill { background: var(--color-bg-raised); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); padding: 12px 12px 12px 16px; display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
        .file-pill-name { font-size: var(--font-size-interaction); color: var(--color-text-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-pill-clear { font-size: var(--font-size-interaction); color: var(--color-text-muted); cursor: pointer; flex-shrink: 0; padding: 8px; min-height: 48px; min-width: 48px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-interactive); }
        .file-pill-clear:hover { color: var(--color-status-negative-text); background: var(--color-status-negative-bg); }
        .file-pill-clear:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
        .file-progress { margin-top: var(--space-4); }
        .file-progress-bar { height: 3px; background: var(--color-bg-overlay); border-radius: 2px; overflow: hidden; margin-bottom: var(--space-3); }
        .file-progress-fill { height: 100%; background: var(--color-accent-primary); border-radius: 2px; transition: width 300ms var(--ease-out); }
        .file-progress-msg { font-size: var(--font-size-interaction); color: var(--color-text-muted); text-align: center; margin-bottom: var(--space-1); }
        .file-progress-step { font-size: var(--font-size-caption); color: var(--color-text-faint); text-align: center; }

        /* i18n: RTL and Arabic script safety */
        [dir="rtl"] .btn-row { flex-direction: row-reverse; }
        [dir="rtl"] .file-pill { flex-direction: row-reverse; }
        [dir="rtl"] .field-label { flex-direction: row-reverse; }
        :lang(ar) .out-label,
        :lang(ar) .brief-sec-label,
        :lang(ar) .disc-checklist-label { letter-spacing: 0; text-transform: none; }
        :lang(ar) .brief-text,
        :lang(ar) .brief-desc,
        :lang(ar) .field-input,
        :lang(ar) .disc-item,
        :lang(ar) .disc-question { letter-spacing: 0; }
        :lang(ar) .header-title,
        :lang(ar) .brief-name { letter-spacing: 0; }

        @media (max-width: 480px) {
          .header-title { font-size: var(--font-size-heading); }
          .run-btn { font-size: var(--font-size-interaction); }
        }
      `}</style>

      <div className="wrap">
        <div className="inner">

          <div className="header">
            <div className="header-title">{TAB_LABELS[tab]}</div>
            <div className="header-sub">{TAB_SUBS[tab]} <span style={{opacity:0.45}}>v0.1.5</span></div>
          </div>

          <div className="tabs">
            <div className="nav-attr">
              <a className="nav-attr-link" href="https://claude.ai/public/artifacts/a6f41506-53ad-4753-a2f1-2e90ad2fcbbd" target="_blank" rel="noopener noreferrer">Unusual Claude Showcase</a>
              <span style={{opacity:0.3}}> · </span>
              <a className="nav-attr-link" href="https://github.com/elb-pr" target="_blank" rel="noopener noreferrer">elb-pr</a>
            </div>
            <div className="tabs-inner">
              <button className={`tab-btn tab-btn-center${tab==="disc"?" active":""}${tappedTab==="disc"?" tab-tap":""}`} onClick={()=>switchTab("disc")}>
                <Telescope size={18} strokeWidth={1.75} />
                <span>Discover</span>
              </button>
              <button className={`tab-btn tab-btn-center${tab==="prep"?" active":""}${tappedTab==="prep"?" tab-tap":""}`} onClick={()=>switchTab("prep")}>
                <Atom size={18} strokeWidth={1.75} />
                <span>Compose</span>
              </button>
              <button className={`tab-btn tab-btn-center${tab==="file"?" active":""}${tappedTab==="file"?" tab-tap":""}`} onClick={()=>switchTab("file")}>
                <FileUp size={18} strokeWidth={1.75} />
                <span>Import</span>
              </button>
            </div>
          </div>

          <div className="tab-viewport">
            <div key={tab} className={transitionClass}>
              <TabContent tab={tab} p={tabProps} />
            </div>
          </div>

        </div>

        {showConfirm && (
          <div className="modal-overlay" onClick={()=>setShowConfirm(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-title">Run Savvy? first?</div>
              <div className="modal-body">Savvy? rewrites your fields using SAVVY-compliant trigger language and attention mechanics. Briefs aligned with Savvy? activate more reliably in Claude. It only takes a moment.</div>
              <div className="modal-actions">
                <button className="run-btn ghost" style={{flex:1}} onClick={()=>{ setShowConfirm(false); enhance(); }}>
                  Run Savvy?
                </button>
                <button className="run-btn" style={{flex:1}} onClick={runGenerateBrief}>
                  Generate anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Tab content (key-remounted on tab switch for slide-in + staggered rise) ─

function TabContent({ tab, p }) {
  if (tab === "prep") return (
    <>
      <div className="field rise">
        <input className="field-input" dir="auto" value={p.skillName} onChange={e=>p.setSkillName(e.target.value)} placeholder="Name: e.g. pdf report builder" />
      </div>
      <div className="field rise rd1">
        <textarea className="field-input" dir="auto" rows={3} value={p.purpose} onChange={e=>{p.setPurpose(e.target.value);autoGrow(e.target);}} onInput={e=>autoGrow(e.target)} placeholder="Purpose: e.g. take a messy data dump and produce a clean formatted PDF report with sections, charts, and a summary..." />
      </div>
      <div className="field rise rd2">
        <textarea className="field-input" dir="auto" rows={3} value={p.triggers} onChange={e=>{p.setTriggers(e.target.value);autoGrow(e.target);}} onInput={e=>autoGrow(e.target)} placeholder={`Triggers: e.g. "make me a report", "turn this into a PDF", "generate a summary doc"...`} />
      </div>
      <div className="field rise rd3">
        <textarea className="field-input" dir="auto" rows={3} value={p.outputFmt} onChange={e=>{p.setOutputFmt(e.target.value);autoGrow(e.target);}} onInput={e=>autoGrow(e.target)} placeholder="Output: e.g. a downloadable .pdf with cover page, table of contents, structured sections, and a 3-sentence executive summary..." />
      </div>
      {p.prepError && <div className="error">{p.prepError}</div>}
      <div className="btn-row rise rd4">
        <button className="run-btn ghost" onClick={p.enhance} disabled={p.enhancing||p.generating||(!p.purpose&&!p.triggers&&!p.outputFmt)}>
          {p.savvyMsg || "Savvy?"}
        </button>
        <button className="run-btn" onClick={p.generateBrief} disabled={p.enhancing||p.generating||!p.purpose}>
          {p.generateMsg || "Generate Brief"}
        </button>
      </div>
      <BriefCard data={p.brief} copyKey="prep" copied={p.copied} onCopy={p.copyText} />
    </>
  );

  if (tab === "disc") return (
    <>
      {!p.discStarted ? (<>
        <div className="rise">
          <textarea className="field-input" dir="auto" rows={5} value={p.discIdea} onChange={e=>{p.setDiscIdea(e.target.value);autoGrow(e.target);}} onInput={e=>autoGrow(e.target)} placeholder="Skill idea: e.g. I want a skill that helps Claude create weekly standup summaries from my Jira tickets and Slack messages..." style={{marginBottom:"var(--space-4)"}} />
        </div>
        {p.discError && <div className="error">{p.discError}</div>}
        <div className="rise rd1">
          <button className="run-btn full" onClick={p.startDiscovery} disabled={p.discRunning||!p.discIdea.trim()}>
            {p.discMsg || "Start Discovery"}
          </button>
        </div>
      </>) : (<>
        {p.discCollected.length > 0 && (
          <div className="disc-checklist">
            <div className="disc-checklist-label">Things to collect</div>
            {p.discCollected.map((item, i) => (
              <div key={i} className={`disc-item rise rd${Math.min(i + 1, 5)}`}><span className="disc-bullet">◆</span><span>{item}</span></div>
            ))}
          </div>
        )}
        {p.discReady ? (
          <div className="ready-banner">You have enough to start - hand this to savvy</div>
        ) : (<>
          {p.discQuestion && <div className="disc-question">{p.discQuestion}</div>}
          {p.discError && <div className="error">{p.discError}</div>}
          <div className="field">
            <textarea className="field-input" dir="auto" rows={3} value={p.discAnswer}
              onChange={e=>{p.setDiscAnswer(e.target.value);autoGrow(e.target);}}
              onInput={e=>autoGrow(e.target)}
              onKeyDown={e=>{ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)) p.answerDiscovery(); }} />
          </div>
          <button className="run-btn full" onClick={p.answerDiscovery} disabled={p.discRunning||!p.discAnswer.trim()}>
            {p.discMsg || "Answer"}
          </button>
        </>)}
        {p.discCollected.length > 0 && (
          <div className="disc-copy-row">
            <button className={`copy-btn${p.copied==="disc"?" ok":""}`} style={{width:"100%"}} onClick={()=>p.copyText(p.discCollected.map(i=>`□ ${i}`).join("\n"),"disc")}>
              {p.copied==="disc" ? "Copied" : "Copy Checklist"}
            </button>
          </div>
        )}
      </>)}
    </>
  );

  if (tab === "file") return (
    <>
      <div className={`drop-zone rise${p.dragging?" drag":""}`}
        onClick={()=>p.fileInputRef.current?.click()}
        onDragOver={e=>{e.preventDefault();p.setDragging(true);}}
        onDragLeave={()=>p.setDragging(false)}
        onDrop={p.handleDrop}>
        <FileUp size={28} strokeWidth={1.25} style={{color:"var(--color-text-faint)",marginBottom:"var(--space-2)"}} />
        <div className="drop-hint">txt · md · pdf · code · images</div>
        <input ref={p.fileInputRef} type="file" multiple style={{display:"none"}} onChange={e=>{
          if(e.target.files.length){ p.setFiles(f=>[...f,...Array.from(e.target.files)]); p.setFileBrief(null); }
        }} />
      </div>

      {p.files.length > 0 && (
        <div className="file-list">
          {p.files.map((f, i) => (
            <div key={i} className="file-pill">
              <span className="file-pill-name">{f.name}</span>
              <span className="file-pill-clear" onClick={()=>{ p.setFiles(fs=>fs.filter((_,j)=>j!==i)); p.setFileBrief(null); }}>✕</span>
            </div>
          ))}
        </div>
      )}

      {p.fileError && <div className="error" style={{marginTop:"var(--space-2)"}}>{p.fileError}</div>}

      {p.files.length > 0 && !p.fileRunning && (
        <button className="run-btn full" style={{marginTop:"var(--space-4)"}} onClick={p.processFiles}>
          Extract Brief{p.files.length > 1 ? ` from ${p.files.length} files` : ""}
        </button>
      )}

      {p.fileRunning && (
        <div className="file-progress">
          {p.fileProgress.total > 1 && (
            <div className="file-progress-bar">
              <div className="file-progress-fill" style={{width:`${(p.fileProgress.step/p.fileProgress.total)*100}%`}} />
            </div>
          )}
          <div className="file-progress-msg">{p.fileMsg || "extracting brief..."}</div>
          {p.fileProgress.total > 1 && (
            <div className="file-progress-step">{p.fileProgress.step} of {p.fileProgress.total} files read</div>
          )}
          {p.fileThinking && (
            <div className="thinking-block">
              <button className="thinking-toggle" onClick={()=>p.setThinkingOpen(o=>!o)}>
                <span className="thinking-dot-row">
                  {!p.fileThinking.done && <><span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" /></>}
                  {p.fileThinking.done && <span className="thinking-check">✓</span>}
                </span>
                <span>{p.fileThinking.done ? `Thought for ${p.fileThinking.elapsed}s` : "Thinking..."}</span>
                <span className="thinking-chevron">{p.thinkingOpen ? "▲" : "▼"}</span>
              </button>
              {p.thinkingOpen && (
                <div className="thinking-body">{p.fileThinking.text}</div>
              )}
            </div>
          )}
        </div>
      )}

      {p.fileThinking && p.fileThinking.done && !p.fileRunning && !p.fileBrief && (
        <div className="thinking-block">
          <button className="thinking-toggle" onClick={()=>p.setThinkingOpen(o=>!o)}>
            <span className="thinking-check">✓</span>
            <span>Thought for {p.fileThinking.elapsed}s</span>
            <span className="thinking-chevron">{p.thinkingOpen ? "▲" : "▼"}</span>
          </button>
          {p.thinkingOpen && <div className="thinking-body">{p.fileThinking.text}</div>}
        </div>
      )}

      <BriefCard data={p.fileBrief} copyKey="file" copied={p.copied} onCopy={p.copyText} />
    </>
  );

  return null;
}
