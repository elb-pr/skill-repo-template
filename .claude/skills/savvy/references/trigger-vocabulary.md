# Trigger Vocabulary Reference

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
```xml
<constraints>
1. Output MUST be valid JSON          <!-- CAPS for critical -->
2. Include **all required fields**    <!-- Bold for emphasis -->
3. Timestamps use ISO 8601 format     <!-- Normal for standard -->
</constraints>
```

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

```xml
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
```

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

```xml
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
```

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

```xml
<!-- BETTER: Positive + Verification -->
<constraints>
1. Use plain text formatting exclusively
2. Before outputting, verify response contains no markdown symbols (*, #, `, [])
3. If markdown detected, regenerate in plain text
</constraints>
```

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

```xml
<constraints>
Output MUST be valid JSON.

This is critical - invalid JSON will cause system failure.
Verify JSON validity before responding.
</constraints>
```

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

```
MUST, SHALL, ALWAYS, REQUIRED, FORBIDDEN
exactly, precisely, strictly, only, exclusively
critical, essential, mandatory
[specific numbers and ranges]
[positive framing]
[imperative sentences]
```

### ❌ Avoid These

```
should, could, might, perhaps, consider
try to, if possible, when feasible, ideally
a few, some, several, around, approximately
Don't, Never, Avoid, No [negative framing]
[questions, suggestions, conditionals]
```

### Constraint Template

```xml
<constraints>
1. [Action verb] MUST [specific requirement]
2. Output REQUIRED in [exact format]
3. [Resource] exclusively from <source_tag>
4. [Quantity] exactly [number]
5. Before responding, verify [checkable condition]
</constraints>
```
