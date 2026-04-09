#!/usr/bin/env python3
"""
Skill Validator: Validates SKILL.md files against evidence-based structural rules.

Usage:
    python validate_skill.py path/to/SKILL.md
    python validate_skill.py path/to/skills/directory --recursive

Exit codes:
    0 - All validations passed
    1 - Warnings only (skill may work but could be improved)
    2 - Errors found (skill likely to have compliance issues)
"""

import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Tuple, Optional
from enum import Enum


class Severity(Enum):
    ERROR = "ERROR"
    WARNING = "WARNING"
    INFO = "INFO"


@dataclass
class ValidationResult:
    severity: Severity
    rule: str
    message: str
    line: Optional[int] = None
    suggestion: Optional[str] = None


@dataclass
class SkillAnalysis:
    path: Path
    content: str
    lines: List[str]
    results: List[ValidationResult] = field(default_factory=list)
    
    # Computed properties
    word_count: int = 0
    has_frontmatter: bool = False
    has_identity: bool = False
    has_constraints: bool = False
    has_examples: bool = False
    has_output_format: bool = False
    has_constraint_reminder: bool = False
    
    def add(self, severity: Severity, rule: str, message: str, 
            line: Optional[int] = None, suggestion: Optional[str] = None):
        self.results.append(ValidationResult(severity, rule, message, line, suggestion))
    
    def error(self, rule: str, message: str, line: Optional[int] = None, suggestion: Optional[str] = None):
        self.add(Severity.ERROR, rule, message, line, suggestion)
    
    def warning(self, rule: str, message: str, line: Optional[int] = None, suggestion: Optional[str] = None):
        self.add(Severity.WARNING, rule, message, line, suggestion)
    
    def info(self, rule: str, message: str, line: Optional[int] = None, suggestion: Optional[str] = None):
        self.add(Severity.INFO, rule, message, line, suggestion)
    
    @property
    def has_errors(self) -> bool:
        return any(r.severity == Severity.ERROR for r in self.results)
    
    @property
    def has_warnings(self) -> bool:
        return any(r.severity == Severity.WARNING for r in self.results)


# ============================================================================
# VALIDATION RULES
# ============================================================================

def validate_frontmatter(analysis: SkillAnalysis) -> None:
    """Check YAML frontmatter exists and is properly formatted."""
    content = analysis.content
    
    # Check for frontmatter
    if not content.startswith('---'):
        analysis.error(
            "FRONTMATTER-001",
            "Missing YAML frontmatter. Skills must start with ---",
            line=1,
            suggestion="Add frontmatter: ---\\nname: skill-name\\ndescription: Use when...\\n---"
        )
        return
    
    # Find closing ---
    second_marker = content.find('---', 3)
    if second_marker == -1:
        analysis.error(
            "FRONTMATTER-002", 
            "Unclosed frontmatter. Missing closing ---",
            suggestion="Add closing --- after frontmatter fields"
        )
        return
    
    analysis.has_frontmatter = True
    frontmatter = content[3:second_marker].strip()
    
    # Check for required fields
    if 'name:' not in frontmatter:
        analysis.error(
            "FRONTMATTER-003",
            "Missing 'name' field in frontmatter",
            suggestion="Add: name: your-skill-name"
        )
    
    if 'description:' not in frontmatter:
        analysis.error(
            "FRONTMATTER-004",
            "Missing 'description' field in frontmatter",
            suggestion="Add: description: Use when [triggers] - [what it does]"
        )
    else:
        # Check description starts with "Use when"
        desc_match = re.search(r'description:\s*["\']?(.+)', frontmatter)
        if desc_match:
            desc = desc_match.group(1).strip().strip('"\'')
            if not desc.lower().startswith('use when'):
                analysis.warning(
                    "FRONTMATTER-005",
                    "Description should start with 'Use when' for discoverability",
                    suggestion=f"Change to: description: Use when [triggers] - {desc}"
                )


