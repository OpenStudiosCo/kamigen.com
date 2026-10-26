#!/usr/bin/env python3
"""Improve Page 124 editable composition fidelity.

- Lettering from Affinity Speech text baselines (not bubble-centre guesses)
- Mid-row assignment guarded: left=crab, centre=shh, right=Ahhh
- Correct top-panel figure labels (figure_7=frog, figure_8=red)
- Split mid-center figure_1 into red + Jim by x-clustering
- Affinity-fill recovery for silhouette body paths (tonal treatment)
- Shared fill href stays page-absolute for editor inlining

Resource rule: do not write another cropped PNG/SVG wrapper for each
placement of the same Affinity fill. Prefer one shared
`characters_affinity_fill.png` plus per-instance `sourceRect` (or an SVG
viewBox that references the shared fill). Re-running extraction must update
instances, not multiply equivalent artwork files.

Run from repo root:
  python3 tools/page124/improve_page124.py
"""
from __future__ import annotations

import json
import re
import shutil
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AFF = ROOT / "comics-sources/Issue 05/Kamigen Page 124.svg"
PAGE = ROOT / "art/comics/library/pages/page124"
CHARS = PAGE / "characters"
COMP = ROOT / "art/comics/compositions/page_124_editable.json"
FILL_HREF = "/art/comics/library/pages/page124/characters_affinity_fill.png"


def parse_matrix(s: str):
    nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", s)]
    return nums if len(nums) == 6 else [1, 0, 0, 1, 0, 0]


def apply(m, x, y):
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def mul(A, B):
    a, b, c, d, e, f = A
    g, h, i, j, k, l = B
    return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]


def extract_speech_group(svg: str) -> str:
    m = re.search(r'<g[^>]*id="Speech"[^>]*>', svg)
    start = m.start()
    depth = 0
    i = start
    while i < len(svg):
        if svg.startswith("<g", i):
            depth += 1
            i = svg.find(">", i) + 1
            continue
        if svg.startswith("</g>", i):
            depth -= 1
            i += 4
            if depth == 0:
                return svg[start:i]
            continue
        i += 1
    raise RuntimeError("Speech group not closed")


def extract_speech(svg: str):
    speech = extract_speech_group(svg)
    stack = [[1, 0, 0, 1, 0, 0]]
    i = 0
    paths = []
    texts = []
    while i < len(speech):
        if speech.startswith("<g", i):
            tag_end = speech.find(">", i)
            tag = speech[i : tag_end + 1]
            tr = re.search(r'transform="([^"]+)"', tag)
            stack.append(mul(stack[-1], parse_matrix(tr.group(1))) if tr else stack[-1][:])
            i = tag_end + 1
            continue
        if speech.startswith("</g>", i):
            stack.pop()
            i += 4
            continue
        if speech.startswith("<path", i):
            tag_end = speech.find("/>", i)
            tag = speech[i : tag_end + 2]
            d = re.search(r'd="([^"]+)"', tag).group(1)
            nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", d)]
            pts = [apply(stack[-1], x, y) for x, y in zip(nums[0::2], nums[1::2])]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            paths.append(
                {
                    "d": d,
                    "matrix": stack[-1][:],
                    "bbox": (min(xs), min(ys), max(xs), max(ys)),
                }
            )
            i = tag_end + 2
            continue
        if speech.startswith("<text", i):
            tag_end = speech.find(">", i)
            tag = speech[i : tag_end + 1]
            close = speech.find("</text>", tag_end)
            body = speech[tag_end + 1 : close]
            x0 = float(re.search(r'\bx="([^"]+)"', tag).group(1).replace("px", ""))
            y0 = float(re.search(r'\by="([^"]+)"', tag).group(1).replace("px", ""))
            first = re.match(r"([^<]*)", body).group(1).replace("&apos;", "'")
            tspan = re.search(
                r'<tspan\s+x="([^"]+)"\s+y="([^"]+)"[^>]*>([^<]*)</tspan>', body
            )
            rest = tspan.group(3).replace("&apos;", "'") if tspan else ""
            px, py = apply(stack[-1], x0, y0)
            texts.append({"x": px, "y": py, "text": first + rest, "fontSize": 12})
            i = close + 7
            continue
        i += 1
    return paths, texts


