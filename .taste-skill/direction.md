# DIRECTION SHEET — The contact sheet
seed 2010075041 · drawn 2026-10-29 · sector personal-portfolio · tone technical
Brief: Liss independent developer. Real Unity architecture, AI video workflows and playable game experiments. Dark mode required. A personal workshop where code becomes something people can use.

| | |
| --- | --- |
| Direction | The contact sheet |
| Hero | Sheet with a text cell |
| Type | kept from the brand |
| Colour | kept from the brand |
| Sections | work (Book-spine index) → showcase (One image across tiles) → how-it-works (Run-in column) → gallery (Dense masonry sheet) → about (Side facts, wide paragraph) |
| Motion | Shutter image |
| Photographs | the "Fog and quiet" set, as atmosphere |

This is the direction for this build. Adopt it. Do not blend it with the layout you would have made anyway,
and do not redraw because it is unfamiliar: unfamiliar is the point. Redraw a slot only when it conflicts
with a stated brand constraint or needs an asset that does not exist, and say why in your report.

The parts of this sheet were written separately and will disagree in small ways. Settle every disagreement in this order:
**house rules** (including type no smaller than 13px and body text of 16px or more) → **the direction** (the idea, the composition habits, where the
one accent goes) → **the type system and the palette** (which face does which job, the five size steps, which colour is the ground and where the
accent goes) → **the hero blueprint** → **the section blueprints**. Under each blueprint below, "Adjusted for this page" lists where it disagrees.
In practice: take geometry from blueprints (columns, proportions, what sits where) and take everything else from above them. Map every size a
blueprint names onto one of your five type steps instead of adding a sixth. Use one button shape, one corner radius and one pair of page margins on
the whole page, whatever individual blueprints say. If a blueprint names a kind of typeface (a light serif, a heavy grotesk), use the dealt face.

## 1. The idea
Show everything at once, small, in order. The work is laid out like a photographer's contact sheet or an archive drawer: dozens of small frames in strict rows, with all text set at one small size. Nothing is featured, which is the point: the volume and consistency of the body of work is the statement, and the visitor does the choosing. It suits people and studios whose strength is range and output.

Before anything else, write one sentence in your notes: "On this page, <the subject's own material> becomes <the device>."
Fill the first blank from your inventory of what only this client has (its name and what it means, its street, its numbers, its
constraint), then put the nearest competitor in the sentence: if it still works, the idea is the category's, not the client's.
Then name the one live thing the visitor can do on the page (SKILL.md step 4).

## 2. Composition
The name, or one sentence about the work, sits at display size (6–9vw) across the top of the first screen, and the sheet begins directly under it, still inside the first screen. The first screen opens with three or four short blocks of small text across the top on a 12-column grid (who, what, where to reach them), all at 14–16px, and immediately below, the sheet begins: rows of thumbnails at a fixed height (90–140px) with their natural widths, 6–10px gaps, each project forming a run of four to eight frames preceded by its title in the same small text. The sheet fills the whole page width edge to edge with 16–20px margins. Hovering a run dims the others and shows that project's one-line description in a fixed position. A single enlarged frame may interrupt the sheet once per screen at four times the size.

## 3. Type
Kept from the brand. One face. The name at display size on the first screen; everything else at one text size and one small size; hierarchy below the name comes from position and from a single brighter ink for titles.

## 4. Colour
Kept from the brand. Black or white ground, so the thumbnails are the only colour.

## 5. Imagery
**The project has no photographs of its own yet.** First choice: **real pictures of the subject's world from the open collections**: its city and street in old postcards and photographs, an old map of the neighbourhood, its materials up close, its trade in engravings, museum objects of its kind (references/imagery.md §3). Start with `node E:/GPT-Projects/个人网站/.agents/skills/design-taste-frontend/scripts/assets.mjs "can use"`, then queries from your inventory (its street, its materials, its trade's tools and history). Download what you use into the project with `--get` and credit every one on the page (`--credits` prints the footer line). They show the world around the client, never the client's own room, dish, product, person or team. Second, for what no honest picture exists of: draw the subject's own things in code, large, in one flat graphic language and the palette's real colours (its tiles, its windows, its objects; references/imagery.md §8). Third: the dealt photographs, only where an honestly generic picture fits (the sea, the weather, a material), never one a visitor could take for the thing itself and never an unrelated scene. One treatment for all of them. If this direction is built on photographs, plan the set before building (four to six pictures of one family) and reuse them at different crops and scales instead of finding or drawing a new picture for every slot; keep drawings as `<symbol>` + `<use>` or generate them with a small script so the page stays light. List every found picture (with its source and licence), every dealt photograph and every drawing that stands in for photography in your report.

Many images: at least 24 frames to make a sheet. They can be project photographs from the dealt set cropped to mixed ratios, or page captures of the work. Square corners, no captions on the frames.

