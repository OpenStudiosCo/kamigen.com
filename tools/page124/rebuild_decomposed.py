#!/usr/bin/env python3
"""Update page_124_editable.json dialogue geometry from Affinity Speech paths.

Preserves the multi-panel decomposed composition (per-panel BGs, active figure
layers). Only refreshes per-bubble shapeSrc / anchors / lettering fields.

Run from repo root:
  python3 tools/page124/rebuild_decomposed.py

Mid-row copy MUST match published art (do NOT trust Affinity SVG text-frame
positions alone — they previously swapped left/centre):
  left / frog: "That's one big crab..."
  centre / woman+Jim: "Shh... hear that? Someone's coming..."
  right: "Ahhh.. poop."
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AFF = ROOT / "comics-sources/Issue 05/Kamigen Page 124.svg"
PAGE = ROOT / "art/comics/library/pages/page124"
COMP = ROOT / "art/comics/compositions/page_124_editable.json"


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


def extract_speech_paths(svg: str):
    m = re.search(r'<g[^>]*id="Speech"[^>]*>', svg)
    start = m.start()
    depth = 0
    i = start
    end = None
    while i < len(svg):
        if svg.startswith("<g", i):
            depth += 1
            i = svg.find(">", i) + 1
            continue
        if svg.startswith("</g>", i):
            depth -= 1
            i += 4
            if depth == 0:
                end = i
                break
            continue
        i += 1
    speech = svg[start:end]
    paths = []
    stack = [[1, 0, 0, 1, 0, 0]]
    i = 0
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
            paths.append({"d": d, "matrix": stack[-1][:], "bbox": (min(xs), min(ys), max(xs), max(ys))})
            i = tag_end + 2
            continue
        i += 1
    return paths


# Mid-row MUST match published + Affinity text positions (left=crab, centre=shh).
# Prefer tools/page124/improve_page124.py for Affinity baseline lettering.
# Anchors below are Affinity first-line baselines (page space), not bubble centres.
DIALOGUES = [
    {
        "id": "dialogue_1",
        "name": "Dialogue 1 — top",
        "text": "This has to be it...\nlet's split up and\nlook for the door.",
        "anchor": (153.6, 101.8),
        "panel": "panel_top",
        "textAlign": "left",
    },
    {
        "id": "dialogue_2",
        "name": "Dialogue 2 — mid left (frog)",
        "text": "That's\none big\ncrab...",
        "anchor": (33.5, 326.0),
        "panel": "panel_mid_left",
        "textAlign": "left",
    },
    {
        "id": "dialogue_3",
        "name": "Dialogue 3 — mid center (shh)",
        "text": "shh... hear that?\nsomeone's coming...",
        "anchor": (221.8, 336.0),
        "panel": "panel_mid_center",
        "textAlign": "left",
    },
    {
        "id": "dialogue_4",
        "name": "Dialogue 4 — mid right (Ahhh)",
        "text": "Ahhh.. poop.",
        "anchor": (428.8, 333.7),
        "panel": "panel_mid_right",
        "textAlign": "left",
    },
    {
        "id": "dialogue_5",
        "name": "Dialogue 5 — bottom wide",
        "text": "it wouldn't have\nbreached this wall.\nit's made of the same\nalloys as the city's\ncore frame.",
        "anchor": (233.5, 726.2),
        "panel": "panel_bottom",
        "textAlign": "left",
    },
    {
        "id": "dialogue_6",
        "name": "Dialogue 6 — bottom left",
        "text": "Damn. It's a\nshame we didn't\ncrash the ship\ndown here.",
        "anchor": (64.1, 604.4),
        "panel": "panel_bottom",
        "textAlign": "left",
    },
]


def main():
    svg = AFF.read_text(errors="replace")
    paths = extract_speech_paths(svg)
    used = set()
    speech_dir = PAGE / "speech"
    speech_dir.mkdir(exist_ok=True)

    for d in DIALOGUES:
        ax, ay = d["anchor"]
        best, bestd = None, 1e18
        for i, p in enumerate(paths):
            if i in used:
                continue
            x0, y0, x1, y1 = p["bbox"]
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            dist = (ax - cx) ** 2 + (ay - cy) ** 2
            if x0 - 40 <= ax <= x1 + 40 and y0 - 40 <= ay <= y1 + 40:
                dist -= 1e6
            if dist < bestd:
                bestd, best = dist, i
        used.add(best)
        p = paths[best]
        x0, y0, x1, y1 = p["bbox"]
        w, h = x1 - x0, y1 - y0
        a, b, c, dd, e, f = p["matrix"]
        fp = speech_dir / f"{d['id']}_shape.svg"
        fp.write_text(
            f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.4f} {h:.4f}" width="{w:.4f}" height="{h:.4f}">
  <g transform="translate({-x0:.4f},{-y0:.4f})">
    <g transform="matrix({a},{b},{c},{dd},{e},{f})">
      <path d="{p['d']}" fill="#ebebeb" stroke="#000000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>
'''
        )
        d.update(
            shapeSrc=str(fp.relative_to(ROOT)),
            pageX=x0,
            pageY=y0,
            width=w,
            height=h,
            textX=ax - x0,
            textY=ay - y0,
            textAlign=d.get("textAlign", "left"),
            fontSize=12,
            lineHeight=16 / 12,
        )

    comp = json.loads(COMP.read_text())
    panels = {p["id"]: p for p in comp["panels"]}
    for d in DIALOGUES:
        panel = panels[d["panel"]]
        layer = next(l for l in panel["layers"] if l.get("id") == d["id"])
        layer["name"] = d["name"]
        layer["text"] = d["text"]
        layer["x"] = round(d["pageX"] - panel["x"], 3)
        layer["y"] = round(d["pageY"] - panel["y"], 3)
        layer["width"] = round(d["width"], 3)
        layer["height"] = round(d["height"], 3)
        layer["shapeSrc"] = d["shapeSrc"]
        layer["textX"] = round(d["textX"], 3)
        layer["textY"] = round(d["textY"], 3)
        layer["textAlign"] = d.get("textAlign", "left")
        layer["fontSize"] = d["fontSize"]
        layer["lineHeight"] = d["lineHeight"]
        layer["textWrap"] = False
        layer["fontWeight"] = "400"
        layer["fontFamily"] = '"Laffayette Comic Pro", "Cardenio Modern", "Source Sans 3", sans-serif'
        layer["note"] = (
            "Affinity Speech path + left-aligned Affinity text baselines; shape travels with bubble. "
            "Mid-row: left=crab, centre=shh, right=Ahhh (published + Affinity positions)."
        )

    # Guard: refuse to reintroduce the old mid-row swap
    left = next(l for l in panels["panel_mid_left"]["layers"] if l["id"] == "dialogue_2")
    centre = next(l for l in panels["panel_mid_center"]["layers"] if l["id"] == "dialogue_3")
    assert "crab" in left["text"].lower(), left["text"]
    assert "shh" in centre["text"].lower() or "hear that" in centre["text"].lower(), centre["text"]
    assert "crab" not in centre["text"].lower()
    assert "shh" not in left["text"].lower() and "hear that" not in left["text"].lower(), left["text"]

    comp["notes"] = (
        "Decomposed Page 124: five Affinity panels with per-panel backgrounds; "
        "active per-figure character layers (FilB via shared fill + SVG inlining); "
        "per-bubble shapeSrc dialogue. Mid-row (published): left/frog=That's one big crab...; "
        "centre=Shh... hear that? Someone's coming...; right=Ahhh.. poop. "
        "Combined characters sheet and VC composite are hidden references."
    )
    COMP.write_text(json.dumps(comp, indent=2) + "\n")
    meta = {
        "dialogues": [
            {
                "id": d["id"],
                "name": d["name"],
                "text": d["text"],
                "anchor": d["anchor"],
                "panel": d["panel"],
                "shapeSrc": d["shapeSrc"],
                "pageX": d["pageX"],
                "pageY": d["pageY"],
                "width": d["width"],
                "height": d["height"],
                "textX": d["textX"],
                "textY": d["textY"],
                "fontSize": d["fontSize"],
                "lineHeight": d["lineHeight"],
            }
            for d in DIALOGUES
        ]
    }
    (ROOT / "tools/page124/rebuild_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"updated dialogues in {COMP} (multi-panel preserved)")


if __name__ == "__main__":
    main()