def cluster_text_blocks(texts):
    """Group Affinity text lines that share ~same x and 16px leading."""
    texts = sorted(texts, key=lambda t: (round(t["x"], 1), t["y"]))
    blocks = []
    for t in texts:
        if blocks and abs(blocks[-1]["x"] - t["x"]) < 2 and t["y"] - blocks[-1]["ys"][-1] < 20:
            blocks[-1]["lines"].append(t["text"])
            blocks[-1]["ys"].append(t["y"])
        else:
            blocks.append({"x": t["x"], "y0": t["y"], "ys": [t["y"]], "lines": [t["text"]]})
    return blocks


# Published / Affinity mid-row assignment (do not reverse).
DIALOGUE_SPEC = [
    {
        "id": "dialogue_1",
        "name": "Dialogue 1 — top",
        "panel": "panel_top",
        "match": lambda s: "split up" in s.lower() or "door" in s.lower(),
        "fallback_text": "This has to be it...\nlet's split up and\nlook for the door.",
    },
    {
        "id": "dialogue_2",
        "name": "Dialogue 2 — mid left (frog)",
        "panel": "panel_mid_left",
        "match": lambda s: "crab" in s.lower(),
        "fallback_text": "That's\none big\ncrab...",
    },
    {
        "id": "dialogue_3",
        "name": "Dialogue 3 — mid center (shh)",
        "panel": "panel_mid_center",
        "match": lambda s: "hear that" in s.lower() or s.lower().startswith("shh"),
        "fallback_text": "shh... hear that?\nsomeone's coming...",
    },
    {
        "id": "dialogue_4",
        "name": "Dialogue 4 — mid right (Ahhh)",
        "panel": "panel_mid_right",
        "match": lambda s: "poop" in s.lower(),
        "fallback_text": "Ahhh.. poop.",
    },
    {
        "id": "dialogue_6",
        "name": "Dialogue 6 — bottom left",
        "panel": "panel_bottom",
        "match": lambda s: "shame" in s.lower() or "crash the ship" in s.lower(),
        "fallback_text": "Damn. It's a\nshame we didn't\ncrash the ship\ndown here.",
    },
    {
        "id": "dialogue_5",
        "name": "Dialogue 5 — bottom wide",
        "panel": "panel_bottom",
        "match": lambda s: "breached" in s.lower() or "alloys" in s.lower(),
        "fallback_text": "it wouldn't have\nbreached this wall.\nit's made of the same\nalloys as the city's\ncore frame.",
    },
]


def write_shape(path: Path, d: str, matrix, bbox):
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    a, b, c, dd, e, f = matrix
    path.write_text(
        f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.4f} {h:.4f}" width="{w:.4f}" height="{h:.4f}">
  <g transform="translate({-x0:.4f},{-y0:.4f})">
    <g transform="matrix({a},{b},{c},{dd},{e},{f})">
      <path d="{d}" fill="#ebebeb" stroke="#000000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>
