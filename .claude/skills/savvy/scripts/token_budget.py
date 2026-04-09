#!/usr/bin/env python3
"""
Token Budget Analyser: Estimate context cost and attention distribution for skills.

Usage:
    python token_budget.py path/to/SKILL.md
    python token_budget.py path/to/SKILL.md --detailed

Provides:
    - Estimated token count
    - Word count
    - Section-by-section breakdown
    - Attention zone analysis
    - Budget recommendations
"""

import re
import sys
import argparse
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional


@dataclass
class Section:
    name: str
    content: str
    start_line: int
    end_line: int
    word_count: int
    estimated_tokens: int
    position_percent: float


@dataclass
class BudgetAnalysis:
    path: Path
    total_words: int
    total_tokens: int
    sections: List[Section]
    primacy_zone_tokens: int
    middle_zone_tokens: int
    recency_zone_tokens: int
    recommendations: List[str]


def estimate_tokens(text: str) -> int:
    """
    Estimate token count for text.
    
    Rough heuristics:
    - English prose: ~1.3 tokens per word
    - Code: ~1.5 tokens per word
    - XML/structured: ~1.4 tokens per word
    
    Uses average of 1.35 for mixed content.
    """
    words = len(text.split())
    
    # Adjust for code blocks (higher token ratio)
    code_blocks = re.findall(r'```[\s\S]*?```', text)
    code_words = sum(len(block.split()) for block in code_blocks)
    
    # Adjust for XML tags (add token overhead)
    xml_tags = len(re.findall(r'</?[\w-]+>', text))
    
    prose_words = words - code_words
    
    estimated = (
        prose_words * 1.3 +      # Prose
        code_words * 1.5 +       # Code
        xml_tags * 1.2           # XML overhead
    )
    
    return int(estimated)


def extract_sections(content: str) -> List[Section]:
    """Extract XML-tagged sections from content."""
    sections = []
    total_chars = len(content)
    
    # Find all XML sections
    pattern = r'<([\w_-]+)>([\s\S]*?)</\1>'
    
    for match in re.finditer(pattern, content):
        name = match.group(1)
        section_content = match.group(2)
        start_pos = match.start()
        
        # Calculate line numbers
        start_line = content[:start_pos].count('\n') + 1
        end_line = start_line + section_content.count('\n')
        
        # Calculate position percentage
        position_percent = (start_pos / total_chars) * 100 if total_chars > 0 else 0
        
        word_count = len(section_content.split())
        estimated_tokens = estimate_tokens(section_content)
        
        sections.append(Section(
            name=name,
            content=section_content,
            start_line=start_line,
            end_line=end_line,
            word_count=word_count,
            estimated_tokens=estimated_tokens,
            position_percent=position_percent
        ))
    
    return sections


def classify_zone(position_percent: float) -> str:
    """Classify section into attention zone."""
    if position_percent < 15:
        return "PRIMACY"
    elif position_percent > 85:
        return "RECENCY"
    else:
        return "MIDDLE"


def analyse_budget(path: Path) -> BudgetAnalysis:
    """Perform full budget analysis on a skill file."""
    content = path.read_text(encoding='utf-8')
    
    total_words = len(content.split())
    total_tokens = estimate_tokens(content)
    
    sections = extract_sections(content)
    
    # Calculate zone token distribution
    primacy_tokens = sum(s.estimated_tokens for s in sections if s.position_percent < 15)
    recency_tokens = sum(s.estimated_tokens for s in sections if s.position_percent > 85)
    middle_tokens = sum(s.estimated_tokens for s in sections if 15 <= s.position_percent <= 85)
    
    # Generate recommendations
    recommendations = []
    
    # Check total budget
    if total_words > 1000:
        recommendations.append(
            f"⚠️  Total {total_words} words exceeds recommended 500-word budget. "
            "Consider moving reference material to separate files."
        )
    elif total_words > 500:
        recommendations.append(
            f"ℹ️  Total {total_words} words is moderate. Acceptable for complex skills."
        )
    
    # Check zone distribution
    total_section_tokens = primacy_tokens + middle_tokens + recency_tokens
    if total_section_tokens > 0:
        primacy_pct = primacy_tokens / total_section_tokens * 100
        recency_pct = recency_tokens / total_section_tokens * 100
        middle_pct = middle_tokens / total_section_tokens * 100
        
        if primacy_pct < 10:
            recommendations.append(
                "⚠️  Low content in primacy zone (<10%). "
                "Move critical constraints to the beginning."
            )
        
        if recency_pct < 10:
            recommendations.append(
                "⚠️  Low content in recency zone (<10%). "
                "Move examples and reminders to the end."
            )
        
        if middle_pct > 80:
            recommendations.append(
                "⚠️  Most content in middle zone (low attention). "
                "Redistribute critical content to edges."
            )
    
    # Check for critical sections in wrong zones
    for section in sections:
        zone = classify_zone(section.position_percent)
        
        if section.name.lower() in ['identity', 'role', 'system'] and zone != "PRIMACY":
            recommendations.append(
                f"⚠️  <{section.name}> at {section.position_percent:.0f}% - should be in primacy zone (0-15%)"
            )
        
        if section.name.lower() in ['constraints', 'rules'] and zone == "MIDDLE":
            recommendations.append(
                f"⚠️  <{section.name}> at {section.position_percent:.0f}% - critical content in low-attention zone"
            )
        
        if section.name.lower() in ['examples', 'example'] and zone == "PRIMACY":
            recommendations.append(
                f"ℹ️  <{section.name}> at {section.position_percent:.0f}% - examples typically work better in recency zone"
            )
        
        if 'reminder' in section.name.lower() and zone != "RECENCY":
            recommendations.append(
                f"⚠️  <{section.name}> at {section.position_percent:.0f}% - reminder should be at very end (>85%)"
            )
    
    if not recommendations:
        recommendations.append("✅ Token budget and zone distribution look good!")
    
    return BudgetAnalysis(
        path=path,
        total_words=total_words,
        total_tokens=total_tokens,
        sections=sections,
        primacy_zone_tokens=primacy_tokens,
        middle_zone_tokens=middle_tokens,
        recency_zone_tokens=recency_tokens,
        recommendations=recommendations
    )


