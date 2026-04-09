# Evidence Tables

Comprehensive research backing for skill design patterns. All findings include source citations and measured effects.

## 1. Attention Mechanics

### 1.1 The U-Shaped Attention Curve

| Finding | Measured Effect | Source |
|---------|-----------------|--------|
| Information at middle of context has lowest retrieval accuracy | >20% accuracy drop vs edges | Liu et al., "Lost in the Middle", TACL 2024 |
| Performance follows predictable U-curve across all tested models | Affects Claude, GPT-4, Llama, open and closed source | Stanford/Berkeley joint study |
| Effect persists even with 100k+ context windows | Long context doesn't eliminate positional bias | Anthropic internal testing |
| Prompt repetition improves position-sensitive tasks | 21.33% → 97.33% accuracy | Google Research, Dec 2025 |

### 1.2 Attention Sinks

| Finding | Measured Effect | Source |
|---------|-----------------|--------|
| First ~4 tokens receive disproportionate attention regardless of content | Consistent across architectures | Xiao et al., "StreamingLLM", ICLR 2024 |
| Removing sink tokens causes catastrophic perplexity collapse | Model loses stability anchor | MIT HAN Lab |
| Preserving sink tokens enables 4M+ token processing | 22.2x speedup with StreamingLLM | Xiao et al. |

### 1.3 Positional Encoding Effects

| Mechanism | Effect | Implication |
|-----------|--------|-------------|
| RoPE long-term decay | Attention scores decay with distance | Recent tokens favoured |
| Causal masking | Early tokens visible to all subsequent | Primacy zone naturally attended |
| Softmax normalisation | Attention must sum to 1.0 | Excess attention goes to sinks |

## 2. Multi-Turn Degradation

### 2.1 Microsoft 2025 Study (200,000+ simulated conversations)

| Metric | Single-Turn Baseline | Multi-Turn | Delta |
|--------|---------------------|------------|-------|
| Overall performance | 90% | 65% | -25 points |
| Average across 15 LLMs | 100% (normalised) | 61% | -39% |
| Aptitude (raw capability) | Baseline | -15% | Knowledge retrieval interference |
| Unreliability (constraint violation) | Baseline | +112% | Catastrophic increase |

### 2.2 Failure Mechanisms

| Mechanism | Description | Source |
|-----------|-------------|--------|
| Wrong turn feedback loop | Model consumes own errors as context | Microsoft 2025 |
| Recency bias override | Recent (flawed) output beats distant system prompt | Attention mechanics |
| KV cache pollution | Errors persist in key-value cache | Transformer architecture |
| Recovery rate | Near zero once wrong turn taken | Empirical observation |

### 2.3 Mitigation Effectiveness

| Strategy | Performance Recovery | Source |
|----------|---------------------|--------|
| Consolidation before generation | 95.1% of single-turn baseline | Microsoft 2025 |
| Recap strategy | Partial improvement | Microsoft 2025 |
| Fresh session restart | Full reset | Empirical |
| Temperature tuning | Minimal benefit | Temperature 0 still unreliable |

## 3. Format Effectiveness

### 3.1 Tokenisation Stability

| Format | Tokenisation Behaviour | Stability | Source |
|--------|------------------------|-----------|--------|
| XML `<tag>` | Distinct, predictable tokens | HIGH | BPE tokenizer analysis |
| Markdown `###` | Variable, merges with whitespace | MEDIUM-LOW | Tokenizer studies |
| JSON `{}` | Structured but syntax-heavy | MEDIUM | Format comparison research |
| Plain text | Ambiguous boundaries | LOW | Baseline |

### 3.2 Compliance Rates by Format

| Format | Instruction Following Rate | Source |
|--------|---------------------------|--------|
| Markdown | 92% (normalised benchmark) | Cross-format studies |
| YAML | 90% | Low token overhead |
| XML/HTML | 88% | Explicit segmentation |
| JSON | 74% | Syntax maintenance overhead |

### 3.3 Claude-Specific XML Preference

| Factor | Explanation | Source |
|--------|-------------|--------|
| Constitutional AI training | Training data uses XML-like delimiters for thought/answer separation | Anthropic methodology |
| Code training distribution | Heavy exposure to HTML/XML in codebase training | Training data composition |
| Hard boundary creation | Tags prevent "context bleeding" between sections | Mechanistic analysis |