**Floor (the inspector checks it):** at least four real pictures on the page, usually six to twelve; SVG drawings do not count. One moving picture where an honest clip exists: `node <skill>/scripts/assets.mjs --video "<query>"`, used as a muted loop with a poster frame. Whatever this direction says about pictures, it is carried out with real ones.

Photographs dealt for this build, from the "Fog and quiet" set (misty, muted, minimal landscapes and empty horizons; calm areas for text)
Order of preference for imagery: (1) the project's own photographs and product shots; (2) images you generate, if an image tool is
available; (3) real pictures of the subject's world found in the open collections (assets.mjs, downloaded and credited on the page);
(4) drawings of the subject in code; (5) these. They are real photographs (Unsplash licence, served by picsum.photos) of places, light and
texture. They are atmosphere, never a stand-in for a specific product, dish, person or interface. List the ones you use in your report so
they can be replaced.
- `https://picsum.photos/id/842/1600/1000` — Wooden steps with railings descending into pale pink fog · light tone · blush pink, pale grey, slate · calm area: top · native portrait · photo: Joe Beck
- `https://picsum.photos/id/926/1600/1000` — Lone figure standing on a hilltop in thick beige fog · light tone · warm beige, olive grey · calm area: top · native landscape · photo: Harman Abiwardani
- `https://picsum.photos/id/194/1600/1000` — Wooden deck and a single rock disappearing into thick fog · mid tone · cool grey, weathered brown · calm area: top · native landscape · photo: Aleksi Tappura
- `https://picsum.photos/id/510/1600/1000` — Small red-roofed church below a mountain under a blank white sky · light tone · white, olive brown, grey · calm area: top · native landscape · photo: Jeff Sheldon
- `https://picsum.photos/id/279/1600/1000` — Still misty water fading into a soft pink-grey sky · mid tone · dusty pink, slate grey · calm area: all · native landscape · photo: Taylor Leopold
- `https://picsum.photos/id/353/1600/1000` — Low cloud drifting over dark green forested hills · dark tone · deep green, grey · calm area: top · native landscape · photo: Forrest Cavale
- `https://picsum.photos/id/994/1600/1000` — Silky long-exposure sea beneath a blue and orange sunset sky · mid tone · soft blue, peach, grey · calm area: all · native landscape · photo: Jonathan Bean
- `https://picsum.photos/id/544/1600/1000` — Layered hill ridges fading into warm beige mist · mid tone · beige, warm brown, cream · calm area: top · native landscape · photo: Francesco Gallarotti
The last two path numbers are width and height: request the exact crop you render (`/1200/1500` for a 4:5 portrait, `/2400/1350` for a hero) and
add `?grayscale` to desaturate. Use three to six of them, not all eight. Always set `width`, `height`, `alt` and `loading="lazy"` (not on the hero image).
Other sets that fit this brief: people, architecture, hands-and-making, mountain — `node draw.mjs --photos <set>` prints one in full; `--photos list` shows all sets. Taking photographs from another set is your call and is not a redraw; keep them to one light and one treatment.

## 6. Hero — Sheet with a text cell
The whole viewport is a sheet of photographs: six columns with 12px gaps and 12px outer margins, each column a vertical stack of frames at natural ratios with square corners. Each column starts at a different vertical offset (0, -90, -40, -130, -20, -70px) so rows never line up and the top and bottom frames are cropped by the viewport. Every frame has a flat strip 28px tall fused to its bottom edge in a solid palette colour, carrying one line of 13px text (a title or a place); strip colours rotate through four values. There is no header. In columns 3-4, starting at 28% of the height, one cell of the sheet is not a photograph but a filled panel in the tone opposite to the ground, 410px tall, sitting on the grid like any other frame with the same gaps on all sides. Inside it, top-left aligned on 24px padding: the wordmark at 28px, one sentence at 20px on up to three lines, the single action as a filled rectangle, and three text links on one line at the panel's foot.

On a phone: The text panel spans the full width as the first block, about 40% of the screen height, with the wordmark at 7vw, the sentence at 17px and the action full width. Under it the sheet resumes in two columns with 8px gaps, the right column started 60px higher than the left, colour strips kept on every frame. The links sit in one row at the panel's foot.
Headline: The wordmark at 28px plus one sentence of up to 70 characters inside the panel; nothing is set at display size.

Adjusted for this page:
- It sets text at 12px: use your small step (13px or more) instead.
- Its action is a text link: the primary action on the first screen is a real button (filled or solid-bordered, 44px or taller), placed where the blueprint puts the link. A second action may stay a link.

## 7. Sections, in order
Each is a composition to rebuild with this project's content. Keep the geometry; change the subject. Re-order or drop a
section when the argument of the page needs it (see references/copy.md), never to fall back to a card grid.

