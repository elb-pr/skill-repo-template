import { useState, useRef } from "react";
import { FileUp } from "lucide-react";

const HAIKU = "claude-haiku-4-5-20251001";

// ── Baked-in reference files — permanent, not configurable ────────────────────

const ATTENTION_MECHANICS = `# Attention Mechanics: The Physics of Instruction Following

This document explains WHY certain structural patterns work, based on transformer architecture and measured effects.

## The Core Problem

LLMs don't "understand" instructions - they allocate attention based on:
1. **Position** in the context window
2. **Format** and tokenisation patterns
3. **Learned associations** from training

Understanding these mechanics lets you design skills that work WITH the architecture rather than hoping for compliance.

## 1. The U-Shaped Attention Curve

### What It Is

Attention distribution across the context window follows a predictable U-shape:

\`\`\`
ATTENTION WEIGHT
       │
  HIGH │████                                          ████
       │████░░                                      ░░████
       │████░░░░                                  ░░░░████
  MED  │████░░░░░░░░                          ░░░░░░░░████
       │████░░░░░░░░░░░░                  ░░░░░░░░░░░░████
  LOW  │████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████
       └──────────────────────────────────────────────────
         0%        25%        50%        75%        100%
              PRIMACY              MIDDLE              RECENCY
               ZONE               (TROUGH)              ZONE
\`\`\`

### Why It Exists

Three architectural factors combine:

#### 1.1 Attention Sinks (Primacy)

The **softmax function** normalises attention scores to sum to 1.0:

\`\`\`
attention_weight[i] = exp(score[i]) / Σ exp(score[j])
\`\`\`

When the current token has no strong semantic relationship to any context token, the probability mass must still go somewhere. Models learn to designate the **first few tokens** as "sinks" to absorb excess attention.

**Result:** First ~4 tokens receive disproportionate attention regardless of content.

**Measured effect:** Removing sink tokens causes catastrophic perplexity collapse.

#### 1.2 RoPE Decay (Recency Bias)

**Rotary Position Embeddings (RoPE)** encode position by rotating query/key vectors:

\`\`\`
attention_score(q_m, k_n) ∝ f(m - n)  # depends on relative distance
\`\`\`

RoPE has **long-term decay**: attention scores decrease as relative distance increases.

**Result:** Recent tokens naturally receive higher attention due to proximity.

#### 1.3 Causal Masking (Primacy Reinforcement)

In autoregressive models, each token can only attend to previous tokens:

\`\`\`
Token at position n can see: [0, 1, 2, ..., n-1]
\`\`\`

Early tokens are visible to ALL subsequent tokens, making them natural attention targets through training.

### The Middle Trough

Tokens in the middle suffer a **double penalty**:
- Too far from current position for RoPE proximity benefit
- Lack the "sink" status of initial tokens
- Compete with many other tokens for limited attention budget

**Measured impact:** >20% accuracy drop for information in middle vs edges.

## 2. Attention Budget Economics

### The Fixed Budget

Softmax forces attention weights to sum to 1.0. This creates a **zero-sum game**:
- More attention to X = less attention to Y
- Long contexts dilute attention per token
- Critical instructions compete with noise

### Context Saturation

As context length increases, per-token attention decreases:

| Context Length | Avg Attention/Token | Implication |
|----------------|---------------------|-------------|
| 1k tokens | 0.1% each | Good signal |
| 10k tokens | 0.01% each | Signal diluted |
| 100k tokens | 0.001% each | Severe dilution |

**Recommendation:** Keep total context under 70-80% of window for best accuracy.

### Token Budget for Skills

Every word in your skill consumes attention budget:

| Skill Type | Target Words | Rationale |
|------------|--------------|-----------|
| Frequently-loaded | <200 | Minimise overhead |
| Standard | <500 | Balance detail/efficiency |
| Complex with examples | <1000 | Examples worth the cost |

## 3. Positional Strategies

### 3.1 The Sandwich Method

Place critical content at BOTH edges to exploit primacy AND recency:

\`\`\`
[PRIMACY ZONE - 10%]
├── Identity/Role (first 4 tokens matter most)
├── Primary constraints
└── Critical rules

[MIDDLE ZONE - 80%]
├── Methodology (OK here)
├── Context/Background (OK here)
└── Reference data (OK here)

[RECENCY ZONE - 10%]
├── Examples (best example LAST)
├── Output format
└── Constraint reminder (Self-Reminder technique)
\`\`\`

### 3.2 The Self-Reminder Technique

Exploit recency bias to refresh instructions:

**Problem:** Constraints in system prompt decay over long context.

**Solution:** Restate constraints at the END of the skill.

\`\`\`xml
<constraints_reminder>
Before responding, verify:
1. Output is valid JSON
2. All required fields present
3. No prohibited terms used
</constraints_reminder>
\`\`\`

**Mechanism:** Places constraint tokens in local attention window where RoPE gives maximum weight.

**Measured effect:** Jailbreak success reduced from 67% to 19%.

### 3.3 Prompt Repetition

For position-sensitive tasks, repeat critical instructions at multiple positions:

**Measured effect:** Performance on position-sensitive tasks improved from 21% to 97%.

**Note:** Repeat the full instruction context, not just the question.

## 4. Format and Tokenisation

### 4.1 Why XML Beats Markdown

Tokenisation stability affects attention boundary clarity:

**Markdown headers** have variable tokenisation:
\`\`\`
"### Instructions" might tokenise as:
  ['###', ' Instructions']
  ['\\n', '###', 'Instructions']
  ['#', '##', ' Instructions']
\`\`\`

**XML tags** have stable tokenisation:
\`\`\`
"<instructions>" typically tokenises as:
  ['<', 'instructions', '>']  (predictable)
\`\`\`

**Result:** XML creates "hard" attention boundaries; Markdown creates "soft" ones.

| Format | Boundary Type | Compliance |
|--------|--------------|------------|
| XML | Hard (distinct tokens) | 92% |
| Markdown | Soft (variable tokens) | 74% |

### 4.2 Claude's XML Preference

Claude was trained with **Constitutional AI** using XML-like structures:
- \`<thinking>\` tags for reasoning
- Structured delimiters for safe/unsafe separation
- Heavy code/HTML training data

Using XML activates the same attention patterns as Claude's alignment training.

### 4.3 Token Healing

**Problem:** If a prompt ends mid-token, the model must "heal" the boundary:

\`\`\`
Bad:  "The code is: "  (trailing space - ambiguous next token)
Good: "The code is:\\n\\n\`\`\`python\\n"  (forces code mode)
\`\`\`

**Mechanism:** Token healing consumes the first generation step, disrupting induction heads.

**Solution:** End prompts with clean "handoff sequences" that prime expected output.

## 5. Induction Heads

### 5.1 What They Are

Specialised attention circuits that implement pattern matching:

\`\`\`
Algorithm:
  IF current_token == A 
  AND past_context contains [A, B]
  THEN predict B
\`\`\`

This is the mechanism behind few-shot learning.

### 5.2 How Examples Program Them

When you provide examples:
\`\`\`xml
<example>
<input>X</input>
<o>Y</o>
</example>
\`\`\`

You're creating pattern \`[input, X, output, Y]\` for induction heads to match and copy.

### 5.3 Why Consistency Matters

Induction heads need consistent patterns to lock on:

**Inconsistent (fails):**
\`\`\`
Example 1: Input: X → Output: Y
Example 2: Question: A → Answer: B
Example 3: Q: M → A: N
\`\`\`
Heads can't find stable pattern \`[A][B]...[A]→B\`

**Consistent (works):**
\`\`\`
Example 1: <input>X</input><o>Y</o>
Example 2: <input>A</input><o>B</o>
Example 3: <input>M</input><o>N</o>
\`\`\`
Clear pattern for copying.

### 5.4 Why Last Example Matters Most

Recency bias means the last example has highest attention weight when generating.

**Implication:** Put your best, most complete example LAST.

## 6. Multi-Turn Degradation

### 6.1 The Feedback Loop

In multi-turn conversations:
1. Model generates response (Turn 1)
2. Response becomes context for Turn 2
3. Any errors in Turn 1 are now "ground truth"
4. Recency bias favours recent (flawed) output over distant (correct) system prompt
5. Errors compound

**Measured:** 39% average performance drop; 112% increase in unreliability.

### 6.2 The "Wrong Turn" Problem

Once the model makes an error, recovery is nearly impossible:
- The error is in recent context (high attention)
- Original instructions are distant (low attention)
- Model "gaslights itself" into believing errors

### 6.3 Mitigation Strategies

| Strategy | How It Works | Effectiveness |
|----------|--------------|---------------|
| Consolidation | Batch all context before generation | 95% of single-turn |
| Fresh sessions | Reset context for new tasks | Full reset |
| Sub-agent architecture | Separate context per subtask | Prevents accumulation |
| Recap prompts | Force state summary before action | Partial mitigation |

## 7. Practical Implications

### 7.1 Skill Design Checklist

- [ ] Identity in first 4 tokens (attention sink)
- [ ] Constraints in first 10% (primacy zone)
- [ ] Background data in middle (OK for low-priority)
- [ ] Examples in last 20% (recency zone)
- [ ] Best example LAST
- [ ] Constraint reminder at very end (self-reminder)
- [ ] XML tags for all structural boundaries
- [ ] Clean handoff sequence
- [ ] Under 500 words total

### 7.2 When to Shard Context

If context exceeds ~15k tokens:
- Split into smaller independent chunks
- Process each chunk separately
- Aggregate results

This physically eliminates the middle trough.

### 7.3 When to Use Sub-Agents

For multi-step tasks:
- Dispatch fresh instance per subtask
- Pass only relevant context
- Prevents KV cache pollution
- Resets "unreliability counter" to zero

## Summary

| Phenomenon | Mechanism | Exploit By |
|------------|-----------|------------|
| Attention sinks | Softmax + first tokens | Put identity first |
| Primacy bias | Causal masking | Constraints early |
| Recency bias | RoPE decay | Examples + reminder last |
| Middle trough | Combined effects | Avoid critical content here |
| Induction heads | Pattern matching | Consistent examples |
| Token boundaries | Tokenisation | XML tags, clean handoffs |
| Multi-turn drift | Error feedback | Sub-agents, consolidation |

**Bottom line:** Treat the attention mechanism as a resource to be engineered, not a magic box to be hoped at.
`;
const ANTI_PATTERNS = `# Anti-Patterns: Why Skills Fail

Each anti-pattern includes the failure mechanism, measured impact, and concrete fix.

## 1. Positional Anti-Patterns

### 1.1 Critical Rules in the Middle

**What it looks like:**
\`\`\`xml
<context>
[2000 tokens of background]
</context>

<important_rules>
ALWAYS use type hints.
NEVER use eval().
</important_rules>

<examples>
[1500 tokens of examples]
</examples>
\`\`\`

**Why it fails:**
- Middle zone (10-90% of context) receives lowest attention due to RoPE decay
- Critical rules compete with surrounding noise
- >20% accuracy drop for middle-positioned information

**Measured impact:** Instructions in middle ignored 20-40% more often than edges.

**Fix:**
\`\`\`xml
<constraints>
ALWAYS use type hints.
NEVER use eval().
</constraints>

<context>
[Background - OK to be in middle, not critical]
</context>

<constraints_reminder>
Verify: type hints present, no eval() usage.
</constraints_reminder>
\`\`\`

---

### 1.2 No Constraint Reminder (Missing Recency Anchor)

**What it looks like:**
\`\`\`xml
<system>
You MUST output valid JSON only.
</system>

[... 3000 tokens of conversation ...]

<user>
Generate the report.
</user>
\`\`\`

**Why it fails:**
- Original constraint is thousands of tokens away
- RoPE decay reduces attention to distant instructions
- Recency bias favours recent (unconstraining) content
- No refresh of instruction in working memory

**Measured impact:** 39% performance degradation in multi-turn; constraints "forgotten."

**Fix:**
\`\`\`xml
<user>
Generate the report.

Remember: Output MUST be valid JSON only, no markdown or prose.
</user>
\`\`\`

---

## 2. Framing Anti-Patterns

### 2.1 Negative Constraints

**What it looks like:**
\`\`\`xml
<rules>
- Do NOT mention competitors
- Do NOT use markdown formatting
- Do NOT include personal opinions
- NEVER say "I don't know"
</rules>
\`\`\`

**Why it fails:**
- Attention is additive; no native "inhibition" circuit
- Processing "Do NOT mention competitors" activates "competitors" concept
- Suppression requires secondary circuit that fails under load
- The "pink elephant" problem: telling someone not to think of X activates X

**Measured impact:** Negative constraints have lowest compliance rate of all constraint types.

**Fix:**
\`\`\`xml
<rules>
- Mention ONLY products from <approved_list>
- Use plain text formatting exclusively
- Present factual information only
- Provide substantive answers for all queries
</rules>
\`\`\`

**Pattern:** Every "Don't X" becomes "Do Y instead"

---

### 2.2 Hedging Language

**What it looks like:**
\`\`\`xml
<guidelines>
You should probably use type hints when possible.
Consider keeping functions under 50 lines if feasible.
It might be helpful to add docstrings.
Try to avoid global variables when you can.
</guidelines>
\`\`\`

**Why it fails:**
- Hedging words (should, consider, might, try, probably) reduce authority signal
- Fails to activate instruction-following dimension in activation space
- Model treats as suggestions, not requirements
- Competes poorly against stronger signals in context

**Measured impact:** 8-11% improvement when hedging replaced with authority language.

**Fix:**
\`\`\`xml
<constraints>
ALWAYS include type hints on all function arguments and returns.
Functions MUST NOT exceed 50 lines.
Every function REQUIRES a docstring.
Global variables are FORBIDDEN.
</constraints>
\`\`\`

---

### 2.3 Vague Quantities

**What it looks like:**
\`\`\`xml
<format>
Keep it brief.
Include a few examples.
Write around a paragraph.
Use some bullet points.
</format>
\`\`\`

**Why it fails:**
- Unverifiable constraints have lower compliance
- Model cannot self-check against vague targets
- "Brief" and "few" are subjective, model defaults to training priors
- No clear success criteria

**Measured impact:** Verifiable constraints ("exactly 5") show significantly higher compliance than vague ("a few").

**Fix:**
\`\`\`xml
<format>
Response MUST be 50-100 words.
Include exactly 3 examples.
Write 2-3 sentences maximum.
Use 4-6 bullet points.
</format>
\`\`\`

---

## 3. Example Anti-Patterns

### 3.1 Inconsistent Example Formatting

**What it looks like:**
\`\`\`xml
<examples>
<example>
Input: Calculate 2+2
Output: The answer is 4.
</example>
<example>
Question: What is 3*3?
Answer: 9
</example>
<example>
Q: 5-1?
A: **4**
</example>
</examples>
\`\`\`

**Why it fails:**
- Induction heads pattern-match \`[A][B]...[A] → B\`
- Inconsistent structure (Input/Question/Q, Output/Answer/A) prevents lock-on
- Different formatting (prose vs number vs bold) confuses copying circuit
- Model cannot determine which pattern to follow

**Measured impact:** Induction heads fail to activate; output format becomes unpredictable.

**Fix:**
\`\`\`xml
<examples>
<example>
<input>Calculate 2+2</input>
<output>4</output>
</example>
<example>
<input>What is 3*3?</input>
<output>9</output>
</example>
<example>
<input>5-1?</input>
<output>4</output>
</example>
</examples>
\`\`\`

---

### 3.2 Negative Examples

**What it looks like:**
\`\`\`xml
<examples>
<bad_example>
Input: Write a greeting
Output: hey whats up lol  <!-- DON'T do this -->
</bad_example>
<good_example>
Input: Write a greeting
Output: Hello, how may I assist you today?
</good_example>
</examples>
\`\`\`

**Why it fails:**
- Induction heads don't understand "bad" vs "good" semantically
- Both patterns are activated and available for copying
- "DON'T do this" comment doesn't inhibit the pattern
- Model may copy the bad example, especially if it appears more recently

**Measured impact:** Negative examples can poison the example set; bad patterns appear in output.

**Fix:**
\`\`\`xml
<examples>
<example>
<input>Write a greeting</input>
<output>Hello, how may I assist you today?</output>
</example>
<example>
<input>Write a greeting for morning</input>
<output>Good morning, how may I assist you today?</output>
</example>
</examples>
\`\`\`

**Rule:** Show only what you want. Never show what you don't want.

---

### 3.3 Too Few or Too Many Examples

**What it looks like:**
\`\`\`xml
<!-- Too few -->
<examples>
<example>...</example>
</examples>

<!-- Too many -->
<examples>
<example>...</example>
<example>...</example>
<!-- ... 15 more examples ... -->
</examples>
\`\`\`

**Why it fails:**
- 1 example: Insufficient pattern for induction head lock-on
- 10+ examples: Diminishing returns; consumes token budget; middle examples ignored
- Optimal is 3-5 based on empirical research

**Measured impact:**
- 1-shot: Suboptimal pattern matching
- 3-5 shot: Peak performance
- 10+ shot: Minimal additional gain, high token cost

**Fix:** Always include exactly 3-5 examples, with the best/most complex example last.

---

### 3.4 Best Example Not Last

**What it looks like:**
\`\`\`xml
<examples>
<example>
<!-- Complex, perfect example showing all features -->
</example>
<example>
<!-- Simple basic example -->
</example>
<example>
<!-- Another simple example -->
</example>
</examples>
\`\`\`

**Why it fails:**
- Recency bias gives last example highest attention weight
- Induction heads weight recent patterns more heavily
- Simple examples at end = simple output patterns

**Measured impact:** OptiSeq research shows 6-10.5 percentage point improvement from optimal ordering.

**Fix:**
\`\`\`xml
<examples>
<example><!-- Simple case --></example>
<example><!-- Medium complexity --></example>
<example><!-- Edge case --></example>
<example><!-- Best, most complete example LAST --></example>
</examples>
\`\`\`

---

## 4. Structural Anti-Patterns

### 4.1 Markdown for Control Structures

**What it looks like:**
\`\`\`markdown
### System Instructions

You are a helpful assistant.

### Rules

1. Always be polite
2. Never lie

### Examples

**Input:** Hello
**Output:** Hi there!
\`\`\`

**Why it fails:**
- Markdown headers (\`###\`) have variable tokenisation
- May tokenise as \`['###', ' System']\` or \`['\\n###', 'System']\` depending on context
- "Soft" boundaries; model treats as stylistic, not structural
- High frequency in web training data reduces distinctiveness

**Measured impact:** 74% compliance with Markdown vs 92% with XML.

**Fix:**
\`\`\`xml
<system_instructions>
You are a helpful assistant.
</system_instructions>

<rules>
1. ALWAYS be polite
2. Truthful responses only
</rules>

<examples>
<example>
<input>Hello</input>
<output>Hi there!</output>
</example>
</examples>
\`\`\`

---

### 4.2 No Clean Handoff Sequence

**What it looks like:**
\`\`\`xml
<instruction>
Write Python code for the following:
</instruction>
\`\`\`

**Why it fails:**
- Prompt ends ambiguously
- Model must "heal" the boundary before generating
- May predict space, newline, quote, or prose continuation
- First generated tokens set trajectory; healing wastes them

**Measured impact:** Increased likelihood of prose preamble before code; format drift.

**Fix:**
\`\`\`xml
<instruction>
Write Python code for the following:
</instruction>

\`\`\`python
\`\`\`

The triple-backtick with language forces immediate code-generation mode.

---

### 4.3 Monolithic Instruction Blocks

**What it looks like:**
\`\`\`xml
<instructions>
You are an expert Python developer who writes clean, efficient code. Always use type hints and docstrings. Never use global variables or eval(). Keep functions under 50 lines. Use descriptive variable names. Follow PEP 8 style guidelines. Include error handling for all IO operations. Write unit tests for public functions. Use logging instead of print statements. Prefer list comprehensions over loops where readable. Always validate input parameters. Return early to avoid deep nesting. Use context managers for resource handling. Document all public APIs. Keep cyclomatic complexity under 10.
</instructions>
\`\`\`

**Why it fails:**
- Wall of text creates attention dilution
- No structural anchors for induction heads
- Instruction count degradation: compliance drops uniformly as count increases
- Middle instructions lost in the block

**Measured impact:** IBM ScaledIF shows instruction-following degrades predictably with instruction count.

**Fix:**
\`\`\`xml
<constraints>
<!-- Most critical only -->
1. ALWAYS include type hints
2. Functions MUST have docstrings
3. eval() and global variables FORBIDDEN
</constraints>

<style_guide>
See project STYLE.md for complete guidelines.
</style_guide>
\`\`\`

**Rule:** Maximum 5-7 constraints in primary block. Reference external docs for the rest.

---

## 5. Content Anti-Patterns

### 5.1 Instructions That Conflict With Examples

**What it looks like:**
\`\`\`xml
<rules>
Output MUST be valid JSON with no additional text.
</rules>

<examples>
<example>
<input>Get user info</input>
<output>
Here's the user information:
{"name": "John", "age": 30}
</output>
</example>
</examples>
\`\`\`

**Why it fails:**
- Example shows prose + JSON, contradicting rule
- Induction heads copy example pattern
- Examples often override explicit rules when inconsistent
- Model receives conflicting signals

**Measured impact:** Example pattern frequently wins over explicit instruction.

**Fix:**
\`\`\`xml
<rules>
Output MUST be valid JSON with no additional text.
</rules>

<examples>
<example>
<input>Get user info</input>
<output>{"name": "John", "age": 30}</output>
</example>
</examples>
\`\`\`

**Rule:** Examples MUST demonstrate rules, never contradict them.

---

### 5.2 Assuming Prior Context

**What it looks like:**
\`\`\`xml
<instruction>
Continue with the approach we discussed.
Use the format from before.
Apply the same rules as last time.
</instruction>
\`\`\`

**Why it fails:**
- Each context window is stateless
- "Before" and "last time" have no referent
- Model cannot retrieve information not in current context
- Results in hallucination of assumed context

**Measured impact:** 100% failure rate for references to non-existent prior context.

**Fix:**
\`\`\`xml
<context>
Previous approach: [explicit summary]
Required format: [explicit specification]
Applicable rules: [explicit list]
</context>

<instruction>
Apply the approach and format specified in <context>.
</instruction>
\`\`\`

---

### 5.3 Embedded Code That Drifts

**What it looks like:**
\`\`\`xml
<reference_implementation>
def process_data(items):
    # 200 lines of code copied from actual codebase
    # Last updated: 6 months ago
    # Now out of sync with actual implementation
</reference_implementation>
\`\`\`

**Why it fails:**
- Embedded code becomes stale
- No automatic sync with source
- Creates silent failures when codebase evolves
- Consumes significant token budget

**Measured impact:** HumanLayer research: "Never send an LLM to do a linter's job"; embedded code drifts from source.

**Fix:**
\`\`\`xml
<reference>
Implementation: See src/processors/data.py
Run: python -m pytest tests/test_data.py for current behaviour
</reference>
\`\`\`

**Rule:** Point to files, don't embed them. Let the model read current source.

---

## 6. Cognitive Load Anti-Patterns

### 6.1 "Be Concise" for Complex Tasks

**What it looks like:**
\`\`\`xml
<instruction>
Solve this complex multi-step problem.
Be concise. Short answer only.
</instruction>
\`\`\`

**Why it fails:**
- Reasoning requires tokens (Chain-of-Thought)
- "Concise" lobotomises working memory
- Model cannot store intermediate computation state
- Complex problems require explicit reasoning steps

**Measured impact:** GSM8K 19.2% → 79.0% when CoT allowed vs forced conciseness.

**Fix:**
\`\`\`xml
<instruction>
Solve this complex multi-step problem.

Process:
1. Work through your reasoning in <thinking> tags
2. Show intermediate steps
3. Provide final answer in <answer> tags (this can be concise)
</instruction>
\`\`\`

**Rule:** Separate reasoning (can be verbose) from final output (can be concise).

---

### 6.2 Single Prompt for Multi-Domain Tasks

**What it looks like:**
\`\`\`xml
<instruction>
1. Analyse this financial data
2. Generate a marketing report
3. Write technical documentation
4. Create a project timeline
5. Draft customer emails
</instruction>
\`\`\`

**Why it fails:**
- Each domain activates different knowledge clusters
- Attention must split across unrelated contexts
- Increases "cognitive load" (attention dilution)
- Multi-turn drift compounds across domains

**Measured impact:** 39% degradation in multi-turn; worse for multi-domain.

**Fix:** Use sub-agent architecture. One focused task per prompt.

\`\`\`xml
<!-- Prompt 1: Financial -->
<instruction>Analyse this financial data.</instruction>

<!-- Prompt 2: Marketing -->
<instruction>Generate a marketing report for [summary from prompt 1].</instruction>
\`\`\`

---

## Summary Table

| Anti-Pattern | Failure Mechanism | Compliance Impact | Fix |
|--------------|-------------------|-------------------|-----|
| Rules in middle | Attention trough | -20-40% | Move to edges |
| No reminder | Instruction decay | -39% (multi-turn) | Add recency anchor |
| Negative framing | No inhibition circuit | Lowest compliance | Positive reframe |
| Hedging words | Weak authority signal | -8-11% | Use MUST/ALWAYS |
| Vague quantities | Unverifiable | Lower compliance | Use exact numbers |
| Inconsistent examples | Induction head failure | Unpredictable | Perfect consistency |
| Negative examples | Activates bad pattern | Pattern leakage | Positive only |
| Wrong example count | Suboptimal ICL | Variable | Use 3-5 |
| Best example not last | Recency wasted | -6-10% | Best example last |
| Markdown structure | Soft boundaries | -18% vs XML | Use XML tags |
| No handoff | Token healing | Format drift | Clean sequence |
| Too many rules | Uniform degradation | Proportional | Max 5-7 critical |
| Example contradicts rule | Example wins | Rule ignored | Align examples |
| Assumed context | No referent | Hallucination | Explicit context |
| Embedded code | Drift from source | Silent failures | File references |
| Forced conciseness | No reasoning tokens | -60% on complex | Separate reasoning |
| Multi-domain prompt | Attention split | Compounded drift | Sub-agents |
`;
const TRIGGER_VOCABULARY = `# Trigger Vocabulary Reference

Specific words and phrases that activate or suppress the instruction-following dimension in Claude's activation space.

## The Instruction-Following Dimension

Research shows "instruction compliance" is encoded as a **linear direction (vector)** in the model's high-dimensional activation space. Certain linguistic markers trigger this vector more strongly than others.

This is not metaphor - it's measurable via linear probes on internal activation states.

## Authority Words (Use These)

These words activate the instruction-following dimension. Use them for constraints that MUST be followed.

### Tier 1: Strongest Activation

| Word | Usage | Effect |
|------|-------|--------|
| **MUST** | "Output MUST be JSON" | Strongest compliance signal |
| **SHALL** | "Response SHALL include" | Formal authority marker |
| **REQUIRED** | "Type hints are REQUIRED" | Non-negotiable signal |
| **FORBIDDEN** | "eval() is FORBIDDEN" | Absolute prohibition |
| **ALWAYS** | "ALWAYS validate input" | Universal requirement |

### Tier 2: Strong Activation

| Word | Usage | Effect |
|------|-------|--------|
| **exactly** | "Include exactly 5 items" | Verifiable precision |
| **precisely** | "Format precisely as shown" | Exact specification |
| **strictly** | "Strictly follow the schema" | No deviation signal |
| **only** | "Use Python only" | Exclusivity constraint |
| **exclusively** | "Reference <context> exclusively" | Strong boundary |

### Tier 3: Moderate Activation

| Word | Usage | Effect |
|------|-------|--------|
| **critical** | "This is critical" | Urgency/stakes signal |
| **essential** | "Essential requirements" | Non-optional marker |
| **mandatory** | "Mandatory fields" | Required status |
| **necessary** | "Necessary for compliance" | Dependency signal |

### Capitalisation Matters

| Style | Effect | Use When |
|-------|--------|----------|
| **ALL CAPS** | Maximum visual salience | Critical constraints |
| **Bold** | Emphasis | Important but not critical |
| Sentence case | Standard processing | General content |
| all lowercase | Reduced salience | Avoid for constraints |

**Example:**
\`\`\`xml
<constraints>
1. Output MUST be valid JSON          <!-- CAPS for critical -->
2. Include **all required fields**    <!-- Bold for emphasis -->
3. Timestamps use ISO 8601 format     <!-- Normal for standard -->
</constraints>
\`\`\`

## Hedging Words (Avoid These)

These words reduce compliance by signalling optionality. They fail to activate the instruction-following dimension.

### Compliance Killers

| Word | Problem | Replace With |
|------|---------|--------------|
| should | Suggests optional | MUST |
| could | Implies choice | SHALL |
| might | Uncertainty | ALWAYS |
| perhaps | Doubt signal | [Remove] |
| consider | Optional action | [Direct imperative] |
| try to | Effort, not outcome | [Direct command] |
| if possible | Conditional | [Unconditional] |
| when feasible | Escape clause | [Remove condition] |
| ideally | Aspiration, not requirement | MUST |
| preferably | Preference, not rule | REQUIRED |

### Before/After Examples

\`\`\`xml
<!-- BAD: Hedging language -->
<guidelines>
You should probably use type hints when possible.
Consider keeping functions under 50 lines if feasible.
It might be helpful to add docstrings.
Try to avoid global variables when you can.
</guidelines>

<!-- GOOD: Authority language -->
<constraints>
1. Type hints are REQUIRED on all function signatures
2. Functions MUST NOT exceed 50 lines
3. Every function REQUIRES a docstring
4. Global variables are FORBIDDEN
</constraints>
\`\`\`

**Measured impact:** 8-11% improvement when hedging replaced with authority language.

## Specificity Words

Verifiable constraints have higher compliance than vague ones.

### Vague (Low Compliance)

| Phrase | Problem |
|--------|---------|
| a few | Undefined quantity |
| some | Ambiguous amount |
| several | Imprecise |
| around | Approximate |
| approximately | Unverifiable |
| about | Vague |
| roughly | Imprecise |
| brief | Subjective |
| short | Undefined |
| long | Undefined |

### Specific (High Compliance)

| Phrase | Why It Works |
|--------|--------------|
| exactly 5 | Verifiable count |
| precisely 3 | Exact number |
| between 50-100 words | Defined range |
| maximum 10 items | Clear limit |
| minimum 3 examples | Floor specified |
| no more than 2 paragraphs | Ceiling set |
| at least 5 bullet points | Minimum defined |

### Before/After Examples

\`\`\`xml
<!-- BAD: Vague quantities -->
<format>
Keep it brief.
Include a few examples.
Write around a paragraph.
Use some bullet points.
</format>

<!-- GOOD: Specific quantities -->
<format>
Response MUST be 50-100 words.
Include exactly 3 examples.
Write 2-3 sentences maximum.
Use 4-6 bullet points.
</format>
\`\`\`

## Framing: Positive vs Negative

### Why Negative Framing Fails

Attention mechanisms are **additive** - there's no native "inhibition" circuit.

Processing "Do NOT mention elephants" requires:
1. Activating the "elephant" concept (to identify what to avoid)
2. A secondary suppression circuit to downweight it
3. This suppression circuit is **fragile** and fails under load

**Result:** The model often mentions exactly what it was told to avoid.

### Negative → Positive Transformations

| Negative (Avoid) | Positive (Use) |
|------------------|----------------|
| Don't use markdown | Use plain text only |
| Never mention competitors | Discuss only products in <approved_list> |
| Avoid technical jargon | Use terminology from <glossary> |
| Don't include opinions | Present factual information only |
| Never say "I don't know" | Provide substantive answers for all queries |
| Don't use eval() | Use ast.literal_eval() for parsing |
| Avoid global variables | Define all variables within function scope |
| Don't repeat yourself | State each point exactly once |

### Advanced Pattern: Verification Steps

For critical prohibitions, add a verification step:

\`\`\`xml
<!-- BETTER: Positive + Verification -->
<constraints>
1. Use plain text formatting exclusively
2. Before outputting, verify response contains no markdown symbols (*, #, \`, [])
3. If markdown detected, regenerate in plain text
</constraints>
\`\`\`

## Urgency and Stakes (EmotionPrompt)

Research shows emotional urgency activates "high-stakes" training clusters where responses are more careful and precise.

### Effective Urgency Phrases

| Phrase | Effect |
|--------|--------|
| "This is critical for..." | Activates careful processing |
| "Failure will result in..." | Stakes signal |
| "It is vital that..." | Importance marker |
| "Accuracy is essential because..." | Consequence awareness |
| "This must be exactly correct" | Precision trigger |

### Usage Example

\`\`\`xml
<constraints>
Output MUST be valid JSON.

This is critical - invalid JSON will cause system failure.
Verify JSON validity before responding.
</constraints>
\`\`\`

**Measured impact:** EmotionPrompt techniques show 8-11% improvement on benchmarks.

### Don't Overuse

- Use urgency for 1-2 critical constraints only
- Overuse dilutes the effect
- Reserve for genuinely critical requirements

## Sentence Structure Patterns

### Strong Patterns

| Pattern | Example | Why It Works |
|---------|---------|--------------|
| Imperative | "Include type hints" | Direct command |
| "X is REQUIRED" | "Validation is REQUIRED" | Formal requirement |
| "MUST + verb" | "MUST return JSON" | Authority + action |
| "ALWAYS + verb" | "ALWAYS check input" | Universal rule |

### Weak Patterns

| Pattern | Example | Problem |
|---------|---------|---------|
| Questions | "Could you add...?" | Requests, not commands |
| Suggestions | "It would be good to..." | Optional framing |
| Conditionals | "If you can, please..." | Escape clause |
| Passive voice | "It should be formatted..." | Weak agency |

## Quick Reference Card

### ✅ Use These

\`\`\`
MUST, SHALL, ALWAYS, REQUIRED, FORBIDDEN
exactly, precisely, strictly, only, exclusively
critical, essential, mandatory
[specific numbers and ranges]
[positive framing]
[imperative sentences]
\`\`\`

### ❌ Avoid These

\`\`\`
should, could, might, perhaps, consider
try to, if possible, when feasible, ideally
a few, some, several, around, approximately
Don't, Never, Avoid, No [negative framing]
[questions, suggestions, conditionals]
\`\`\`

### Constraint Template

\`\`\`xml
<constraints>
1. [Action verb] MUST [specific requirement]
2. Output REQUIRED in [exact format]
3. [Resource] exclusively from <source_tag>
4. [Quantity] exactly [number]
5. Before responding, verify [checkable condition]
</constraints>
\`\`\`
`;

