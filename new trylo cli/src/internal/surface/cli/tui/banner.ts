/**
 * The startup mark, as terminal characters.
 *
 * **Generated, not drawn.** These rows come from rasterising the vector in
 * `trylocode-site/assets/trylo-mark.svg` — three polylines with a 76-wide
 * round-capped, round-joined stroke on a 1024 viewBox. Each of the 33 x 32
 * sub-cells is tested against the exact stroke (distance to the nearest of the
 * five segments, ≤ 38 units is ink) with a 10x10 grid inside the half-cell, and
 * the half-cell is lit when at least half of that grid is inside. A terminal
 * cannot draw the SVG, so the mark is carried over by geometry instead of by
 * eye, which is the only way it ends up looking like the logo rather than like
 * something inspired by it.
 *
 * Cropped to the stroke's own bounding box, 586 x 572 units (the artwork sits
 * in the middle ~57% of the viewBox, so filling the whole square shrinks it).
 *
 * Resolution: 33 columns x 16 rows, one character per two pixel rows using
 * half blocks (`█▀▄`). The grid follows from the cell, and the cell was
 * measured rather than assumed: in a screenshot of the running CLI (Windows
 * Terminal, Cascadia Mono) the mark's solid stem measured 70px for 5 columns
 * and the whole 16-row mark measured 448px tall, so the cell is 14 x 28 px —
 * exactly 1:2, and a half-block sub-cell is square. `CELL_ASPECT` below is
 * that ratio. The mark's on-screen ratio is then `33 * 1 / (16 * 2)` = 1.031
 * against the artwork's 1.024, a 0.7% difference.
 *
 * The 40 x 16 grid this replaces was derived from an assumed cell of 0.55em x
 * 1.35em, i.e. 1:2.45 rather than 1:2, and rendered 22% too wide — the mark
 * read as squat. 32 x 16 was rejected at the time for looking "stretched tall",
 * which the measurement shows was the wrong conclusion: 32 x 16 is 1.0, within
 * 2.4% of the artwork.
 *
 * Half blocks rather than shade characters (`░▒▓`) because the doubled vertical
 * resolution is what keeps the diagonals from turning into staircases; 33 is
 * also the coarsest grid that carries the artwork's weight (a 76-unit stroke on
 * a 586-unit box is 13% of the width, which is 4.3 columns).
 *
 * The characters are the ones every terminal font has. Colour is optional and
 * applied by the caller — see `paintMark` — because the mark is the one line on
 * the screen that is brand rather than content.
 *
 * Pure: same input, same lines. No IO, no clock, no width probe of its own —
 * the caller decides whether there is room.
 */

/**
 * Width over height of one character cell, measured off a screenshot of the
 * real thing. Everything about the mark's proportions follows from this number,
 * which is why it is written down rather than folded into a magic grid.
 */
export const CELL_ASPECT = 1 / 2;

/** The artwork's own bounding box, in SVG units, after the stroke is applied. */
export const ARTWORK_ASPECT = 586 / 572;

/** 33 columns wide at its widest, 16 rows. The mark alone, with no text beside it. */
export const TRYLO_MARK: ReadonlyArray<string> = [
  "           ███▄",
  "          █████",
  "          █████",
  "          █████",
  "          █████",
  "          █████████████▄",
  "          ▀█████████████",
  "      ▄     ▀▀▀▀▀▀▀▀▀",
  "     ███▄            ▄",
  "     █████         ▄████▄▄",
  "      █████       ██████████▄▄",
  "       █████     █████▀▀███████▄▄",
  "     ▄▄██████  ▄████▀     ▀▀█████",
  "  ▄▄██████▀▀   ████▀          ▀▀",
  "▄██████▀▀       ▀▀",
  "▀███▀",
];

/**
 * Below this there is no room for the mark and a line of text beside it, so
 * the text goes alone.
 */
export const BANNER_MIN_WIDTH = 44;

/**
 * The rows the caption is written on. They are the two narrowest: the mark's
 * upper stem leaves the right-hand side clear, so the text sits in the mark's
 * own negative space instead of beside its widest row.
 */
const CAPTION_ROWS: ReadonlySet<number> = new Set([0, 1]);

/** How far the caption sits from the mark. */
const CAPTION_GAP = "   ";

export type Banner = {
  readonly lines: ReadonlyArray<string>;
};

/**
 * The mark with up to two caption lines beside it, or the captions alone when
 * there is no room.
 *
 * Text goes beside rather than under: a startup screen is read once and then
 * scrolled away, and twelve rows of art with a thirteenth row of text under it
 * is twelve rows more than the same information needs.
 *
 * `paintMark` is applied to the mark's own characters only, never to a caption:
 * the two are different kinds of thing on the screen, and a gradient that
 * washed over the words would make them harder to read.
 */
export function banner(
  captions: ReadonlyArray<string>,
  columns: number,
  paintMark: (row: string, at: number) => string = (row) => row,
): Banner {
  if (columns < BANNER_MIN_WIDTH) {
    return { lines: captions };
  }
  return {
    lines: TRYLO_MARK.map((raw, at) => {
      const row = paintMark(raw, at);
      const caption = CAPTION_ROWS.has(at) ? captions[at] : undefined;
      return caption === undefined ? row : `${row}${CAPTION_GAP}${caption}`;
    }),
  };
}
