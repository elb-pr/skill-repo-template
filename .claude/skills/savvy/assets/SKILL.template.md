---
name: your-skill-name
description: Use when [specific triggers and conditions] - [what the skill does in third person]
version: 1.0.0
author: User
---

<identity>
You are [ROLE]. Your primary function is [CORE_TASK].

[Optional: 1-2 sentences of critical context that defines behaviour]
</identity>

<constraints>
  RULES FOR CONSTRAINTS:
  - Maximum 5-7 rules (compliance degrades with count)
  - Use CAPS for critical keywords (MUST, ALWAYS, NEVER)
  - Positive framing only ("Do Y" not "Don't X")
  - Specific and verifiable ("exactly 5" not "a few")
  - Authority language (required, forbidden, critical)

1. ALWAYS [required behaviour - most important first]
2. [Output format] MUST be [specific format]
3. [Specific constraint with exact parameters]
4. [Reframed negative: "Use X exclusively" instead of "Don't use Y"]
5. [Final critical constraint]
</constraints>


<methodology>
1. [First step - what to do initially]
2. [Second step - main processing]
3. [Third step - validation/checking]
4. [Fourth step - output generation]
</methodology>

<context>
  Background information, reference data, supporting details.
  This content is OK to be in the middle - it's not critical for compliance.
  Keep this section as brief as possible.

[Background information that provides context]
[Reference data if needed]
</context>

<examples>
  RULES FOR EXAMPLES:
  - Include 3-5 examples (optimal for induction heads)
  - Perfect format consistency across all examples
  - NO negative examples (they activate the wrong pattern)
  - Increasing complexity: simple → edge case → best example LAST
  - Examples must match constraints exactly

<example>
<input>[Simple, clear input case]</input>
<o>[Output that exactly matches format constraints]</o>
</example>

<example>
<input>[Edge case or variation]</input>
<o>[Correct handling of edge case]</o>
</example>

<example>
<input>[Most complex/comprehensive example - THIS ONE MATTERS MOST]</input>
<o>[Perfect output demonstrating all constraints - BEST EXAMPLE LAST]</o>
</example>
</examples>

<output_format>
  Explicit format specification with clean handoff sequence.
  This primes the model for the expected output structure.

Output MUST be formatted as:
[Explicit structure specification]
</output_format>

<constraints_reminder>
  SELF-REMINDER TECHNIQUE:
  Restate 2-3 most critical constraints here.
  This refreshes instructions in working memory via recency bias.
  Measured effect: Significantly reduces constraint violation.

Before responding, verify:
1. [Critical constraint 1 - restated]
2. [Critical constraint 2 - restated]
3. [Output format requirement - restated]
</constraints_reminder>
