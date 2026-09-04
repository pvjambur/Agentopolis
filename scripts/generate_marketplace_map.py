#!/usr/bin/env python3
"""
Generate frontend/public/assets/maps/marketplace.json
A 40x30 Tiled-compatible orthogonal map for the Agentopolis marketplace.

Layers:
  Ground    -- grass (tile_0000) everywhere; path (tile_0008) on walkways
  Buildings -- shop and tree-border tiles rendered on top of ground
  Collision -- same positions as collidable tiles; used only for physics detection

Run from repo root:
    python3 scripts/generate_marketplace_map.py
"""
from __future__ import annotations

import json
import os
import sys

TILE_W = TILE_H = 16
COLS, ROWS = 40, 30

TILESET_DIR = os.path.join("frontend", "public", "assets", "tilesets", "kenney-rpg-urban")
OUTPUT_MAP = os.path.join("frontend", "public", "assets", "maps", "marketplace.json")

REQUIRED_TILES = ["tile_0000", "tile_0008", "tile_0016", "tile_0081", "tile_0260"]


def assign_gids(tileset_dir: str) -> dict[str, int]:
    """Scan tileset dir, sort tiles, assign 1-based sequential GIDs."""
    try:
        files = sorted(
            f for f in os.listdir(tileset_dir)
            if f.startswith("tile_") and f.endswith(".png")
        )
    except FileNotFoundError:
        print(f"ERROR: Tileset directory not found: {tileset_dir}", file=sys.stderr)
        sys.exit(1)

    if not files:
        print(f"ERROR: No tile_*.png files in {tileset_dir}", file=sys.stderr)
        sys.exit(1)

    return {os.path.splitext(f)[0]: i + 1 for i, f in enumerate(files)}


def build_layers(gid: dict[str, int]) -> tuple[list[int], list[int], list[int]]:
    """Build (ground, buildings, collision) arrays, row-major (left-to-right, top-to-bottom)."""
    G = gid["tile_0000"]  # teal grass
    P = gid["tile_0008"]  # gray plaza / path
    B = gid["tile_0016"]  # red brick -- shops A and C
    T = gid["tile_0081"]  # tan wall  -- shop B
    R = gid["tile_0260"]  # pine tree -- border ring

    ground: list[int] = []
    buildings: list[int] = []
    collision: list[int] = []

    for y in range(ROWS):
        for x in range(COLS):
            g_tile = G
            b_tile = 0
            c_tile = 0

            # --- outer border ring (collidable tree) ---
            is_border = x == 0 or x == COLS - 1 or y == 0 or y == ROWS - 1

            # --- shop footprints (collidable) ---
            shop_a = (4 <= x <= 9)  and (4 <= y <= 9)    # Vegetables
            shop_b = (28 <= x <= 33) and (4 <= y <= 9)   # Fruits
            shop_c = (4 <= x <= 9)  and (18 <= y <= 23)  # Grocery

            # --- walkable paths (ground-layer overlay, not collidable) ---
            main_path     = (14 <= y <= 15) and (4 <= x <= 36)
            hub           = (26 <= y <= 28) and (15 <= x <= 25)  # consumer spawn plaza
            branch_a_up   = (x == 7)  and (10 <= y <= 13)  # shop A --> main path
            branch_b_up   = (x == 31) and (10 <= y <= 13)  # shop B --> main path
            branch_mid_up = (x == 20) and (10 <= y <= 13)  # centre  --> main path
            branch_a_dn   = (x == 7)  and (16 <= y <= 17)  # main path --> shop C
            branch_mid_dn = (x == 20) and (16 <= y <= 25)  # main path --> hub
            branch_b_dn   = (x == 31) and (16 <= y <= 17)  # symmetry stub below shop B

            is_path = (
                main_path or hub
                or branch_a_up or branch_b_up or branch_mid_up
                or branch_a_dn or branch_mid_dn or branch_b_dn
            )
            is_shop = shop_a or shop_b or shop_c

            if is_border:
                b_tile = R
                c_tile = R
            elif is_shop:
                shop_tile = T if shop_b else B
                b_tile = shop_tile
                c_tile = shop_tile
            elif is_path:
                g_tile = P

            ground.append(g_tile)
            buildings.append(b_tile)
            collision.append(c_tile)

    return ground, buildings, collision


def main() -> None:
    gid = assign_gids(TILESET_DIR)
    num_tiles = len(gid)
    print(f"Tiles scanned: {num_tiles}")

    for stem in REQUIRED_TILES:
        if stem not in gid:
            print(f"ERROR: Required tile '{stem}.png' not found in tileset", file=sys.stderr)
            sys.exit(1)

    ground, buildings, collision = build_layers(gid)

    # Tiled 'collection of images' tileset (columns=0 signals per-tile images).
    # Only include the 5 tiles actually placed on the map so the JSON stays compact.
    tiles_section = [
        {
            "id": gid[stem] - 1,  # 0-based within tileset
            "image": f"../tilesets/kenney-rpg-urban/{stem}.png",
            "imageheight": TILE_H,
            "imagewidth": TILE_W,
        }
        for stem in REQUIRED_TILES
    ]

    tiled_json = {
        "height": ROWS,
        "width": COLS,
        "tileheight": TILE_H,
        "tilewidth": TILE_W,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "infinite": False,
        "nextlayerid": 4,
        "nextobjectid": 1,
        "type": "map",
        "version": "1.10",
        "tilesets": [
            {
                "columns": 0,
                "firstgid": 1,
                "margin": 0,
                "name": "kenney-rpg-urban",
                "spacing": 0,
                "tilecount": num_tiles,
                "tileheight": TILE_H,
                "tilewidth": TILE_W,
                "tiles": tiles_section,
            }
        ],
        "layers": [
            {
                "data": ground,
                "height": ROWS,
                "id": 1,
                "name": "Ground",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": COLS,
                "x": 0,
                "y": 0,
            },
            {
                "data": buildings,
                "height": ROWS,
                "id": 2,
                "name": "Buildings",
                "opacity": 1,
                "type": "tilelayer",
                "visible": True,
                "width": COLS,
                "x": 0,
                "y": 0,
            },
            {
                "data": collision,
                "height": ROWS,
                "id": 3,
                "name": "Collision",
                "opacity": 0,
                "type": "tilelayer",
                "visible": False,
                "width": COLS,
                "x": 0,
                "y": 0,
            },
        ],
    }

    os.makedirs(os.path.dirname(OUTPUT_MAP), exist_ok=True)
    with open(OUTPUT_MAP, "w") as f:
        json.dump(tiled_json, f, separators=(",", ":"))

    collidable    = sum(1 for c in collision  if c != 0)
    build_cells   = sum(1 for b in buildings  if b != 0)
    path_cells    = sum(1 for g in ground     if g == gid["tile_0008"])
    total         = COLS * ROWS

    print(f"Map written: {OUTPUT_MAP}")
    print(f"  Dimensions : {COLS}x{ROWS} = {total} cells per layer (3 layers)")
    print(f"  Path cells : {path_cells}")
    print(f"  Build cells: {build_cells}")
    print(f"  Collidable : {collidable}  (expected ~244)")
    print("Done.")


if __name__ == "__main__":
    main()
