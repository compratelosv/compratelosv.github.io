#!/usr/bin/env python3
"""
Genera thumbnails SVG placeholder para el catálogo de demo.
Sin dependencias externas. Cada SVG es un archivo estático embebible.

Uso: python3 make_thumbnails.py
Salida: ./assets/thumbs/*.svg
"""
import os
import pathlib

OUT = pathlib.Path(__file__).parent / "assets" / "thumbs"
OUT.mkdir(parents=True, exist_ok=True)

# Paleta brutalista (misma familia que el resto del sitio)
BG = "#1a1a1a"
FG = "#b0b0b0"
ACC = "#ff3300"

def svg_placeholder(num: int, cat: str, label: str) -> str:
    """Thumbnail cuadrado 800x800 con número grande + categoría."""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="{label}">
  <rect width="800" height="800" fill="{BG}"/>
  <g stroke="{FG}" stroke-opacity="0.10" stroke-width="1">
    {"".join(f'<line x1="0" y1="{y}" x2="800" y2="{y}"/>' for y in range(80, 800, 80))}
    {"".join(f'<line x1="{x}" y1="0" x2="{x}" y2="800"/>' for x in range(80, 800, 80))}
  </g>
  <rect x="24" y="24" width="752" height="752" fill="none" stroke="{ACC}" stroke-width="3" stroke-dasharray="18 12"/>
  <text x="400" y="390" text-anchor="middle" font-family="'Space Mono',monospace" font-size="320" font-weight="700" fill="{FG}" fill-opacity="0.22">{num:02d}</text>
  <text x="400" y="470" text-anchor="middle" font-family="'Space Mono',monospace" font-size="34" font-weight="700" fill="{ACC}" letter-spacing="6">{cat.upper()}</text>
  <text x="400" y="530" text-anchor="middle" font-family="'Space Mono',monospace" font-size="24" fill="{FG}" fill-opacity="0.55" letter-spacing="2">PLACEHOLDER</text>
  <text x="400" y="742" text-anchor="middle" font-family="'Space Mono',monospace" font-size="20" fill="{FG}" fill-opacity="0.35" letter-spacing="3">IMAGEN DE DEMO — REEMPLAZAR</text>
</svg>
"""

# 20 placeholders: 8 ropa, 8 accesorios, 4 skincare
PLAN = (
    [("ROPA", f"Producto {i}") for i in range(1, 9)]
    + [("ACCESORIOS", f"Producto {i}") for i in range(9, 17)]
    + [("SKINCARE", f"Producto {i}") for i in range(17, 21)]
)

written = []
for i, (cat, label) in enumerate(PLAN, start=1):
    name = f"thumb-{i:02d}.svg"
    (OUT / name).write_text(svg_placeholder(i, cat, label), encoding="utf-8")
    written.append(name)

# Un thumbnail "vendido" extra para estados de producto
(OUT / "thumb-sold.svg").write_text(
    svg_placeholder(0, "VENDIDO", "Producto vendido"), encoding="utf-8"
)

print(f"OK — {len(written) + 1} archivos SVG generados en {OUT}")
for w in written[:5]:
    print("  ", w)
print("   ...")