def validate_structure(analysis: SkillAnalysis) -> None:
    """Check for required structural elements and their positioning."""
    content = analysis.content.lower()
    lines = analysis.lines
    
    # Find positions of key sections (case-insensitive)
    identity_pos = find_tag_position(content, 'identity')
    constraints_pos = find_tag_position(content, 'constraints')
    examples_pos = find_tag_position(content, 'examples')
    output_format_pos = find_tag_position(content, 'output_format') or find_tag_position(content, 'output-format')
    reminder_pos = find_tag_position(content, 'constraints_reminder') or find_tag_position(content, 'reminder')
    
    total_len = len(content)
    
    # Check identity exists and is in primacy zone
    if identity_pos is not None:
        analysis.has_identity = True
        position_pct = identity_pos / total_len * 100
        if position_pct > 15:
            analysis.warning(
                "STRUCTURE-001",
                f"<identity> section at {position_pct:.0f}% - should be in first 10% (primacy zone)",
                suggestion="Move identity/role definition to the very beginning after frontmatter"
            )
    else:
        analysis.warning(
            "STRUCTURE-002",
            "No <identity> section found",
            suggestion="Add <identity> section at the start defining role and function"
        )
    
    # Check constraints in primacy zone
    if constraints_pos is not None:
        analysis.has_constraints = True
        position_pct = constraints_pos / total_len * 100
        if position_pct > 20:
            analysis.warning(
                "STRUCTURE-003",
                f"<constraints> section at {position_pct:.0f}% - should be in first 15% (primacy zone)",
                suggestion="Move critical constraints closer to the beginning"
            )
    else:
        analysis.warning(
            "STRUCTURE-004",
            "No <constraints> section found",
            suggestion="Add <constraints> section with critical rules"
        )
    
    # Check examples in recency zone
    if examples_pos is not None:
        analysis.has_examples = True
        position_pct = examples_pos / total_len * 100
        if position_pct < 60:
            analysis.warning(
                "STRUCTURE-005",
                f"<examples> section at {position_pct:.0f}% - should be in last 30% (recency zone)",
                suggestion="Move examples toward the end of the skill"
            )
    else:
        analysis.warning(
            "STRUCTURE-006",
            "No <examples> section found",
            suggestion="Add 3-5 examples in <examples> section - critical for induction head priming"
        )
    
    # Check output format exists
    if output_format_pos is not None:
        analysis.has_output_format = True
    else:
        analysis.info(
            "STRUCTURE-007",
            "No <output_format> section found",
            suggestion="Consider adding explicit output format specification"
        )
    
    # Check constraint reminder at end
    if reminder_pos is not None:
        analysis.has_constraint_reminder = True
        position_pct = reminder_pos / total_len * 100
        if position_pct < 85:
            analysis.warning(
                "STRUCTURE-008",
                f"Constraint reminder at {position_pct:.0f}% - should be in last 10% (recency zone)",
                suggestion="Move constraints_reminder to the very end for self-reminder technique"
            )
    else:
        analysis.warning(
            "STRUCTURE-009",
            "No constraint reminder section found",
            suggestion="Add <constraints_reminder> at the end to leverage recency bias"
        )


def validate_formatting(analysis: SkillAnalysis) -> None:
    """Check formatting choices align with research."""
    content = analysis.content
    
    # Check for markdown headers used as structure (anti-pattern)
    markdown_headers = re.findall(r'^#{1,3}\s+\w+', content, re.MULTILINE)
    xml_tags = re.findall(r'<\w+>', content)
    
    if len(markdown_headers) > 3 and len(xml_tags) < 3:
        analysis.warning(
            "FORMAT-001",
            f"Using Markdown headers ({len(markdown_headers)}) instead of XML tags ({len(xml_tags)}) for structure",
            suggestion="XML tags provide 'hard' boundaries; Markdown has variable tokenisation (92% vs 74% compliance)"
        )
    
    # Check for common XML tags
    recommended_tags = ['identity', 'constraints', 'examples', 'output']
    found_tags = [tag for tag in recommended_tags if f'<{tag}' in content.lower()]
    
    if len(found_tags) < 2:
        analysis.info(
            "FORMAT-002",
            f"Only {len(found_tags)} recommended XML tags found",
            suggestion="Consider using: <identity>, <constraints>, <examples>, <output_format>"
        )


