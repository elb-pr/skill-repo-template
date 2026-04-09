# Attention Mechanics: The Physics of Instruction Following

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

```
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
```

### Why It Exists

Three architectural factors combine:

#### 1.1 Attention Sinks (Primacy)

The **softmax function** normalises attention scores to sum to 1.0:

```
attention_weight[i] = exp(score[i]) / Σ exp(score[j])
```

When the current token has no strong semantic relationship to any context token, the probability mass must still go somewhere. Models learn to designate the **first few tokens** as "sinks" to absorb excess attention.

**Result:** First ~4 tokens receive disproportionate attention regardless of content.

**Measured effect:** Removing sink tokens causes catastrophic perplexity collapse.

#### 1.2 RoPE Decay (Recency Bias)

**Rotary Position Embeddings (RoPE)** encode position by rotating query/key vectors:

```
attention_score(q_m, k_n) ∝ f(m - n)  # depends on relative distance
```

RoPE has **long-term decay**: attention scores decrease as relative distance increases.

**Result:** Recent tokens naturally receive higher attention due to proximity.

#### 1.3 Causal Masking (Primacy Reinforcement)

In autoregressive models, each token can only attend to previous tokens:

```
Token at position n can see: [0, 1, 2, ..., n-1]
```

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

```
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
```

### 3.2 The Self-Reminder Technique

Exploit recency bias to refresh instructions:

**Problem:** Constraints in system prompt decay over long context.

**Solution:** Restate constraints at the END of the skill.

```xml
<constraints_reminder>
Before responding, verify:
1. Output is valid JSON
2. All required fields present
3. No prohibited terms used
</constraints_reminder>
```

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
```
"### Instructions" might tokenise as:
  ['###', ' Instructions']
  ['\n', '###', 'Instructions']
  ['#', '##', ' Instructions']
```

**XML tags** have stable tokenisation:
```
"<instructions>" typically tokenises as:
  ['<', 'instructions', '>']  (predictable)
```

**Result:** XML creates "hard" attention boundaries; Markdown creates "soft" ones.

| Format | Boundary Type | Compliance |
|--------|--------------|------------|
| XML | Hard (distinct tokens) | 92% |
| Markdown | Soft (variable tokens) | 74% |

### 4.2 Claude's XML Preference

Claude was trained with **Constitutional AI** using XML-like structures:
- `<thinking>` tags for reasoning
- Structured delimiters for safe/unsafe separation
- Heavy code/HTML training data

Using XML activates the same attention patterns as Claude's alignment training.

### 4.3 Token Healing

**Problem:** If a prompt ends mid-token, the model must "heal" the boundary:

```
Bad:  "The code is: "  (trailing space - ambiguous next token)
Good: "The code is:\n\n```python\n"  (forces code mode)
```

**Mechanism:** Token healing consumes the first generation step, disrupting induction heads.

**Solution:** End prompts with clean "handoff sequences" that prime expected output.

## 5. Induction Heads

### 5.1 What They Are

Specialised attention circuits that implement pattern matching:

```
Algorithm:
  IF current_token == A 
  AND past_context contains [A, B]
  THEN predict B
```

This is the mechanism behind few-shot learning.

### 5.2 How Examples Program Them

When you provide examples:
```xml
<example>
<input>X</input>
<o>Y</o>
</example>
```

You're creating pattern `[input, X, output, Y]` for induction heads to match and copy.

### 5.3 Why Consistency Matters

Induction heads need consistent patterns to lock on:

**Inconsistent (fails):**
```
Example 1: Input: X → Output: Y
Example 2: Question: A → Answer: B
Example 3: Q: M → A: N
```
Heads can't find stable pattern `[A][B]...[A]→B`

**Consistent (works):**
```
Example 1: <input>X</input><o>Y</o>
Example 2: <input>A</input><o>B</o>
Example 3: <input>M</input><o>N</o>
```
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
