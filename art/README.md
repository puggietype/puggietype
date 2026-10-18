# PuggieType character art generators

Original procedural vector art by the PuggieType team (GPL-3.0, see `NOTICE`).
`pug.py` is the canonical shared body/desk/paws; `breeds*.py` add per-breed heads;
`breeds8.py` is the final 8-dog lineup.

    pip install cairosvg pillow
    python3 art/render8.py            # writes art/sketches/frames/*.svg (+ preview pngs, gitignored)
    cd frontend && pnpm sync-characters

`ART_DIR` overrides the output folder.