// ── Agent system prompts ──────────────────────────────────────────────────────

const ATTENTION_SYSTEM = `You are a structural compliance checker for Claude skills. Your ONLY job is to cross-check the uploaded SKILL.md against the Attention Mechanics reference below.

Check every rule in the reference against the skill. For each rule, determine whether the skill complies, partially complies, or violates it. Be specific — quote the exact section of the skill that passes or fails.

Write a markdown report:

# Attention Mechanics Adherence

## Pass
[Each rule the skill follows correctly — quote the evidence]

## Fail
[Each rule the skill violates — quote the violation and explain the impact]

## Partial
[Rules partially followed — what's missing]

## Summary
[One paragraph: overall structural health against attention mechanics principles]

---

${ATTENTION_MECHANICS}`;

const ANTI_PATTERNS_SYSTEM = `You are a structural compliance checker for Claude skills. Your ONLY job is to cross-check the uploaded SKILL.md against the Anti-Patterns reference below.

Check every anti-pattern in the reference against the skill. For each one, determine whether the skill contains this anti-pattern or avoids it. Be specific — quote the exact section of the skill that passes or fails.

Write a markdown report:

# Anti-Patterns Adherence

## Clean — Anti-Patterns Avoided
[Each anti-pattern the skill successfully avoids — quote the evidence]

## Violations — Anti-Patterns Present
[Each anti-pattern found in the skill — quote the violation, explain the failure mechanism, and state the measured impact from the reference]

## Summary
[One paragraph: overall anti-pattern health with the most critical violations prioritised]

---

${ANTI_PATTERNS}`;