def validate_language(analysis: SkillAnalysis) -> None:
    """Check for effective vs ineffective language patterns."""
    content = analysis.content
    
    # Authority words (good)
    authority_words = ['must', 'shall', 'always', 'never', 'required', 'forbidden', 'exactly', 'precisely']
    authority_count = sum(len(re.findall(rf'\b{word}\b', content, re.IGNORECASE)) for word in authority_words)
    
    # Hedging words (bad)
    hedging_words = ['should', 'could', 'might', 'perhaps', 'consider', 'try to', 'if possible', 'when feasible']
    hedging_matches = []
    for word in hedging_words:
        matches = re.findall(rf'\b{word}\b', content, re.IGNORECASE)
        hedging_matches.extend(matches)
    
    if len(hedging_matches) > authority_count:
        analysis.warning(
            "LANGUAGE-001",
            f"More hedging words ({len(hedging_matches)}) than authority words ({authority_count})",
            suggestion="Replace 'should/could/might' with 'MUST/SHALL/ALWAYS' for stronger compliance signal"
        )
    
    # Check for negative constraints
    negative_patterns = [
        r"don'?t\s+\w+",
        r"do\s+not\s+\w+",
        r"never\s+\w+",
        r"avoid\s+\w+ing",
        r"no\s+\w+ing",
    ]
    
    negative_count = 0
    for pattern in negative_patterns:
        matches = re.findall(pattern, content, re.IGNORECASE)
        negative_count += len(matches)
    
    if negative_count > 3:
        analysis.warning(
            "LANGUAGE-002",
            f"Found {negative_count} negative constraints ('don't', 'never', 'avoid')",
            suggestion="Reframe negatives as positives: 'Don't use X' → 'Use Y exclusively'"
        )
    
    # Check for vague quantities
    vague_patterns = ['a few', 'some', 'several', 'around', 'approximately', 'about', 'roughly']
    vague_matches = []
    for pattern in vague_patterns:
        matches = re.findall(rf'\b{pattern}\b', content, re.IGNORECASE)
        vague_matches.extend(matches)
    
    if len(vague_matches) > 2:
        analysis.warning(
            "LANGUAGE-003",
            f"Found {len(vague_matches)} vague quantities: {', '.join(set(vague_matches))}",
            suggestion="Use precise numbers: 'a few examples' → 'exactly 3 examples'"
        )


def validate_examples(analysis: SkillAnalysis) -> None:
    """Check example section for common issues."""
    content = analysis.content
    
    # Find examples section
    examples_match = re.search(r'<examples>(.*?)</examples>', content, re.DOTALL | re.IGNORECASE)
    if not examples_match:
        return
    
    examples_content = examples_match.group(1)
    
    # Count individual examples
    example_count = len(re.findall(r'<example>', examples_content, re.IGNORECASE))
    
    if example_count == 0:
        analysis.error(
            "EXAMPLES-001",
            "Examples section exists but contains no <example> tags",
            suggestion="Add 3-5 individual examples wrapped in <example> tags"
        )
    elif example_count < 3:
        analysis.warning(
            "EXAMPLES-002",
            f"Only {example_count} example(s) found - optimal is 3-5",
            suggestion="Add more examples for better induction head priming"
        )
    elif example_count > 7:
        analysis.info(
            "EXAMPLES-003",
            f"Found {example_count} examples - more than 5 has diminishing returns",
            suggestion="Consider reducing to 5 best examples to save tokens"
        )
    
    # Check for negative examples (anti-pattern)
    negative_example_patterns = ['bad', 'wrong', 'incorrect', "don't", 'avoid']
    for pattern in negative_example_patterns:
        if pattern in examples_content.lower():
            analysis.warning(
                "EXAMPLES-004",
                f"Possible negative example detected ('{pattern}' in examples section)",
                suggestion="Remove negative examples - they activate the wrong pattern"
            )
            break
    
    # Check for format consistency (basic check)
    input_tags = re.findall(r'<input>(.*?)</input>', examples_content, re.DOTALL | re.IGNORECASE)
    output_tags = re.findall(r'<(?:output|o)>(.*?)</(?:output|o)>', examples_content, re.DOTALL | re.IGNORECASE)
    
    if len(input_tags) != len(output_tags):
        analysis.warning(
            "EXAMPLES-005",
            f"Mismatched input/output tags: {len(input_tags)} inputs, {len(output_tags)} outputs",
            suggestion="Each example should have matching <input> and <output> tags"
        )


