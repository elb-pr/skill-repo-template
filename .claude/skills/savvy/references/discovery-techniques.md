# Discovery Techniques Reference

Comprehensive guide to gathering complete context before writing skills. Combines human interview psychology with agentic architecture patterns.

## Core Principle

**Decouple Context Acquisition from Task Execution.** The most common failure mode in skill creation is premature execution - writing instructions before fully understanding what needs to be taught.

Discovery has two phases:
1. **Clarifying Questions** - Stabilise user intent through dialogue
2. **Domain Research** - Fill knowledge gaps through investigation

---

## Phase 1: Clarifying Questions

### Why People Can't Tell You What They Want

Users struggle to articulate needs for predictable reasons:

| Barrier | Description | Implication |
|---------|-------------|-------------|
| **Tacit knowledge** | Know how but can't verbalise | Ask for demonstrations, not explanations |
| **Habituation** | Stopped noticing friction | Ask about frustrations, not workflows |
| **Vocabulary gaps** | Lack technical language | Listen for circumlocution |
| **Social desirability** | Say what sounds good | Focus on past behaviour, not intentions |

### The Mom Test Principle

**Past behaviour is the only reliable data.** Hypotheticals and preferences are unreliable because people can't accurately predict their own future behaviour.

| Ask This | Not This |
|----------|----------|
| "Tell me about the last time you faced this problem" | "Would you use this feature?" |
| "What similar services have you paid for?" | "How much would you pay?" |
| "Walk me through what happened" | "What do you usually do?" |

**Three types of bad data to redirect:**
- **Compliments** - Generic praise without decision implications
- **Fluff** - "I usually...", "I always...", "I never..."
- **Hypothetical maybes** - "I would...", "I might...", "I could..."

When these appear: "Can you walk me through the last time that actually happened?"

### Detecting Ambiguity

Before asking questions, identify what's unclear:

| Type | Example | Detection |
|------|---------|-----------|
| **Lexical** | "Performance" (speed vs accuracy?) | Word has multiple meanings |
| **Scope** | "Analyse sales" (what date range?) | Missing boundaries |
| **Vagueness** | "Make it good" (by what criteria?) | Underspecified constraints |

**Future-Turn Simulation:** Mentally simulate multiple outcomes. If they diverge significantly (one path leads to code, another to prose), the request is ambiguous.

### Question Selection (EVPI)

Don't ask random questions. Prioritise by information gain.

**EVPI (Expected Value of Perfect Information):** Ask a question only if the expected value of the answer exceeds the cost of asking (latency + user friction).

Research shows EVPI-guided questioning achieves:
- 7-39% higher task completion on ambiguous queries
- 2.7x fewer unnecessary questions

### Question Sequencing