const TRIGGER_VOCAB_SYSTEM = `You are a structural compliance checker for Claude skills. Your ONLY job is to cross-check the uploaded SKILL.md against the Trigger Vocabulary reference below.

Check every vocabulary rule in the reference against the skill's constraints, identity, and methodology. For each rule, determine whether the skill uses authority language correctly, hedges where it should not, or uses vague quantities.

Write a markdown report:

# Trigger Vocabulary Adherence

## Pass — Correct Authority Language
[Constraints and instructions using Tier 1/2 vocabulary correctly — quote examples]

## Fail — Hedging Language Found
[Any hedging words detected — quote each instance and suggest the authority replacement]

## Fail — Vague Quantities Found
[Any vague quantities detected — quote each instance and suggest the specific replacement]

## Fail — Negative Framing Found
[Any negative constraints detected — quote each instance and suggest the positive reframe]

## Summary
[One paragraph: overall vocabulary compliance with the most impactful issues prioritised]

---

${TRIGGER_VOCABULARY}`;

// ── API helper ────────────────────────────────────────────────────────────────

async function callHaiku(system, userContent) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: HAIKU,
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.filter(b => b.type === "text").map(b => b.text).join("");
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
  if (!skillMdFile) throw new Error("SKILL.md not found in .skill file");
  const skillMd = await skillMdFile.async("string");
  const nameMatch = skillMd.match(/^name:\s*(.+)$/m);
  const name = nameMatch?.[1]?.trim() || file.name.replace(".skill", "");
  return { name, skillMd };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SkillAdherence() {
  const [skill, setSkill]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef(null);

  // Three checker states: idle | running | done | error
  const [checkers, setCheckers] = useState([
    { id: "attention",    label: "Attention Mechanics", system: null, result: null, status: "idle" },
    { id: "antipatterns", label: "Anti-Patterns",       system: null, result: null, status: "idle" },
    { id: "vocabulary",   label: "Trigger Vocabulary",  system: null, result: null, status: "idle" },
  ]);

  const [running, setRunning]   = useState(false);
  const [copied, setCopied]     = useState(false);
  const [error, setError]       = useState("");

  function updateChecker(id, patch) {
    setCheckers(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }

  // ── Load .skill file ────────────────────────────────────────────────────────

  async function loadSkillFile(file) {
    setLoadError(""); setSkill(null); setError("");
    setCheckers(prev => prev.map(c => ({ ...c, result: null, status: "idle" })));
    setLoading(true);
    try {
      const data = await loadSkillZip(file);
      setSkill(data);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Run all three checkers in parallel ────────────────────────────────────

  async function runCheckers() {
    setRunning(true); setError("");
    setCheckers(prev => prev.map(c => ({ ...c, status: "running", result: null })));

    const input = `SKILL.md for: ${skill.name}\n\n${skill.skillMd}`;

    const jobs = [
      { id: "attention",    system: ATTENTION_SYSTEM    },
      { id: "antipatterns", system: ANTI_PATTERNS_SYSTEM },
      { id: "vocabulary",   system: TRIGGER_VOCAB_SYSTEM },
    ];

    await Promise.allSettled(jobs.map(async (job) => {
      try {
        const result = await callHaiku(job.system, input);
        updateChecker(job.id, { result, status: "done" });
      } catch (e) {
        updateChecker(job.id, { result: `**Error:** ${e.message}`, status: "error" });
      }
    }));

    setRunning(false);
  }

  function copyAll() {
    const text = checkers
      .filter(c => c.result)
      .map(c => c.result)
      .join("\n\n---\n\n");
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).catch(() => {
      const ta = document.createElement("textarea"); ta.value = text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    });
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  }

  const allDone = checkers.every(c => c.status === "done" || c.status === "error");

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

        .drop-zone { border: 1.5px dashed var(--color-border-default); border-radius: var(--radius-container); padding: 48px 16px; text-align: center; cursor: pointer; transition: background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); background: var(--color-bg-surface); user-select: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-2); }
        .drop-zone:hover, .drop-zone.drag { border-color: var(--color-accent-primary); background: var(--color-bg-raised); }
        .drop-zone:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
        .drop-text { font-size: var(--font-size-interaction); color: var(--color-text-muted); margin-bottom: var(--space-1); }
        .drop-hint { font-size: var(--font-size-caption); color: var(--color-text-faint); }

        .skill-card { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-container); padding: var(--space-4); margin-bottom: var(--space-4); }
        @media (prefers-reduced-motion: no-preference) {
          .skill-card { animation: fadeUp 0.2s cubic-bezier(0.05, 0.7, 0.1, 1); }
        }
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .skill-name { font-size: var(--font-size-body); font-weight: var(--font-weight-semibold); color: var(--color-accent-primary); font-family: 'Courier New', monospace; margin-bottom: var(--space-1); letter-spacing: -0.02em; word-break: break-all; }
        .skill-meta { font-size: var(--font-size-caption); color: var(--color-text-faint); }

        .run-btn { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); font-weight: var(--font-weight-semibold); padding: 15px 0 17px; min-height: 48px; width: 100%; border-radius: var(--radius-interactive); border: none; background: var(--color-accent-primary); color: var(--color-accent-on-primary); cursor: pointer; transition: transform var(--duration-fast) var(--ease-press), opacity var(--duration-normal) var(--ease-out), background-color var(--duration-normal) var(--ease-out); display: block; margin-bottom: var(--space-4); -webkit-tap-highlight-color: transparent; }
        .run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .run-btn:active:not(:disabled) { transform: scale(0.97); }
        .run-btn:hover:not(:disabled) { background: var(--color-accent-primary-hover); }
        .run-btn:focus-visible { outline: 2px solid var(--color-text-primary); outline-offset: 2px; }
        .run-btn.ghost { background: transparent; border: 0.5px solid var(--color-border-default); color: var(--color-text-muted); font-weight: var(--font-weight-medium); }
        .run-btn.ghost:hover:not(:disabled) { background: var(--color-bg-raised); color: var(--color-text-secondary); }

        .checker-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
        .checker-card { background: var(--color-bg-surface); border: 0.5px solid var(--color-border-default); border-radius: var(--radius-interactive); overflow: hidden; transition: border-color var(--duration-normal) var(--ease-out); }
        .checker-card.running { border-color: var(--color-status-caution-border); }
        .checker-card.done    { border-color: var(--color-status-positive-border); }
        .checker-card.error   { border-color: var(--color-status-negative-border); }
        .checker-head { padding: 12px var(--space-4); min-height: 48px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .checker-label { font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); }
        .checker-badge { font-size: var(--font-size-caption); font-weight: var(--font-weight-semibold); padding: 3px 8px 5px; border-radius: 4px; letter-spacing: 0.03em; }
        .checker-badge.idle    { background: var(--color-bg-raised); color: var(--color-text-faint); }
        .checker-badge.running { background: var(--color-status-caution-bg); color: var(--color-status-caution-text); }
        .checker-badge.done    { background: var(--color-status-positive-bg); color: var(--color-status-positive-text); }
        .checker-badge.error   { background: var(--color-status-negative-bg); color: var(--color-status-negative-text); }
        .checker-body { border-top: 0.5px solid var(--color-border-default); padding: var(--space-4); }
        .checker-result { font-family: 'Courier New', monospace; font-size: var(--font-size-caption); color: var(--color-text-secondary); line-height: var(--line-height-reading); white-space: pre-wrap; word-break: break-word; max-height: 500px; overflow-y: auto; }

        .spinner { width: 12px; height: 12px; border: 2px solid var(--color-border-default); border-top-color: var(--color-accent-primary); border-radius: 50%; animation: spin 0.75s linear infinite; display: inline-block; margin-right: var(--space-2); }
        @keyframes spin { to { transform: rotate(360deg); } }

        .report-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
        .out-label { font-size: var(--font-size-caption); font-weight: var(--font-weight-medium); color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.07em; line-height: var(--line-height-compact); }
        .copy-btn { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: var(--font-size-interaction); font-weight: var(--font-weight-medium); padding: 11px 16px 13px; min-height: 48px; border-radius: var(--radius-interactive); border: 0.5px solid var(--color-border-default); background: var(--color-bg-raised); color: var(--color-text-secondary); cursor: pointer; transition: color var(--duration-normal) var(--ease-out), background-color var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out); }
        .copy-btn.ok { background: var(--color-state-yes-bg); border-color: var(--color-state-yes-border); color: var(--color-state-yes-text); }
        .copy-btn:hover:not(.ok) { border-color: var(--color-border-emphasis); color: var(--color-text-body); }
        .copy-btn:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }

        .error-box { margin: 0 0 var(--space-4); padding: 11px 16px 13px; background: var(--color-status-negative-bg); border: 0.5px solid var(--color-status-negative-border); border-radius: var(--radius-interactive); font-size: var(--font-size-interaction); line-height: var(--line-height-compact); color: var(--color-status-negative-text); }
        .loading-msg { font-size: var(--font-size-interaction); color: var(--color-text-muted); text-align: center; padding: var(--space-8); }

        .nav-attr { display: flex; justify-content: center; align-items: center; gap: var(--space-1); padding: var(--space-4) var(--space-4) 0; margin-top: var(--space-8); font-size: var(--font-size-caption); color: var(--color-text-faint); border-top: 0.5px solid var(--color-border-default); }
        .nav-attr-link { color: var(--color-accent-primary); opacity: 0.65; text-decoration: none; transition: opacity var(--duration-normal) var(--ease-out); cursor: pointer; padding: 8px 4px; min-height: 36px; display: inline-flex; align-items: center; }
        .nav-attr-link:hover { opacity: 1; }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { transition-duration: 0s !important; animation-duration: 0s !important; }
        }
      `}</style>

      <div className="wrap">
        <div className="inner">

          <div className="header">
            <div className="header-title">Skill Adherence</div>
            <div className="header-sub">Upload your .skill file. Three independent checkers cross-reference it against the creating-skills methodology. Fix all violations before running the Skill Evaluator.</div>
          </div>

          {!skill && (
            <>
              {loadError && <div className="error-box">{loadError}</div>}
              {loading ? (
                <div className="loading-msg">Reading .skill file…</div>
              ) : (
                <div
                  className={`drop-zone${dragging ? " drag" : ""}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) loadSkillFile(f); }}
                >
                  <FileUp size={28} strokeWidth={1.25} style={{color:"var(--color-text-faint)",marginBottom:"var(--space-2)"}} />
                  <div className="drop-text">Drop your .skill file or click to upload</div>
                  <div className="drop-hint">.skill zip archive</div>
                  <input ref={fileRef} type="file" accept=".skill" style={{ display: "none" }}
                    onChange={e => { if (e.target.files[0]) loadSkillFile(e.target.files[0]); }} />
                </div>
              )}
            </>
          )}

          {skill && (
            <>
              <div className="skill-card">
                <div className="skill-name">{skill.name}</div>
                <div className="skill-meta">Ready for adherence check</div>
              </div>

              {!running && !allDone && (
                <button className="run-btn" onClick={runCheckers}>
                  Run Adherence Check →
                </button>
              )}

              {error && <div className="error-box">{error}</div>}

              <div className="checker-list">
                {checkers.map(c => (
                  <CheckerCard key={c.id} checker={c} running={running} />
                ))}
              </div>

              {allDone && (
                <div className="report-head">
                  <span className="out-label">All checks complete — paste back to Claude</span>
                  <button className={`copy-btn${copied ? " ok" : ""}`} onClick={copyAll}>
                    {copied ? "Copied ✓" : "Copy All"}
                  </button>
                </div>
              )}

              <button className="run-btn ghost" style={{ marginTop: "0.5rem" }}
                onClick={() => { setSkill(null); setCheckers(prev => prev.map(c => ({ ...c, result: null, status: "idle" }))); setError(""); }}>
                ← Load different skill
              </button>
            </>
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

function CheckerCard({ checker, running }) {
  const [open, setOpen] = useState(false);

  const badgeLabel = {
    idle:    "—",
    running: "Checking…",
    done:    "Done",
    error:   "Error"
  }[checker.status] || "—";

  return (
    <div className={`checker-card ${checker.status}`}>
      <div className="checker-head" onClick={() => setOpen(o => !o)}>
        <div className="checker-label">
          {checker.status === "running" && <span className="spinner" />}
          {checker.label}
        </div>
        <span className={`checker-badge ${checker.status}`}>{badgeLabel}</span>
      </div>
      {open && checker.result && (
        <div className="checker-body">
          <div className="checker-result">{checker.result}</div>
        </div>
      )}
    </div>
  );
}
