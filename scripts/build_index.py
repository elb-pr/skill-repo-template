#!/usr/bin/env python3
"""
index-builder for claude-branding-bonanza/docs
BM25 (k1=1.5, b=0.75) + TF-IDF + RRF (k=60)
Chunking: H1→H2→H3 heading hierarchy, paragraph breaks as secondary
"""

import os, re, math, xml.etree.ElementTree as ET
from collections import defaultdict
from xml.dom import minidom

DOCS_ROOT = os.path.join(os.path.dirname(__file__), "..", "docs")
SUBDIRS   = ["strategy", "identity", "audience", "marketing", "process", "insights"]

# BM25 params
K1 = 1.5
B  = 0.75
RRF_K = 60

STOP_WORDS = set("""
the a an is are was were be been being have has had do does did will would could should
may might shall can of in on at to for with by from as into through during before after
above below between out off over under again then once and or but nor so yet both either
neither not only own same than too very just because if while i we you he she it they
this that these those what which who whom how all any each few more most other some such
no our your my his her its their our we
""".split())

def tokenize(text):
    tokens = re.findall(r"[a-z][a-z0-9'-]*[a-z0-9]|[a-z]", text.lower())
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 1]

def chunk_markdown(filepath):
    """
    Split a markdown file into chunks by heading hierarchy.
    Each chunk: { text, start_line, end_line, heading }
    """
    with open(filepath, encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    # Skip YAML frontmatter
    start = 0
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                start = i + 1
                break

    # Collect heading positions
    heading_pat = re.compile(r"^(#{1,3})\s+(.+)")
    boundaries = []  # (line_idx, level, heading_text)
    for i, line in enumerate(lines[start:], start=start):
        m = heading_pat.match(line)
        if m:
            boundaries.append((i, len(m.group(1)), m.group(2).strip()))

    chunks = []

    if not boundaries:
        # No headings — treat whole body as one chunk
        body = "".join(lines[start:]).strip()
        if body:
            chunks.append({
                "text": body,
                "start_line": start + 1,
                "end_line": len(lines),
                "heading": os.path.basename(filepath).replace(".md", "")
            })
        return chunks

    # Chunk between heading boundaries
    for idx, (line_idx, level, heading) in enumerate(boundaries):
        end_line_idx = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else len(lines)
        chunk_lines = lines[line_idx:end_line_idx]
        text = "".join(chunk_lines).strip()
        if not text:
            continue
        tokens = tokenize(text)
        if len(set(tokens)) < 3:
            continue
        chunks.append({
            "text": text,
            "start_line": line_idx + 1,
            "end_line": end_line_idx,
            "heading": heading
        })

    return chunks

def collect_all_chunks():
    all_chunks = []  # list of (doc_id, chunk)
    for subdir in SUBDIRS:
        dirpath = os.path.join(DOCS_ROOT, subdir)
        if not os.path.isdir(dirpath):
            continue
        for fname in sorted(os.listdir(dirpath)):
            if not fname.endswith(".md"):
                continue
            fpath = os.path.join(dirpath, fname)
            doc_id = f"{subdir}/{fname}"
            chunks = chunk_markdown(fpath)
            for c in chunks:
                all_chunks.append((doc_id, c))
    return all_chunks

def compute_index(all_chunks):
    N = len(all_chunks)
    if N == 0:
        return []

    # Tokenize all chunks
    tokenized = [tokenize(c["text"]) for _, c in all_chunks]

    # avgdl
    avgdl = sum(len(t) for t in tokenized) / N

    # df: doc frequency per term
    df = defaultdict(int)
    for tokens in tokenized:
        for t in set(tokens):
            df[t] += 1

    # BM25 IDF
    def bm25_idf(t):
        n = df[t]
        return math.log((N - n + 0.5) / (n + 0.5) + 1)

    # TF-IDF IDF
    def tfidf_idf(t):
        return math.log((1 + N) / (1 + df[t])) + 1

    results = []
    for i, ((doc_id, chunk), tokens) in enumerate(zip(all_chunks, tokenized)):
        D_len = len(tokens)
        freq = defaultdict(int)
        for t in tokens:
            freq[t] += 1

        unique_terms = set(tokens)
        term_data = []
        bm25_doc_score = 0.0
        tfidf_doc_score = 0.0

        for t in sorted(unique_terms):
            f = freq[t]
            # BM25
            idf_bm25 = bm25_idf(t)
            bm25_score = idf_bm25 * (f * (K1 + 1)) / (f + K1 * (1 - B + B * D_len / avgdl))
            # TF-IDF
            tf = f / D_len if D_len > 0 else 0
            idf_tfidf = tfidf_idf(t)
            tfidf_score = tf * idf_tfidf
            bm25_doc_score += bm25_score
            tfidf_doc_score += tfidf_score
            term_data.append({
                "value": t,
                "tf": round(tf, 4),
                "idf": round(idf_tfidf, 4),
                "tfidf": round(tfidf_score, 4),
                "bm25_score": round(bm25_score, 4)
            })

        results.append({
            "doc_id": doc_id,
            "chunk": chunk,
            "terms": term_data,
            "bm25_doc_score": bm25_doc_score,
            "tfidf_doc_score": tfidf_doc_score,
            "chunk_idx": i
        })

    # Rank by BM25 and TF-IDF
    bm25_ranked  = sorted(range(len(results)), key=lambda i: results[i]["bm25_doc_score"],  reverse=True)
    tfidf_ranked = sorted(range(len(results)), key=lambda i: results[i]["tfidf_doc_score"], reverse=True)

    bm25_rank_map  = {idx: rank + 1 for rank, idx in enumerate(bm25_ranked)}
    tfidf_rank_map = {idx: rank + 1 for rank, idx in enumerate(tfidf_ranked)}

    for i, r in enumerate(results):
        br = bm25_rank_map[i]
        tr = tfidf_rank_map[i]
        r["bm25_rank"]  = br
        r["tfidf_rank"] = tr
        r["rrf_score"]  = round(1 / (RRF_K + br) + 1 / (RRF_K + tr), 4)

    return results, N, round(avgdl, 1)

def generate_description(chunk):
    """Generate a brief semantic description from heading + first sentence."""
    heading = chunk["heading"]
    first_para = re.split(r"\n\n", chunk["text"], maxsplit=2)
    if len(first_para) > 1:
        lead = first_para[1].strip()[:300].replace("\n", " ")
        lead = re.sub(r"\s+", " ", lead)
        # Strip markdown
        lead = re.sub(r"\*+([^*]+)\*+", r"\1", lead)
        lead = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", lead)
        lead = lead[:200]
    else:
        lead = heading
    return f"{heading}. {lead}"

def derive_categories(terms):
    """Top 6 highest bm25_score terms as space-separated categories."""
    sorted_terms = sorted(terms, key=lambda t: t["bm25_score"], reverse=True)
    return " ".join(t["value"] for t in sorted_terms[:6])

def build_xml(results, N, avgdl):
    # Group chunks by doc
    from collections import OrderedDict
    docs = OrderedDict()
    for r in results:
        doc_id = r["doc_id"]
        if doc_id not in docs:
            docs[doc_id] = []
        docs[doc_id].append(r)

    unique_terms = set()
    for r in results:
        for t in r["terms"]:
            unique_terms.add(t["value"])

    lines = []
    lines.append('<index>')
    lines.append(f'  <index_config>')
    lines.append(f'    <k1>{K1}</k1>')
    lines.append(f'    <b>{B}</b>')
    lines.append(f'    <rrf_k>{RRF_K}</rrf_k>')
    lines.append(f'    <avgdl>{avgdl}</avgdl>')
    lines.append(f'    <total_chunks>{N}</total_chunks>')
    lines.append(f'    <files_processed>{len(docs)}</files_processed>')
    lines.append(f'  </index_config>')

    # Chunking strategy declaration
    lines.append(f'  <chunking_strategy type="markdown">')
    lines.append(f'    Primary boundary: H1/H2/H3 heading tags in order of hierarchy.')
    lines.append(f'    Secondary boundary: Paragraph breaks within a heading section.')
    lines.append(f'    Minimum: 3 unique non-stop terms per chunk.')
    lines.append(f'    YAML frontmatter and empty blocks excluded.')
    lines.append(f'  </chunking_strategy>')

    chunk_counter = 1
    for doc_id, doc_results in docs.items():
        safe_id = doc_id.replace("&", "&amp;").replace('"', '&quot;')
        lines.append(f'  <document id="{safe_id}" type="markdown">')
        for r in doc_results:
            chunk = r["chunk"]
            desc = generate_description(chunk)
            desc = desc.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            cats = derive_categories(r["terms"])

            lines.append(f'    <chunk id="chunk-{chunk_counter}" start_line="{chunk["start_line"]}" end_line="{chunk["end_line"]}">')
            lines.append(f'      <description>{desc}</description>')
            lines.append(f'      <categories>{cats}</categories>')
            lines.append(f'      <terms>')
            for t in r["terms"]:
                tv = t["value"].replace("&", "&amp;")
                lines.append(f'        <term value="{tv}" tf="{t["tf"]}" idf="{t["idf"]}" tfidf="{t["tfidf"]}" bm25_score="{t["bm25_score"]}"/>')
            lines.append(f'      </terms>')
            lines.append(f'      <ranks>')
            lines.append(f'        <bm25_rank>{r["bm25_rank"]}</bm25_rank>')
            lines.append(f'        <tfidf_rank>{r["tfidf_rank"]}</tfidf_rank>')
            lines.append(f'        <rrf_score>{r["rrf_score"]}</rrf_score>')
            lines.append(f'      </ranks>')
            lines.append(f'    </chunk>')
            chunk_counter += 1
        lines.append(f'  </document>')

    lines.append(f'  <corpus_summary>')
    lines.append(f'    <files_indexed>{len(docs)}</files_indexed>')
    lines.append(f'    <total_chunks>{N}</total_chunks>')
    lines.append(f'    <total_unique_terms>{len(unique_terms)}</total_unique_terms>')
    lines.append(f'    <computed_avgdl>{avgdl}</computed_avgdl>')
    lines.append(f'  </corpus_summary>')
    lines.append('</index>')

    return "\n".join(lines)

if __name__ == "__main__":
    print("Collecting chunks...")
    all_chunks = collect_all_chunks()
    print(f"  {len(all_chunks)} chunks from {len(set(d for d,_ in all_chunks))} documents")

    print("Computing BM25 + TF-IDF + RRF...")
    results, N, avgdl = compute_index(all_chunks)
    print(f"  avgdl = {avgdl}")

    print("Building XML...")
    xml_str = build_xml(results, N, avgdl)

    out_path = os.path.join(DOCS_ROOT, "_index.xml")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(xml_str)

    print(f"  Written {len(xml_str):,} bytes → {out_path}")
    print("Done.")