## 4. Trigger Vocabulary

### 4.1 Authority Markers

| Word Category | Examples | Effect | Source |
|---------------|----------|--------|--------|
| Imperatives | MUST, SHALL, ALWAYS | Activates instruction-following dimension | RepE research |
| Specificity | exactly, precisely, specifically | Higher compliance for verifiable constraints | IFEval benchmarks |
| Urgency | critical, required, forbidden | 8-11% improvement (EmotionPrompt) | EmotionPrompt paper |
| Hedging | should, consider, might | Reduces compliance | Inverse correlation observed |

### 4.2 EmotionPrompt Research

| Technique | Baseline | With Urgency | Improvement | Source |
|-----------|----------|--------------|-------------|--------|
| Big-Bench tasks | Baseline | +8-11% | Significant | EmotionPrompt paper |
| Instruction Induction | 74.1% | 94.6% | +20.5% | EmotionPrompt paper |

### 4.3 Capitalisation Effects

| Style | Effect | Mechanism |
|-------|--------|-----------|
| ALL CAPS for rules | Increased salience | Visual distinctiveness increases attention weight |
| Sentence case | Standard processing | No special treatment |
| all lowercase | Reduced salience | May be processed as less important |

## 5. Example Mechanics (Few-Shot Learning)

### 5.1 Induction Head Circuit

| Component | Function | Source |
|-----------|----------|--------|
| Previous-Token Head | Identifies token A matching current token A' | Olsson et al., "In-context Learning and Induction Heads" |
| Copying mechanism | Increases probability of B (token following A) | Transformer Circuits research |
| Emergence threshold | ~2.5B parameters | Phase transition studies |

### 5.2 Example Count Effectiveness

| Shot Count | Effect | Source |
|------------|--------|--------|
| 0-shot | Baseline capability only | Standard |
| 1-shot | +17.1% over zero-shot | Few-shot studies |
| 3-shot | Near optimal for most tasks | Empirical testing |
| 5-shot | Peak performance, diminishing returns begin | Google NeurIPS 2024 |
| Many-shot (100+) | Can overcome pretraining biases; MATH 42%→62% | Google NeurIPS 2024 |

### 5.3 Example Quality Factors

| Factor | Finding | Source |
|--------|---------|--------|
| Label accuracy | Often doesn't matter; format matters more | Min et al., EMNLP 2022 |
| Consistency | Inconsistent examples = induction head failure | Mechanistic analysis |
| Ordering | Last example gets most attention (recency) | OptiSeq 2025 |
| Order optimisation | 6-10.5 percentage point improvement | OptiSeq 2025 |

### 5.4 Negative Examples

| Finding | Explanation | Source |
|---------|-------------|--------|
| Negative examples activate prohibited pattern | "Don't do X" requires processing X first | Attention mechanics |
| No native inhibition | Standard attention heads are additive | Circuit analysis |
| Suppression circuit fragility | Secondary suppression fails under load | Mechanistic research |

## 6. Instruction Conflict Resolution

### 6.1 Priority Hierarchy (Observed)

| Priority | Factor | Wins When |
|----------|--------|-----------|
| 1 | Recency | Most recent instruction takes precedence |
| 2 | Specificity | Specific beats general |
| 3 | Helpfulness alignment | Instructions aligned with "being helpful" |
| 4 | Training distribution match | Instructions resembling training data |
| 5 | Semantic clarity | Explicit markers beat implicit |

### 6.2 System Prompt Authority

| Finding | Measured Effect | Source |
|---------|-----------------|--------|
| System prompts have no architectural privilege | All text processed equally (kernel mode) | OpenAI Instruction Hierarchy paper |
| Authority is statistical, not structural | Emerges from RLHF training distribution | Mechanistic analysis |
| Instruction hierarchy training improves robustness | +63% system prompt extraction defence, +30% jailbreak robustness | OpenAI 2024 |

## 7. Advanced Techniques

### 7.1 Chain-of-Thought

| Finding | Effect | Source |
|---------|--------|--------|
| CoT enables inherently serial computation | Expands computational power class beyond TC⁰ | Li et al., ICLR 2024 |
| GSM8K improvement | 19.2% → 79.0% | CoT paper |
| Scale threshold for effectiveness | 2.8B+ parameters | Mechanistic CoT research |

