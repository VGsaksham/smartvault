from pathlib import Path

p = Path(__file__).resolve().parents[1] / "smartvault-api" / "server.js"
text = p.read_text(encoding="utf-8")
start = text.index("// GET Search (scope: all | fy | dept)")
end = text.index("// GET Department Stats (for Dashboard)")
search_block = text[start:end]
text_wo = text[:start] + text[end:]
idx = text_wo.index("// GET SINGLE File Metadata")
text_new = text_wo[:idx] + search_block + "\n" + text_wo[idx:]
p.write_text(text_new, encoding="utf-8")
print("moved", len(search_block), "chars")
