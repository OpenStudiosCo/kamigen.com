#!/usr/bin/env python3
"""Rebuild Jim prepared figure from the Affinity-flattened master SVG.

Paint order is independent of the FK hierarchy:
  body_back → arm_L_under → shirt (+ outline) → body_mid → arm chain

The articulated arm paints after the shirt (so the visible limb sits in the
sleeve opening), but is masked by the inverse of the shirt silhouette so the
shoulder joint cannot draw over the garment. arm_L_under shares the upper-arm
pivot and holds the under-sleeve fill that remains behind the shirt.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "new/src/assets/characters/Jim.svg"
OUT_DIR = ROOT / "art/comics/library/characters/jim/prep"

NS = "http://www.w3.org/2000/svg"
XLINK = "http://www.w3.org/1999/xlink"
ET.register_namespace("", NS)
ET.register_namespace("xlink", XLINK)

PIVOT_UPPER = (698.920, 312.811)
PIVOT_LOWER = (762.594, 416.878)
PIVOT_HAND = (751.334, 426.639)

# Original top-level indices in Jim.svg main group (shirt image is 61).
ARM_UNDER = [32, 34, 36, 38, 39, 41, 42, 43, 44]
# Visible articulated chain (after shirt in source paint order).
ARM_UPPER = [80, 81, 82, 85, 98, 107, 108, 109, 110]
ARM_LOWER = [83, 84, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97]
ARM_HAND = [99, 100, 101, 102, 103, 104, 105, 106]
SHIRT_WHITE = 58
SHIRT_STROKE = 62
# clipPath node incorrectly left in the main stream at 60; skip it.
SKIP = {60}


def local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def q(tag: str) -> str:
    return f"{{{NS}}}{tag}"


def dhash(d: str | None) -> str:
    return hashlib.md5((d or "").encode()).hexdigest()[:12]


def clone(el: ET.Element) -> ET.Element:
    return copy.deepcopy(el)


def append_paths(parent: ET.Element, main: ET.Element, indices: list[int]) -> None:
    children = list(main)
    for i in indices:
        parent.append(clone(children[i]))


def rotate_attr(deg: float, pivot: tuple[float, float]) -> str:
    return f"rotate({deg:.3f} {pivot[0]:.3f} {pivot[1]:.3f})"


def build_figure(poses: dict[str, dict[str, float]] | None = None) -> ET.ElementTree:
    poses = poses or {
        "arm_L_under": 0.0,
        "arm_L_upper": 0.0,
        "arm_L_lower": 0.0,
        "arm_L_hand": 0.0,
    }

    src = ET.parse(MASTER)
    sroot = src.getroot()
    smain = list(sroot)[0]
    sdefs = list(sroot)[1]
    children = list(smain)

    # clip47 lives in the main paint stream (Affinity export quirk), not defs.
    clip47_el = children[60]
    if clip47_el.get("id") != "_clip47":
        raise SystemExit(f"Expected _clip47 at main[60], got {clip47_el.get('id')}")
    clip47_path = None
    for c in clip47_el:
        if local(c.tag) == "path":
            clip47_path = c
            break
    if clip47_path is None:
        raise SystemExit("Missing path inside _clip47")

    svg = ET.Element(q("svg"), {
        "width": "1080px",
        "height": "1080px",
        "viewBox": "0 0 1080 1080",
        "version": "1.1",
        "xml:space": "preserve",
        "style": "fill-rule:evenodd;clip-rule:evenodd;stroke-miterlimit:10;",
        "xmlns:xlink": XLINK,
    })

    defs = ET.SubElement(svg, q("defs"))
    # Move clip into defs; copy master defs (gradients + embedded shirt PNG).
    defs.append(clone(clip47_el))
    for child in list(sdefs):
        defs.append(clone(child))

    # Inverse-shirt mask: white everywhere, black where shirt silhouette is.
    mask = ET.SubElement(defs, q("mask"), {
        "id": "_maskHideUnderShirt",
        "maskUnits": "userSpaceOnUse",
        "x": "0",
        "y": "0",
        "width": "1080",
        "height": "1080",
    })
    ET.SubElement(mask, q("rect"), {
        "x": "0", "y": "0", "width": "1080", "height": "1080", "fill": "white",
    })
    hide = clone(clip47_path)
    hide.set("fill", "black")
    hide.set("stroke", "none")
    mask.append(hide)

    fig = ET.SubElement(svg, q("g"), {"id": "jim_figure"})

    # --- body_back: everything before shirt except arm-under and shirt white ---
    body_back = ET.SubElement(fig, q("g"), {"id": "body_back"})
    arm_under_set = set(ARM_UNDER)
    for i, ch in enumerate(children):
        if i >= 61:
            break
        if i in SKIP or i in arm_under_set or i == SHIRT_WHITE:
            continue
        if local(ch.tag) == "clipPath":
            continue
        body_back.append(clone(ch))
    # Shirt white underlay (pre-image fill) stays under clothing
    body_back.append(clone(children[SHIRT_WHITE]))

    # --- arm under sleeve (FK-linked, paints before shirt) ---
    arm_under = ET.SubElement(fig, q("g"), {
        "id": "arm_L_under",
        "data-pivot": f"{PIVOT_UPPER[0]},{PIVOT_UPPER[1]}",
        "data-sync-rotation": "arm_L_upper",
        "transform": rotate_attr(poses["arm_L_under"], PIVOT_UPPER),
    })
    append_paths(arm_under, smain, ARM_UNDER)

    # --- shirt pattern + outline ---
    shirt = ET.SubElement(fig, q("g"), {"id": "shirt"})
    shirt.append(clone(children[61]))  # clipped image group
    # Outline after fill (source index 62)
    shirt.append(clone(children[SHIRT_STROKE]))

    # --- body_mid: head/face/etc between shirt and articulated arm ---
    body_mid = ET.SubElement(fig, q("g"), {"id": "body_mid"})
    arm_after = set(ARM_UPPER + ARM_LOWER + ARM_HAND)
    for i, ch in enumerate(children):
        if i <= 61:
            continue
        if i == SHIRT_STROKE:
            continue
        if i in arm_after:
            continue
        if local(ch.tag) == "clipPath":
            continue
        body_mid.append(clone(ch))

    # --- articulated arm (after shirt), masked so joint cannot cover fabric ---
    arm_upper = ET.SubElement(fig, q("g"), {
        "id": "arm_L_upper",
        "data-pivot": f"{PIVOT_UPPER[0]},{PIVOT_UPPER[1]}",
        "mask": "url(#_maskHideUnderShirt)",
        "transform": rotate_attr(poses["arm_L_upper"], PIVOT_UPPER),
    })
    for i in ARM_UPPER:
        arm_upper.append(clone(children[i]))

    arm_lower = ET.SubElement(arm_upper, q("g"), {
        "id": "arm_L_lower",
        "data-pivot": f"{PIVOT_LOWER[0]},{PIVOT_LOWER[1]}",
        "transform": rotate_attr(poses["arm_L_lower"], PIVOT_LOWER),
    })
    for i in ARM_LOWER:
        arm_lower.append(clone(children[i]))

    arm_hand = ET.SubElement(arm_lower, q("g"), {
        "id": "arm_L_hand",
        "data-pivot": f"{PIVOT_HAND[0]},{PIVOT_HAND[1]}",
        "transform": rotate_attr(poses["arm_L_hand"], PIVOT_HAND),
    })
    for i in ARM_HAND:
        arm_hand.append(clone(children[i]))

    return ET.ElementTree(svg)


def write_svg(tree: ET.ElementTree, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Serialize with XML declaration
    xml = ET.tostring(tree.getroot(), encoding="unicode")
    # Fix ElementTree namespace quirks
    xml = re.sub(r'\sxmlns:ns0="[^"]*"', "", xml)
    xml = re.sub(r"\sns0:", " ", xml)
    # Deduplicate xmlns:xlink (ET may emit it twice)
    seen = False

    def _xlink_once(match: re.Match[str]) -> str:
        nonlocal seen
        if seen:
            return ""
        seen = True
        return match.group(0)

    xml = re.sub(r'\sxmlns:xlink="[^"]*"', _xlink_once, xml)
    if not xml.startswith("<?xml"):
        xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + xml
    path.write_text(xml, encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size} bytes)")


def main() -> None:
    neutral = {
        "arm_L_under": 0.0,
        "arm_L_upper": 0.0,
        "arm_L_lower": 0.0,
        "arm_L_hand": 0.0,
    }
    raised = {
        "arm_L_under": -40.0,
        "arm_L_upper": -40.0,
        "arm_L_lower": -30.0,
        "arm_L_hand": 12.0,
    }
    wave = {
        "arm_L_under": -105.0,
        "arm_L_upper": -105.0,
        "arm_L_lower": -18.0,
        "arm_L_hand": 20.0,
    }

    write_svg(build_figure(neutral), OUT_DIR / "jim_figure.svg")
    write_svg(build_figure(neutral), OUT_DIR / "jim_figure_neutral.svg")
    write_svg(build_figure(raised), OUT_DIR / "jim_figure_arm_posed.svg")
    write_svg(build_figure(wave), OUT_DIR / "jim_figure_arm_wave.svg")

    meta = {
        "paintOrder": [
            "body_back",
            "arm_L_under",
            "shirt",
            "body_mid",
            "arm_L_upper",
            "arm_L_lower",
            "arm_L_hand",
        ],
        "method": (
            "FK hierarchy nests arm_L_lower/hand under arm_L_upper. "
            "Paint order places arm_L_under before shirt and the articulated "
            "chain after shirt. Inverse-shirt mask on arm_L_upper hides the "
            "joint under garment geometry (not an invented rectangle). "
            "arm_L_under syncs rotation with arm_L_upper."
        ),
        "master": str(MASTER.relative_to(ROOT)),
    }
    (OUT_DIR / "prep_meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print("prep_meta updated")


if __name__ == "__main__":
    main()