### 1. work — Book-spine index (index)
The complete index in the footprint of a banner. Twenty to forty project names are set as single lines rotated to read top to bottom with `writing-mode: vertical-rl`, packed side by side like book spines across the full content width. Each spine is a column 30–34px wide and 420px tall: the name at 18px starts at the top, and the discipline follows after a 12px gap on a flat highlighter-colour background chosen from four palette colours by discipline. Spines are separated only by 6px of space. Hovering or focusing a spine turns it to full ink and dims the others to 40%; the whole spine is the link. A two- or three-word heading at 28px sits top-left above the shelf with a one-sentence note at 15px to its right on the same baseline. No images. Below the shelf, 96px of empty ground. It turns a long client list into one dense typographic object.
On a phone: Rotation is dropped. Names become a horizontal wrap: each name at 17px followed by its highlighted discipline, items flowing inline with 10px gaps and 14px of line spacing, so the index reads as one dense paragraph of links filling the width.

Adjusted for this page:
- It fades text: anything a visitor reads, inactive items of a list included, is `--ink` or `--muted` at full strength (contrast 4.5:1 or more). The active item is told apart by `--ink` against `--muted`, weight or the accent, not by fading the rest.

### 2. showcase — One image across tiles (mosaic)
One photograph is cut across a board of tiles. A grid of six columns and four rows with 8px gaps spans the full width between 12px margins; every tile is square (aspect-ratio: 1). Each tile shows its own piece of the same image: set the photograph as every tile's background at background-size: 600% 400% and step background-position by column and row, so the picture reads whole through the gaps. Five of the twenty-four tiles are swapped for flat colour tiles from the palette, never two adjacent: one holds the heading (two to four words at 2.6vw, top-left, 16px padding), three hold one fact each at 18px, one holds the action. On hover a tile's piece scales to 108% inside its own clip. Choose a photograph with one clear subject, so the board is legible at a glance.
On a phone: Three columns by six rows with 6px gaps, the photograph re-cut at background-size 300% 600% from a portrait crop. Four colour tiles only; the heading tile spans two columns in the top row with the heading at 6vw. Facts drop to 15px.

