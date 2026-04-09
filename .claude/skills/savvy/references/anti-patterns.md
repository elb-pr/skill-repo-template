# Anti-Patterns: Why Skills Fail

Each anti-pattern includes the failure mechanism, measured impact, and concrete fix.

## 1. Positional Anti-Patterns

### 1.1 Critical Rules in the Middle

**What it looks like:**
```xml
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
```

**Why it fails:**
- Middle zone (10-90% of context) receives lowest attention due to RoPE decay
- Critical rules compete with surrounding noise
- >20% accuracy drop for middle-positioned information

**Measured impact:** Instructions in middle ignored 20-40% more often than edges.

**Fix:**
```xml
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
```

---

### 1.2 No Constraint Reminder (Missing Recency Anchor)

**What it looks like:**
```xml
<system>
You MUST output valid JSON only.
</system>

[... 3000 tokens of conversation ...]

<user>
Generate the report.
</user>
```

**Why it fails:**
- Original constraint is thousands of tokens away
- RoPE decay reduces attention to distant instructions
- Recency bias favours recent (unconstraining) content
- No refresh of instruction in working memory

**Measured impact:** 39% performance degradation in multi-turn; constraints "forgotten."

**Fix:**
```xml
<user>
Generate the report.

Remember: Output MUST be valid JSON only, no markdown or prose.
</user>
```

---

## 2. Framing Anti-Patterns

### 2.1 Negative Constraints

**What it looks like:**
```xml
<rules>
- Do NOT mention competitors
- Do NOT use markdown formatting
- Do NOT include personal opinions
- NEVER say "I don't know"
</rules>
```

**Why it fails:**
- Attention is additive; no native "inhibition" circuit
- Processing "Do NOT mention competitors" activates "competitors" concept
- Suppression requires secondary circuit that fails under load
- The "pink elephant" problem: telling someone not to think of X activates X

**Measured impact:** Negative constraints have lowest compliance rate of all constraint types.

**Fix:**
```xml
<rules>
- Mention ONLY products from <approved_list>
- Use plain text formatting exclusively
- Present factual information only
- Provide substantive answers for all queries
</rules>
```

**Pattern:** Every "Don't X" becomes "Do Y instead"

---

### 2.2 Hedging Language

**What it looks like:**
```xml
<guidelines>
You should probably use type hints when possible.
Consider keeping functions under 50 lines if feasible.
It might be helpful to add docstrings.
Try to avoid global variables when you can.
</guidelines>
```

**Why it fails:**
- Hedging words (should, consider, might, try, probably) reduce authority signal
- Fails to activate instruction-following dimension in activation space
- Model treats as suggestions, not requirements
- Competes poorly against stronger signals in context

**Measured impact:** 8-11% improvement when hedging replaced with authority language.

**Fix:**
```xml
<constraints>
ALWAYS include type hints on all function arguments and returns.
Functions MUST NOT exceed 50 lines.
Every function REQUIRES a docstring.
Global variables are FORBIDDEN.
</constraints>
```

---

### 2.3 Vague Quantities

**What it looks like:**
```xml
<format>
Keep it brief.
Include a few examples.
Write around a paragraph.
Use some bullet points.
</format>
```

**Why it fails:**
- Unverifiable constraints have lower compliance
- Model cannot self-check against vague targets
- "Brief" and "few" are subjective, model defaults to training priors
- No clear success criteria

**Measured impact:** Verifiable constraints ("exactly 5") show significantly higher compliance than vague ("a few").

**Fix:**
```xml
<format>
Response MUST be 50-100 words.
Include exactly 3 examples.
Write 2-3 sentences maximum.
Use 4-6 bullet points.
</format>
```

---

## 3. Example Anti-Patterns

### 3.1 Inconsistent Example Formatting

**What it looks like:**
```xml
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
```

**Why it fails:**
- Induction heads pattern-match `[A][B]...[A] → B`
- Inconsistent structure (Input/Question/Q, Output/Answer/A) prevents lock-on
- Different formatting (prose vs number vs bold) confuses copying circuit
- Model cannot determine which pattern to follow

**Measured impact:** Induction heads fail to activate; output format becomes unpredictable.

**Fix:**
```xml
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
```

---

### 3.2 Negative Examples

**What it looks like:**
```xml
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
```

**Why it fails:**
- Induction heads don't understand "bad" vs "good" semantically
- Both patterns are activated and available for copying
- "DON'T do this" comment doesn't inhibit the pattern
- Model may copy the bad example, especially if it appears more recently

**Measured impact:** Negative examples can poison the example set; bad patterns appear in output.

**Fix:**
```xml
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
```

**Rule:** Show only what you want. Never show what you don't want.

---

### 3.3 Too Few or Too Many Examples

**What it looks like:**
```xml
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
```

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
```xml
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
```

**Why it fails:**
- Recency bias gives last example highest attention weight
- Induction heads weight recent patterns more heavily
- Simple examples at end = simple output patterns

**Measured impact:** OptiSeq research shows 6-10.5 percentage point improvement from optimal ordering.

**Fix:**
```xml
<examples>
<example><!-- Simple case --></example>
<example><!-- Medium complexity --></example>
<example><!-- Edge case --></example>
<example><!-- Best, most complete example LAST --></example>
</examples>
```

---

## 4. Structural Anti-Patterns

### 4.1 Markdown for Control Structures

**What it looks like:**
```markdown
### System Instructions

You are a helpful assistant.

### Rules

1. Always be polite
2. Never lie

### Examples

**Input:** Hello
**Output:** Hi there!
```

**Why it fails:**
- Markdown headers (`###`) have variable tokenisation
- May tokenise as `['###', ' System']` or `['\n###', 'System']` depending on context
- "Soft" boundaries; model treats as stylistic, not structural
- High frequency in web training data reduces distinctiveness