'''
    )


def update_dialogues(comp, paths, texts):
    blocks = cluster_text_blocks(texts)
    speech_dir = PAGE / "speech"
    speech_dir.mkdir(exist_ok=True)
    panels = {p["id"]: p for p in comp["panels"]}
    used_paths = set()
    used_blocks = set()

    for spec in DIALOGUE_SPEC:
        block = None
        for i, b in enumerate(blocks):
            if i in used_blocks:
                continue
            joined = "\n".join(b["lines"])
            if spec["match"](joined):
                block = b
                used_blocks.add(i)
                break
        text = "\n".join(block["lines"]) if block else spec["fallback_text"]
        # Prefer path whose bbox contains the first baseline
        ax = block["x"] if block else None
        ay = block["y0"] if block else None
        best, bestd = None, 1e18
        for i, p in enumerate(paths):
            if i in used_paths:
                continue
            x0, y0, x1, y1 = p["bbox"]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if ax is not None:
                dist = (ax - cx) ** 2 + (ay - cy) ** 2
                if x0 - 20 <= ax <= x1 + 20 and y0 - 20 <= ay <= y1 + 40:
                    dist -= 1e6
            else:
                dist = cx**2 + cy**2
            if dist < bestd:
                bestd, best = dist, i
        used_paths.add(best)
        p = paths[best]
        x0, y0, x1, y1 = p["bbox"]
        shape = speech_dir / f"{spec['id']}_shape.svg"
        write_shape(shape, p["d"], p["matrix"], p["bbox"])

        panel = panels[spec["panel"]]
        layer = next(l for l in panel["layers"] if l.get("id") == spec["id"])
        layer["name"] = spec["name"]
        layer["text"] = text
        layer["x"] = round(x0 - panel["x"], 3)
        layer["y"] = round(y0 - panel["y"], 3)
        layer["width"] = round(x1 - x0, 3)
        layer["height"] = round(y1 - y0, 3)
        layer["shapeSrc"] = str(shape.relative_to(ROOT))
        if ax is not None:
            layer["textX"] = round(ax - x0, 3)
            layer["textY"] = round(ay - y0, 3)
            layer["textAlign"] = "left"
        layer["fontSize"] = 12
        layer["lineHeight"] = 16 / 12
        layer["letterSpacing"] = 0
        layer["textWrap"] = False
        layer["fontWeight"] = "400"
        layer["fontStyle"] = "normal"
        layer["fontFamily"] = (
            '"Laffayette Comic Pro", "Cardenio Modern", "Source Sans 3", sans-serif'
        )
        layer["note"] = (
            "Affinity Speech path + left-aligned text baselines from Affinity SVG. "
            "Mid-row: left=crab, centre=shh, right=Ahhh (published + Affinity positions)."
        )

    left = next(l for l in panels["panel_mid_left"]["layers"] if l["id"] == "dialogue_2")
    centre = next(l for l in panels["panel_mid_center"]["layers"] if l["id"] == "dialogue_3")
    right = next(l for l in panels["panel_mid_right"]["layers"] if l["id"] == "dialogue_4")
    assert "crab" in left["text"].lower(), left["text"]
    assert "hear that" in centre["text"].lower() or "shh" in centre["text"].lower(), centre["text"]
    assert "poop" in right["text"].lower(), right["text"]
    assert "crab" not in centre["text"].lower()
    assert "shh" not in left["text"].lower() and "hear that" not in left["text"].lower()
    return {
        "dialogues": [
            {
                "id": s["id"],
                "text": next(
                    l["text"]
                    for p in comp["panels"]
                    for l in p["layers"]
                    if l.get("id") == s["id"]
                ),
                "panel": s["panel"],
            }
            for s in DIALOGUE_SPEC
        ]
    }


def path_start(d: str):
    m = re.match(r"M\s*([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)", d)
    if not m:
        return None
    return float(m.group(1)), float(m.group(2))


def split_figure_1():
    """Split mid-center red+Jim group into two editable figures by x median."""
    src = CHARS / "figure_1.svg"
    text = src.read_text()
    vb = re.search(r'viewBox="([^"]+)"', text).group(1)
    vbits = [float(x) for x in vb.split()]
    # Keep defs
    defs_m = re.search(r"<defs>(.*)</defs>", text, re.S)
    defs = defs_m.group(0) if defs_m else "<defs></defs>"
    body = text[text.find("</defs>") + 7 : text.rfind("</svg>")].strip()
    # Collect path/g chunks that are sibling drawing ops — figure_1 is flat-ish.
    # Split individual <path.../> and recovered fill <g clip-path=...>...</g> by geometry x.
    tokens = []
    i = 0
    while i < len(body):
        if body.startswith("<path", i):
            end = body.find("/>", i)
            chunk = body[i : end + 2]
            d = re.search(r'd="([^"]+)"', chunk)
            pt = path_start(d.group(1)) if d else None
            tokens.append(("path", pt, chunk))
            i = end + 2
            continue
        if body.startswith("<g", i):
            # take until matching close
            depth = 0
            j = i
            while j < len(body):
                if body.startswith("<g", j):
                    depth += 1
                    j = body.find(">", j) + 1
                    continue
                if body.startswith("</g>", j):
                    depth -= 1
                    j += 4
                    if depth == 0:
                        break
                    continue
                j += 1
            chunk = body[i:j]
            # x from clip path or nested path
            dm = re.search(r'd="M\s*([0-9.]+)\s+([0-9.]+)', chunk)
            pt = (float(dm.group(1)), float(dm.group(2))) if dm else None
            tokens.append(("g", pt, chunk))
            i = j
            continue
        i += 1

    xs = [t[1][0] for t in tokens if t[1]]
    # Red suit sits left of Jim in mid-center; split near gap ~300 page-x
    split_x = 300.0
    left, right = [], []
    for kind, pt, chunk in tokens:
        if not pt:
            left.append(chunk)  # keep unknown with red/default left
            continue
        (left if pt[0] < split_x else right).append(chunk)

    def write_fig(name, chunks, label):
        all_text = "\n".join(chunks)
        if name.endswith("red"):
            x, y, w, h = vbits[0], vbits[1], split_x - vbits[0], vbits[3]
        else:
            x, y, w, h = split_x, vbits[1], (vbits[0] + vbits[2]) - split_x, vbits[3]
        xs2, ys2 = [], []
        for d in re.findall(r'd="([^"]+)"', all_text):
            nums = [float(n) for n in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", d)]
            xs2.extend(nums[0::2])
            ys2.extend(nums[1::2])
        if xs2 and ys2:
            pad = 2.0
            x, y = min(xs2) - pad, min(ys2) - pad
            w, h = (max(xs2) + pad) - x, (max(ys2) + pad) - y
        out = CHARS / f"{name}.svg"
        out.write_text(
            f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="{x:.3f} {y:.3f} {w:.3f} {h:.3f}" width="{w:.3f}" height="{h:.3f}">
  <!-- split from figure_1: {label}; FilB recovery preserved -->
  {defs}
  <g id="{name}">
{chr(10).join(chunks)}
  </g>
</svg>
'''
        )
        return {
            "id": name,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "src": str(out.relative_to(ROOT)),
            "label": label,
        }

    red = write_fig("figure_1_red", left, "mid-center red suit")
    jim = write_fig("figure_1_jim", right, "mid-center Jim")
    return red, jim


