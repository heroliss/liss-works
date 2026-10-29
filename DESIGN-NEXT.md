# Liss Works · 深色作品档案

This is the independent redesign retained alongside the original `../site/`. The current design authority is this document and `.taste-skill/direction.json`; `DESIGN.md` records the old source design for comparison.

Dark mode is an explicit user requirement. Ground `#0b0e10`, surface `#151a1d`, raised surface `#20282c`, ink `#eeefeb`, secondary text `#b6beba`, accent `#88c8b8`. Rajdhani carries the name and project titles; self-hosted Noto Sans SC carries Chinese text. Flat surfaces, square image corners, clear focus, full screenshot proportions in detail pages. No gradients, decorative hairlines, background particles, glows or autoplay galleries.

Taste Skill v2's contact-sheet composition makes the actual work the first screen. A text cell identifies the author and links to the archive; real interface frames form the rest of the sheet. Selected engineering spreads, a functional workflow, game composition and book-spine project index give each chapter its own rhythm. The phone uses a direct introduction and an interleaved selection of engineering, application and game frames.

GSAP 3.15.0 supplies one engineering-image shutter, native-scroll sheet movement, once-only section entrances, pointer/focus previews and an interruptible workflow. Content is readable before scripts run. Reduced motion removes travel; controls keep their meaning and update immediately. No wheel interception or pinned scroll scenes. Independent tools keep their own working interfaces.

All 22 project records, discussions, downloads, URL filters, screenshots and algorithm functions are retained from the original. New Chinese copy regenerates the bundled subset font with `scripts/prepare-media.py --fonts-only`.