### 7.2 Reflexion (Self-Correction)

| Benchmark | Baseline | With Reflexion | Improvement |
|-----------|----------|----------------|-------------|
| HumanEval (coding) | 60% | 91% | +31 points |

### 7.3 Self-Reminder Technique

| Finding | Effect | Source |
|---------|--------|--------|
| Jailbreak success rate reduction | 67.21% → 19.34% | Self-Reminder paper |
| Mechanism | Refreshes instruction in recency zone | Attention leverage |

### 7.4 Metacognitive Prompting

| Finding | Effect | Source |
|---------|--------|--------|
| 5-stage self-reflection process | Up to 26.9% improvement on domain-specific tasks | Wang et al., NAACL 2024 |
| Effect scales with model size | Most pronounced in larger models | Same study |

## 8. Failure Mode Analysis

### 8.1 Instruction Following Benchmarks

| Benchmark | What It Tests | Key Finding |
|-----------|---------------|-------------|
| IFEval | 25 types of verifiable instructions | Compliance degrades with instruction count |
| FollowBench | Multi-level constraint following | Format > content > style compliance |
| InFoBench | Information-seeking instruction following | Specificity correlates with compliance |
| AdvancedIF | Human-written rubrics | 0.728 F1 agreement with human evaluators |

### 8.2 Compliance by Constraint Type

| Constraint Type | Compliance Rate | Difficulty |
|-----------------|-----------------|------------|
| Format (JSON, length) | Highest | Verifiable, clear boundaries |
| Content (include X) | Medium | Requires retrieval |
| Style (tone, voice) | Lower | Subjective, harder to verify |
| Negative (don't do X) | Lowest | Requires suppression circuits |

### 8.3 Sycophancy

| Finding | Effect | Source |
|---------|--------|--------|
| RLHF models exhibit sycophancy | Agreement rates >80% on belief-oriented prompts | Anthropic sycophancy research |
| "Are you sure?" causes incorrect revision | Correct answers revised to incorrect up to 50% | Same study |
| Root cause | Human preference training rewards agreement | RLHF mechanics |

## 9. Persuasion Principles (Meincke et al., 2025)

### 9.1 Tested Principles (N=28,000 conversations)

| Principle | Effect on Compliance | Best Use |
|-----------|---------------------|----------|
| Authority | Strong increase | Discipline-enforcing skills |
| Commitment | Strong increase | Multi-step processes |
| Scarcity | Moderate increase | Time-sensitive requirements |
| Social Proof | Moderate increase | Establishing norms |
| Unity | Moderate increase | Collaborative workflows |
| Reciprocity | Weak/manipulative | Avoid |
| Liking | Creates sycophancy | Avoid for compliance |

### 9.2 Overall Effect

| Metric | Without Persuasion | With Persuasion | Source |
|--------|-------------------|-----------------|--------|
| Compliance rate | 33% | 72% | Meincke et al., 2025 |

## 10. Cross-Model Patterns

### 10.1 Universal Patterns

| Pattern | Applies To | Confidence |
|---------|-----------|------------|
| U-shaped attention curve | All transformer LLMs | HIGH |
| Primacy/recency bias | All autoregressive models | HIGH |
| Induction head mechanics | Models >2.5B parameters | HIGH |
| Positive > negative framing | All tested models | HIGH |
| Example consistency requirement | All models with ICL | HIGH |

### 10.2 Claude-Specific Patterns

| Pattern | Specificity | Source |
|---------|-------------|--------|
| XML tag preference | Claude-specific (Constitutional AI training) | Anthropic methodology |
| `<thinking>` tag behaviour | Claude-specific | Training structure |
| Higher baseline instruction following | Claude vs GPT comparison | Benchmark comparisons |

### 10.3 Variance Across Models

| Factor | Variance | Notes |
|--------|----------|-------|
| Optimal example count | Low variance | 3-5 universal |
| Format preference | Medium variance | XML best for Claude, Markdown acceptable for GPT |
| Trigger word effectiveness | Medium variance | Authority words universal, specific words vary |
| Context length tolerance | High variance | Model-specific effective windows |