Follow cognitive load principles (Bloom's Taxonomy adapted):

1. **Recall** - Simple facts: "What's the deadline?"
2. **Clarify** - Disambiguation: "Do you mean speed or accuracy?"
3. **Evaluate** - Complex decisions: "Which of these approaches fits better?"

**Funnel Technique (broad → narrow):**
1. "Tell me about your experience with [domain]" (broad)
2. "What factors matter most when you [task]?" (narrower)
3. "How important is [X] compared to [Y]?" (specific)
4. "So you prioritise [X] - is that right?" (confirming)

### The OARS Framework

From motivational interviewing - structures evocative dialogue:

- **Open questions** - Invite storytelling: "What concerns you most about...?"
- **Affirmations** - Recognise strengths: "You've clearly thought about this carefully"
- **Reflections** - Mirror understanding: "So what I'm hearing is..."
- **Summaries** - Consolidate: "Let me make sure I have this right..."

**Key insight:** You elicit more of what you reflect. Reflecting concerns produces more concerns; reflecting possibilities produces more possibilities.

### Socratic Question Types

Six categories for systematic exploration:

| Type | Purpose | Example |
|------|---------|---------|
| **Clarifying** | Define terms | "What do you mean by 'complicated'?" |
| **Assumption** | Surface beliefs | "What are we assuming here?" |
| **Evidence** | Ground in specifics | "Can you give an example?" |
| **Perspective** | Broaden view | "How might someone else see this?" |
| **Implication** | Explore consequences | "What would happen if...?" |
| **Meta** | Examine the question | "Why is this question important?" |

### Jobs-to-be-Done Framework

Understand why people "hire" solutions through the Four Forces:

**Forces promoting change:**
- **Push** - Current frustration ("My spreadsheet is too clunky")
- **Pull** - Appeal of new solution ("This looks easier")

**Forces blocking change:**
- **Anxiety** - Fear of unknown ("What if it's hard to learn?")
- **Habit** - Comfort with present ("I'm used to my old way")

Switch only occurs when Push + Pull > Anxiety + Habit.

**Timeline questions:**
1. "When did you first start thinking about this?"
2. "What was frustrating about how you handled it before?"
3. "Walk me through the last time you dealt with this"
4. "What made you decide 'today's the day'?"

### Question Mechanics

**Pacing:**
- 60-90 minutes max before fatigue
- Wait 7 seconds after asking before speaking again
- Pause 2-3 seconds after answers - they may elaborate

**Silence is a tool.** Humans become uncomfortable after 4 seconds. Use this strategically.

### Confidence Threshold

**Stop asking when:**
- Hearing the same information repeated
- Can predict what they'll say
- Can specify measurable "fit criteria" for requirements
- 80%+ confidence you understand the need

**Signs you're missing something:**
- Hesitation before answers
- Qualifying statements ("usually", "mostly")
- Deflection to others
- Overly quick dismissals

---

## Phase 2: Domain Research

Once requirements are clear, fill knowledge gaps through investigation.

### Search Topologies

Choose strategy based on task:

| Strategy | Best For | Pattern |
|----------|----------|---------|
| **Breadth-First** | Exploration | Search all sub-topics in parallel |
| **Depth-First** | Verification | Follow single chain of evidence |
| **Tree of Thoughts** | Complex reasoning | Explore multiple branches, backtrack dead ends |

### Resolving Conflicting Information

**TruthFinder (Bayesian approach):**
- Source is trustworthy if it provides many true facts
- Fact is likely true if provided by many trustworthy sources
- Iterate scoring to discount low-quality sources

**Multi-perspective validation:**
- Seek sources that would disagree if wrong
- Weight authoritative sources over aggregators
- Note where consensus exists vs where it's contested

### Stopping Criteria (Stop-RAG)

**The problem:** Fixed loops ("always search 5 times") are inefficient.

**The solution:** Value-based stopping:
- Estimate "future reward" of one more search
- If expected gain < cost of search, stop
- Prevents infinite loops, saves tokens

**Saturation indicators:**
- 6-12 sources typically reach saturation
- First 5-6 produce majority of new information
- Stop after 3 consecutive sources with no new themes

### Implicit Requirement Detection

Reduce friction by inferring unspoken requirements:

- If user asks for "Python data analysis" → assume pandas/numpy
- If context is "production code" → assume error handling expected
- If audience is "beginners" → assume jargon needs explanation

Only ask to confirm when inference is uncertain.

---

## Practical Question Sequences

### Understanding Current Situation
1. "Tell me about what you're working on"
2. "Walk me through how you currently handle [aspect]"
3. "What was happening the last time that felt frustrating?"
4. "What do you mean by [vague term]?"

### Uncovering Goals
1. "What would success look like?"
2. "If this worked perfectly, what would be different?"
3. "What made you start thinking about this now?"
4. "What happens if you don't address this?"

### Surfacing Constraints
1. "What have you already tried?"
2. "What would worry you about [approach]?"
3. "What would need to be true for this to work?"
4. "Who else is affected?"

### Deepening Exploration
- "Tell me more about that..."
- "What do you mean by...?"
- "Can you give a specific example?"
- "It sounds like..." [reflection]
- [Silence - wait 5-7 seconds]

### Moving to Action
1. "Given everything, what stands out as most important?"
2. "What would be the smallest first step?"
3. "What would you need to feel confident moving forward?"

---

## Integration with Skill Creation

After discovery, you should be able to answer:

**About the skill's purpose:**
- [ ] What specific problem does this solve?
- [ ] Who is the target user?
- [ ] What does success look like?
- [ ] What are the failure modes?

**About the domain:**
- [ ] What's the current best practice?
- [ ] What are common mistakes?
- [ ] What terminology matters?
- [ ] What tools/techniques are involved?

**About constraints:**
- [ ] What must always happen?
- [ ] What must never happen?
- [ ] What edge cases exist?
- [ ] What assumptions are we making?

If gaps remain, return to questioning or research before writing.