### 3. how-it-works — Run-in column (list)
The quietest sequence: one reading column and good typography. A single column 520–600px wide starts at about 30% of the viewport width (or sits on the page's text axis). The heading is a two-to-five-word question or statement at 28–32px, 48px above the first paragraph. Three to five paragraphs follow at 17–18px with line-height 1.6. Each opens with a bold run-in phrase in full ink that names its moment ('To begin,', 'Within a day,', 'After that,', 'From then on,') while the rest of the paragraph runs in the soft ink; there are no subheads, bullets or markers. After each paragraph, 20px lower, comes one small piece of evidence exactly as wide as the column: a cropped interface fragment, a photograph at 16:9, or a row of three small frames 96px tall. 72px separates stages. Nothing in the section is wider than the column, and the space to its left stays empty.
On a phone: The column fills the width between 20px margins. Type stays at 17px. Evidence pieces keep the column width; the row of three frames becomes a single sideways-scrolling row 88px tall. 56px between stages. The heading drops to 24px.

### 4. gallery — Dense masonry sheet (mosaic)
A three-line statement at 22px, 30ch wide, sits at the 66% column with 64px of space below it; it is the only large text. Then a dense masonry of about twenty tiles in six columns with 4px gaps and 12px outer margins, built with CSS `columns: 6; column-gap: 4px` and `break-inside: avoid` on each figure. Tile sizes range from 90px squares to one feature tile of 280 by 160px that sits above the first two columns, outside the column flow. Images keep their natural ratios, so column bottoms are ragged. Every tile has one caption line at 12px directly beneath, 6px below the image and 14px above the next tile, in the form name, comma, type. Mix photographs, posters, details and textures. No hover chrome; the sheet reads at a glance and fills the full width.
On a phone: Three columns with 4px gaps and 10px margins; the feature tile spans the full width at the top. Captions stay at 12px but shorten to the name only. The statement sits above at 19px, full width and left-aligned.

Adjusted for this page:
- It sets text at 12px: use your small step (13px or more) instead.

### 5. about — Side facts, wide paragraph (table)
Two rows share one vertical line at 34% of the viewport width. Row one: in a 160px column at the left margin, three label and value pairs stack with 20px between them, each a label in the soft ink with its value beneath in full ink, all at 13px (founded, based in, team size). From the 34% line a five-line paragraph at clamp(20px, 1.7vw, 26px), leading 1.35, runs to 90% of the width. Row two starts 120px lower and repeats the logic for the record of the practice: one plain word at 13px at the far left (awards, press, clients), then from the 34% line two list columns, each 260px wide with a 64px gutter, at 13px with 10px between lines: name at the left, year at the right in the soft ink. No heading; the paragraph opens the section. Each list comfortably holds 6–12 lines. No photographs are needed.
On a phone: Everything aligns to the left margin. The paragraph comes first at 19px. The three label and value pairs follow as a two-column grid at 14px. The two record lists stack with 40px between them, each opened by its plain word in full ink.

## 8. Motion — Shutter image
The one hero or showcase image opens from an edge with a clip-path over about 1.1 seconds while the picture inside settles from 1.12 scale to rest. Use it once, on the image that matters most; later images simply are there. Recipe: 'Image shutter' in references/motion.md.
This is the signature move, the one loud moment. Around it the page still needs the rest of the motion layer (SKILL.md step 9): an entrance for the parts of every section, feedback on every control, and one moving picture. The inspector fails a page that barely moves. Recipes: references/motion.md.

## 10. Where the richness comes from
Density and order. The mass of small images forms a texture; the strict rows keep it calm.

## 11. How this direction goes wrong
With fewer than about 20 images it looks unfinished; choose another direction. Do not add a big headline above the sheet. On a phone the frames become two per row at a fixed height and each run scrolls sideways. Rows that run past the right edge read as clipped in screenshots and to most visitors: wrap the frames onto the next line, or end each row inside the grid.

## 12. Real references
Studied sites that work this way. Take the principle, never the specifics: no names, copy, images or signature assets of theirs.
- **Gil Huybrecht** (Awwwards Site of the Day, studied score 7.6) `aww-gil-huybrecht`
  Idea: A portfolio as a contact sheet: every project is a numbered run of miniature page screenshots on black, and all text is set at one small size.
  Hero: Black field on a seven-column grid with 14px margins. The top band is plain white text at one size, about 16px: name in column one, availability in column two, a services list from column three, a longer awards list from column five, then 'Profile' and 'Email me' at the right. List items are indented one step under their label. Below the lists roughly 300px of black is left empty. At mid-height the thumbnail grid begins: one small website screenshot per column, about 190px wide, each topped by a number at its right corner, with the project name over the first of each run. Two tiny toggle chips sit in the bottom corners.
  Worth taking: Set every piece of text on the page at one size and weight and build hierarchy only from column position and a one-step indent under labels.
- **Oimachi** (Awwwards Site of the Day, studied score 7.1) `aww-oimachi`
  Idea: A studio homepage that behaves like a dense dashboard: work, posts, experiments and testimonials tiled edge to edge with 8px gutters instead of spaced-out sections.
  Hero: Charcoal ground (#181818) with only 8px side margins. Top-left: a round logo, then five tiny black rectangular chips with bold white 13px labels; top-right a contact chip and a theme toggle. The headline starts at the left margin about 160px down: two lines of light grotesk at 52px (3.6vw), tight tracking, with one word in italic serif. From 280px to the bottom edge runs a three-part row: two tall images butted together (each about 535x610px: a hand holding a phone on black, a man in a printed tee) and a 330px sidebar of blog posts, each a bold 14px title, two grey truncated lines and a small-radius thumbnail.
  Worth taking: Shrink page margins and gutters to 8px and tile media edge to edge so a portfolio reads as a working dashboard rather than a brochure.
- **Specia1ne** (One Page Love, studied score 7.3) `opl-specia1ne`
  Idea: One thin blue vertical line runs the full height of the page at 60% of the width, and every section hangs off it like entries on a spine.
  Hero: Type only on warm off-white. Header: wordmark left, the word 'Menu' with a four-square blue icon right, a hairline beneath, 56px side margins. A mono index label (blue number, slash, one word) sits 90px under the rule. The headline follows in four left-aligned lines of bold grotesk at 100px (7% of viewport width) with leading under 1.0, the longest line reaching 90% of the width. A two-line grey 18px paragraph sits beneath. A single 1px blue vertical line crosses the whole viewport at 60% width, straight through the headline. Bottom-left: a blue square with mono location and clock. Bottom-right: a two-line bold link wrapped in blue square brackets.
  Worth taking: Run one 1px coloured vertical line through the whole page at an off-centre position and align lists to it: names right-aligned on one side, descriptions on the other, a numbered square on the line.
Full notes on any of them: `node draw.mjs --site <id>`.

## Always
Headlines two lines or fewer at every width. No eyebrow labels, no monospace, no 01/02/03, no thin rules, no gradients, no shadows at rest,
no cream-and-terracotta, no violet. The frame: one h1 on the first screen that says what this is, equal outer margins, no
section huddled on one side with the other half empty, no blank stretch over half a screen, a heading on every section.
`inspect.mjs` measures all of it.

Saved to E:/GPT-Projects/个人网站/site-next/.taste-skill/direction.json · reprint with `node draw.mjs --show`