def recover_silhouette_fills():
    """Clip affinity fill into large dark body paths of silhouette figures."""
    for name in ["figure_3", "figure_4", "figure_5", "figure_6", "figure_10", "figure_11"]:
        path = CHARS / f"{name}.svg"
        text = path.read_text()
        if "kce-recovered-filb-fill" in text:
            continue
        dark = []
        for m in re.finditer(r"<path\b[^>]*>", text):
            tag = m.group(0)
            fill = re.search(r'fill="([^"]+)"', tag)
            d = re.search(r'd="([^"]+)"', tag)
            if not fill or not d:
                continue
            if fill.group(1) not in {"#231f20", "#000000", "#414042", "#635248", "#816253"}:
                continue
            nums = [float(x) for x in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", d.group(1))]
            if len(nums) < 20:
                continue
            xs, ys = nums[0::2], nums[1::2]
            area = (max(xs) - min(xs)) * (max(ys) - min(ys))
            if area < 80:
                continue
            dark.append((area, d.group(1)))
        dark.sort(key=lambda t: t[0], reverse=True)
        if not dark:
            continue
        defs_extra = []
        fill_blocks = []
        for idx, (area, d) in enumerate(dark[:2]):
            cid = f"_clipSil_{name}_{idx}"
            defs_extra.append(
                f'<clipPath id="{cid}" clipPathUnits="userSpaceOnUse"><path d="{d}"/></clipPath>'
            )
            fill_blocks.append(
                f'<g clip-path="url(#{cid})" class="kce-recovered-filb-fill" '
                f'data-provenance="affinity-characters-raster">'
                f'<image href="{FILL_HREF}" x="0" y="0" width="596" height="842" '
                f'preserveAspectRatio="none"/></g>'
            )
        if "<defs>" in text:
            text = text.replace("<defs>", "<defs>\n" + "\n".join(defs_extra) + "\n", 1)
        else:
            text = re.sub(
                r"(<svg\b[^>]*)>",
                r'\1 xmlns:xlink="http://www.w3.org/1999/xlink">'
                f"<defs>\n" + "\n".join(defs_extra) + "\n</defs>",
                text,
                count=1,
            )
        text = text.replace("</svg>", "\n".join(fill_blocks) + "\n</svg>")
        path.write_text(text)
        print(f"  silhouette fill recovery: {name} ({min(2, len(dark))} clips)")


def fix_labels_and_layers(comp, red, jim):
    panels = {p["id"]: p for p in comp["panels"]}
    top = panels["panel_top"]
    for layer in top["layers"]:
        if layer.get("id") == "char_figure_7":
            layer["name"] = "Character — Top — frog"
        elif layer.get("id") == "char_figure_8":
            layer["name"] = "Character — Top — red suit"
        elif layer.get("id") == "char_figure_3":
            layer["name"] = "Character — Top — silhouette man"
        elif layer.get("id") == "char_figure_4":
            layer["name"] = "Character — Top — silhouette woman"

    mid = panels["panel_mid_center"]
    # Replace combined figure_1 with two layers; keep figure_1 hidden as reference
    new_layers = []
    for layer in mid["layers"]:
        if layer.get("id") == "char_figure_1":
            layer["visible"] = False
            layer["name"] = "Character — Mid-center — red+Jim (superseded combined)"
            new_layers.append(layer)
            for fig, label in ((red, "red suit"), (jim, "Jim")):
                clone = json.loads(json.dumps(layer))
                clone["id"] = f"char_{fig['id']}"
                clone["name"] = f"Character — Mid-center — {label}"
                clone["visible"] = True
                clone["src"] = fig["src"]
                clone["assetId"] = fig["id"]
                clone["x"] = round(fig["x"] - mid["x"], 3)
                clone["y"] = round(fig["y"] - mid["y"], 3)
                clone["width"] = round(fig["width"], 3)
                clone["height"] = round(fig["height"], 3)
                clone["note"] = (
                    f"Split from figure_1 by page-x clustering; {label}. "
                    "Vector paths + Affinity FilB raster clips preserved."
                )
                new_layers.append(clone)
        else:
            new_layers.append(layer)
    mid["layers"] = new_layers


def main():
    print("Reading Affinity SVG + composition…")
    svg = AFF.read_text(errors="replace")
    paths, texts = extract_speech(svg)
    print(f"  speech paths={len(paths)} text lines={len(texts)}")
    comp = json.loads(COMP.read_text())

    print("Updating dialogues from Affinity baselines…")
    meta = update_dialogues(comp, paths, texts)

    print("Splitting figure_1 into red + Jim…")
    red, jim = split_figure_1()
    print(f"  {red['id']} {red['width']:.1f}x{red['height']:.1f}")
    print(f"  {jim['id']} {jim['width']:.1f}x{jim['height']:.1f}")

    print("Silhouette FilB recovery…")
    recover_silhouette_fills()

    print("Updating composition layers…")
    fix_labels_and_layers(comp, red, jim)
    comp["notes"] = (
        "Decomposed Page 124: five Affinity panels with per-panel backgrounds; "
        "active per-figure character layers (FilB via shared fill + SVG inlining); "
        "mid-center red/Jim split; silhouette Affinity-fill recovery; "
        "per-bubble shapeSrc + Affinity text baselines. Mid-row (published+Affinity): "
        "left/frog=That's one big crab...; centre=shh... hear that? someone's coming...; "
        "right=Ahhh.. poop. Combined characters sheet and VC composite are hidden references."
    )
    COMP.write_text(json.dumps(comp, indent=2) + "\n")
    (ROOT / "tools/page124/rebuild_meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    # Keep rebuild_decomposed.py contract: rewrite its DIALOGUES texts if present via meta
    print(f"Wrote {COMP}")
    print("Mid-row guard OK:", meta["dialogues"][1]["text"].split("\n")[0], "/", meta["dialogues"][2]["text"].split("\n")[0])


if __name__ == "__main__":
    main()