def print_analysis(analysis: BudgetAnalysis, detailed: bool = False) -> None:
    """Print analysis results."""
    # ANSI colours
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'
    
    print(f"\n{BOLD}Token Budget Analysis: {analysis.path}{RESET}")
    print("=" * 60)
    
    # Overall stats
    print(f"\n{BOLD}Overall:{RESET}")
    print(f"  Words:  {analysis.total_words}")
    print(f"  Tokens: ~{analysis.total_tokens} (estimated)")
    
    # Budget status
    if analysis.total_words <= 200:
        status = f"{GREEN}✓ Excellent{RESET} - suitable for frequently-loaded skills"
    elif analysis.total_words <= 500:
        status = f"{GREEN}✓ Good{RESET} - within standard budget"
    elif analysis.total_words <= 1000:
        status = f"{YELLOW}⚠ Moderate{RESET} - consider trimming"
    else:
        status = f"{RED}✗ Large{RESET} - likely too verbose"
    print(f"  Status: {status}")
    
    # Zone distribution
    total_zone = analysis.primacy_zone_tokens + analysis.middle_zone_tokens + analysis.recency_zone_tokens
    if total_zone > 0:
        print(f"\n{BOLD}Attention Zone Distribution:{RESET}")
        
        prim_pct = analysis.primacy_zone_tokens / total_zone * 100
        mid_pct = analysis.middle_zone_tokens / total_zone * 100
        rec_pct = analysis.recency_zone_tokens / total_zone * 100
        
        # Visual bar
        bar_width = 40
        prim_bar = int(prim_pct / 100 * bar_width)
        mid_bar = int(mid_pct / 100 * bar_width)
        rec_bar = bar_width - prim_bar - mid_bar
        
        print(f"\n  {GREEN}{'█' * prim_bar}{RESET}{DIM}{'░' * mid_bar}{RESET}{CYAN}{'█' * rec_bar}{RESET}")
        print(f"  {GREEN}PRIMACY{RESET}        {DIM}MIDDLE{RESET}          {CYAN}RECENCY{RESET}")
        print(f"  {prim_pct:5.1f}%         {mid_pct:5.1f}%          {rec_pct:5.1f}%")
        print(f"  (~{analysis.primacy_zone_tokens} tok)    (~{analysis.middle_zone_tokens} tok)     (~{analysis.recency_zone_tokens} tok)")
    
    # Section breakdown
    if detailed and analysis.sections:
        print(f"\n{BOLD}Section Breakdown:{RESET}")
        print(f"  {'Section':<25} {'Position':>10} {'Zone':<10} {'Words':>8} {'Tokens':>8}")
        print(f"  {'-'*25} {'-'*10} {'-'*10} {'-'*8} {'-'*8}")
        
        for section in sorted(analysis.sections, key=lambda s: s.position_percent):
            zone = classify_zone(section.position_percent)
            zone_color = GREEN if zone == "PRIMACY" else (CYAN if zone == "RECENCY" else DIM)
            print(f"  {section.name:<25} {section.position_percent:>9.1f}% {zone_color}{zone:<10}{RESET} {section.word_count:>8} {section.estimated_tokens:>8}")
    
    # Recommendations
    print(f"\n{BOLD}Recommendations:{RESET}")
    for rec in analysis.recommendations:
        print(f"  {rec}")
    
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Analyse token budget and attention distribution for skills"
    )
    parser.add_argument('path', help="Path to SKILL.md file")
    parser.add_argument('-d', '--detailed', action='store_true',
                        help="Show detailed section breakdown")
    
    args = parser.parse_args()
    path = Path(args.path)
    
    if not path.exists():
        print(f"Error: File not found: {path}")
        sys.exit(1)
    
    if not path.is_file():
        print(f"Error: Not a file: {path}")
        sys.exit(1)
    
    analysis = analyse_budget(path)
    print_analysis(analysis, detailed=args.detailed)


if __name__ == '__main__':
    main()