**Measured impact:** 74% compliance with Markdown vs 92% with XML.

**Fix:**
```xml
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
```

---

### 4.2 No Clean Handoff Sequence

**What it looks like:**
```xml
<instruction>
Write Python code for the following:
</instruction>
```

**Why it fails:**
- Prompt ends ambiguously
- Model must "heal" the boundary before generating
- May predict space, newline, quote, or prose continuation
- First generated tokens set trajectory; healing wastes them

**Measured impact:** Increased likelihood of prose preamble before code; format drift.

**Fix:**
```xml
<instruction>
Write Python code for the following:
</instruction>

```python
```

The triple-backtick with language forces immediate code-generation mode.

---

### 4.3 Monolithic Instruction Blocks

**What it looks like:**
```xml
<instructions>
You are an expert Python developer who writes clean, efficient code. Always use type hints and docstrings. Never use global variables or eval(). Keep functions under 50 lines. Use descriptive variable names. Follow PEP 8 style guidelines. Include error handling for all IO operations. Write unit tests for public functions. Use logging instead of print statements. Prefer list comprehensions over loops where readable. Always validate input parameters. Return early to avoid deep nesting. Use context managers for resource handling. Document all public APIs. Keep cyclomatic complexity under 10.
</instructions>
```

**Why it fails:**
- Wall of text creates attention dilution
- No structural anchors for induction heads
- Instruction count degradation: compliance drops uniformly as count increases
- Middle instructions lost in the block

**Measured impact:** IBM ScaledIF shows instruction-following degrades predictably with instruction count.

**Fix:**
```xml
<constraints>
<!-- Most critical only -->
1. ALWAYS include type hints
2. Functions MUST have docstrings
3. eval() and global variables FORBIDDEN
</constraints>

<style_guide>
See project STYLE.md for complete guidelines.
</style_guide>
```

**Rule:** Maximum 5-7 constraints in primary block. Reference external docs for the rest.

---

## 5. Content Anti-Patterns

### 5.1 Instructions That Conflict With Examples

**What it looks like:**
```xml
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
```

**Why it fails:**
- Example shows prose + JSON, contradicting rule
- Induction heads copy example pattern
- Examples often override explicit rules when inconsistent
- Model receives conflicting signals

**Measured impact:** Example pattern frequently wins over explicit instruction.

**Fix:**
```xml
<rules>
Output MUST be valid JSON with no additional text.
</rules>

<examples>
<example>
<input>Get user info</input>
<output>{"name": "John", "age": 30}</output>
</example>
</examples>
```

**Rule:** Examples MUST demonstrate rules, never contradict them.

---

### 5.2 Assuming Prior Context

**What it looks like:**
```xml
<instruction>
Continue with the approach we discussed.
Use the format from before.
Apply the same rules as last time.
</instruction>
```

**Why it fails:**
- Each context window is stateless
- "Before" and "last time" have no referent
- Model cannot retrieve information not in current context
- Results in hallucination of assumed context

**Measured impact:** 100% failure rate for references to non-existent prior context.

**Fix:**
```xml
<context>
Previous approach: [explicit summary]
Required format: [explicit specification]
Applicable rules: [explicit list]
</context>

<instruction>
Apply the approach and format specified in <context>.
</instruction>
```

---

### 5.3 Embedded Code That Drifts

**What it looks like:**
```xml
<reference_implementation>
def process_data(items):
    # 200 lines of code copied from actual codebase
    # Last updated: 6 months ago
    # Now out of sync with actual implementation
</reference_implementation>
```

**Why it fails:**
- Embedded code becomes stale
- No automatic sync with source
- Creates silent failures when codebase evolves
- Consumes significant token budget

**Measured impact:** HumanLayer research: "Never send an LLM to do a linter's job"; embedded code drifts from source.

**Fix:**
```xml
<reference>
Implementation: See src/processors/data.py
Run: python -m pytest tests/test_data.py for current behaviour
</reference>
```

**Rule:** Point to files, don't embed them. Let the model read current source.

---

## 6. Cognitive Load Anti-Patterns

### 6.1 "Be Concise" for Complex Tasks

**What it looks like:**
```xml
<instruction>
Solve this complex multi-step problem.
Be concise. Short answer only.
</instruction>
```

**Why it fails:**
- Reasoning requires tokens (Chain-of-Thought)
- "Concise" lobotomises working memory
- Model cannot store intermediate computation state
- Complex problems require explicit reasoning steps

**Measured impact:** GSM8K 19.2% → 79.0% when CoT allowed vs forced conciseness.

**Fix:**
```xml
<instruction>
Solve this complex multi-step problem.

Process:
1. Work through your reasoning in <thinking> tags
2. Show intermediate steps
3. Provide final answer in <answer> tags (this can be concise)
</instruction>
```

**Rule:** Separate reasoning (can be verbose) from final output (can be concise).

---

### 6.2 Single Prompt for Multi-Domain Tasks

**What it looks like:**
```xml
<instruction>
1. Analyse this financial data
2. Generate a marketing report
3. Write technical documentation
4. Create a project timeline
5. Draft customer emails
</instruction>
```

**Why it fails:**
- Each domain activates different knowledge clusters
- Attention must split across unrelated contexts
- Increases "cognitive load" (attention dilution)
- Multi-turn drift compounds across domains

**Measured impact:** 39% degradation in multi-turn; worse for multi-domain.

**Fix:** Use sub-agent architecture. One focused task per prompt.

```xml
<!-- Prompt 1: Financial -->
<instruction>Analyse this financial data.</instruction>

<!-- Prompt 2: Marketing -->
<instruction>Generate a marketing report for [summary from prompt 1].</instruction>
```

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