def validate_token_budget(analysis: SkillAnalysis) -> None:
    """Check if skill is within recommended token budget."""
    # Rough word count (tokens ≈ words * 1.3 for English)
    words = analysis.content.split()
    analysis.word_count = len(words)
    
    if analysis.word_count > 1500:
        analysis.warning(
            "TOKENS-001",
            f"Skill is {analysis.word_count} words - consider reducing for token efficiency",
            suggestion="Target <500 words for standard skills, <200 for frequently-loaded"
        )
    elif analysis.word_count > 800:
        analysis.info(
            "TOKENS-002",
            f"Skill is {analysis.word_count} words - on the longer side",
            suggestion="Consider moving reference material to separate files"
        )


# ============================================================================
# HELPERS
# ============================================================================

def find_tag_position(content: str, tag_name: str) -> Optional[int]:
    """Find the position of an XML tag in content."""
    match = re.search(rf'<{tag_name}[^>]*>', content, re.IGNORECASE)
    return match.start() if match else None


def analyse_skill(path: Path) -> SkillAnalysis:
    """Run all validations on a skill file."""
    content = path.read_text(encoding='utf-8')
    lines = content.split('\n')
    
    analysis = SkillAnalysis(path=path, content=content, lines=lines)
    
    # Run all validators
    validate_frontmatter(analysis)
    validate_structure(analysis)
    validate_formatting(analysis)
    validate_language(analysis)
    validate_examples(analysis)
    validate_token_budget(analysis)
    
    return analysis


def print_results(analysis: SkillAnalysis) -> None:
    """Print validation results with colours."""
    # ANSI colours
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    RESET = '\033[0m'
    BOLD = '\033[1m'
    
    print(f"\n{BOLD}Validating: {analysis.path}{RESET}")
    print(f"Word count: {analysis.word_count}")
    print("-" * 60)
    
    if not analysis.results:
        print(f"{GREEN}✓ All validations passed{RESET}")
        return
    
    # Group by severity
    errors = [r for r in analysis.results if r.severity == Severity.ERROR]
    warnings = [r for r in analysis.results if r.severity == Severity.WARNING]
    infos = [r for r in analysis.results if r.severity == Severity.INFO]
    
    for result in errors:
        print(f"{RED}✗ [{result.rule}] {result.message}{RESET}")
        if result.suggestion:
            print(f"  → {result.suggestion}")
    
    for result in warnings:
        print(f"{YELLOW}⚠ [{result.rule}] {result.message}{RESET}")
        if result.suggestion:
            print(f"  → {result.suggestion}")
    
    for result in infos:
        print(f"{BLUE}ℹ [{result.rule}] {result.message}{RESET}")
        if result.suggestion:
            print(f"  → {result.suggestion}")
    
    print("-" * 60)
    print(f"Summary: {RED}{len(errors)} errors{RESET}, {YELLOW}{len(warnings)} warnings{RESET}, {BLUE}{len(infos)} info{RESET}")


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Validate SKILL.md files against evidence-based structural rules"
    )
    parser.add_argument('path', help="Path to SKILL.md file or directory")
    parser.add_argument('-r', '--recursive', action='store_true', 
                        help="Recursively search directories for SKILL.md files")
    parser.add_argument('-q', '--quiet', action='store_true',
                        help="Only show errors and warnings")
    parser.add_argument('--json', action='store_true',
                        help="Output results as JSON")
    
    args = parser.parse_args()
    path = Path(args.path)
    
    if not path.exists():
        print(f"Error: Path not found: {path}")
        sys.exit(2)
    
    # Collect files to validate
    files = []
    if path.is_file():
        files = [path]
    elif path.is_dir():
        pattern = '**/SKILL.md' if args.recursive else 'SKILL.md'
        files = list(path.glob(pattern))
    
    if not files:
        print(f"No SKILL.md files found in {path}")
        sys.exit(1)
    
    # Validate all files
    has_errors = False
    has_warnings = False
    
    for file_path in files:
        analysis = analyse_skill(file_path)
        print_results(analysis)
        
        if analysis.has_errors:
            has_errors = True
        if analysis.has_warnings:
            has_warnings = True
    
    # Exit code
    if has_errors:
        sys.exit(2)
    elif has_warnings:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == '__main__':
    main()
