// Trylo Desktop — Trylo brand mark.
//
// The mark is a 4-stroke X (Z-up / S-down). One Trylo = one mark:
// the geometry below is the SAME as the mobile launcher foreground
// (`mobile-app/.../trylo_launcher_foreground.xml`) — path box
// 449×367 units of the 1024 viewBox, stroke 60.
//
// 2026-10-14 unification: the desktop used to carry its own
// coordinates (550-unit box, stroke 64) while the shipped mobile
// icon used the numbers above — two "same" marks that were not.
// The mobile numbers won (they are what ships and what the owner
// approved for the left-rail brand); the gradient direction was
// kept diagonal across the new box.
//
// Tones:
//   * `aurora` (default) — gold gradient stroke.
//   * `ink` — paper-white stroke for dark canvases.
//   * `cream` (#F3E3A6) — the mobile launcher's stroke colour;
//     pairs with `withBg` for the left-rail brand (cream mark on
//     the #111318 chip = the shipped app icon, shrunk).
//
// `withBg` paints the #111318 rounded chip (the app-icon tile).
// Inside a chip the mark renders at 75% path-box coverage — the
// shipped icon's ratio — which makes the SVG canvas larger than
// the chip; `logo.css` pins `flex-shrink: 0` so the flex chip
// cannot squash it back down.
import type { CSSProperties, ReactElement } from 'react';

export type LogoVariant = 'gradient' | 'solid';
export type LogoTone = 'aurora' | 'ink' | 'cream';

export interface LogoProps {
  /** Pixel size of the rendered svg square (chip size when `withBg`). Defaults to 48. */
  readonly size?: number;
  /** Decorative-only when true (no a11y title). */
  readonly decorative?: boolean;
  /** Stroke treatment. `solid` is single-colour (installer icon). */
  readonly variant?: LogoVariant;
  /** `aurora` (default) gold gradient; `ink` paper-white; `cream` mobile launcher cream. */
  readonly tone?: LogoTone;
  /** Show a soft warm halo behind the mark. */
  readonly glow?: boolean;
  /** Wrap the SVG in a rounded square chip background (#111318 app-icon tile). */
  readonly withBg?: boolean;
  /** Opacity of the SVG only (does not touch the chip background). */
  readonly opacity?: number;
}

const GRADIENT_STOPS: Readonly<{ offset: string; color: string }[]> = [
  { offset: '0', color: '#F0DE91' },
  { offset: '0.55', color: '#DEC86F' },
  { offset: '1', color: '#C6AB50' },
];

const SOLID_COLOR_AURORA = '#DEC86F';
const SOLID_COLOR_INK = '#ECEEF2';
/** The mobile launcher's stroke colour (`trylo_launcher_foreground.xml`). */
const SOLID_COLOR_CREAM = '#F3E3A6';
/** The app-icon tile (`@color/ic_launcher_background`). */
const CHIP_COLOR = '#111318';

/** Mark geometry — identical to the mobile launcher foreground. */
const MARK_PATHS: readonly string[] = [
  'M475 308 L475 444 L595 444',
  'M337 675 L447 610 L397 512',
  'M533 633 L593 537 L715 607',
];
/** INK box (path bbox 378x367 plus the round caps' stroke 60) in
 *  viewBox units. This — not the path bbox — is what the eye
 *  measures, so coverage math must use it. (Getting this wrong
 *  is what shipped the mark 6% off-centre in the first icon pass:
 *  the real x range is 337..715.) */
const MARK_INK_BOX = 438;
/** Optical placement. Centring on the INK BBOX (not the ink centroid):
 *  the mark's ink sits low-left inside its box — two heavy chevrons
 *  carry ~65% of the mass below — so a centroid-centred mark reads
 *  as "pushed to the top" even though its centroid is dead-centre.
 *  The eye tracks the outline, so the outline is the baseline; then
 *  a small upward lift (industry-standard optical centring, 1-3% of
 *  the tile) keeps it from looking mechanically centred. */
const MARK_BBOX_CX = 526;
const MARK_BBOX_CY = 491.5;
const MARK_OPTICAL_LIFT = 3;
const MARK_STROKE = 60;

/** Ink coverage of the chip when `withBg` — the owner's pick from the
 *  four-way comparison sheet (73 / 78 / 82 / 86, phone icon at 76).
 *  82% is full but keeps a visible margin; 86% crowded the corners. */
const CHIP_INK_RATIO = 0.82;

export function Logo(props: LogoProps): ReactElement {
  const size = props.size ?? 48;
  const titleId = props.decorative ? undefined : 'trilo-logo-title';
  const variant = props.variant ?? 'gradient';
  const tone = props.tone ?? 'aurora';
  const gradId = `trilo-aurora-${tone}`;

  // Inside a chip the mark's INK box covers CHIP_INK_RATIO of the
  // chip. Round caps already counted in MARK_INK_BOX, so this is a
  // single clean scale factor; without `withBg` the canvas is the
  // chip size and the mark simply fills the square.
  //   ink box at width W = MARK_INK_BOX * W / 1024 = ratio * size
  const svgSize = props.withBg
    ? Math.round((1024 * CHIP_INK_RATIO * size) / MARK_INK_BOX)
    : size;

  const svg = (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={props.decorative ? 'presentation' : 'img'}
      aria-labelledby={titleId}
      aria-hidden={props.decorative ? 'true' : undefined}
      style={{ display: 'block', opacity: props.opacity }}
    >
      {!props.decorative && <title id={titleId}>Trylo</title>}
      <defs>
        <linearGradient
          id={gradId}
          x1="232"
          y1="220"
          x2="812"
          y2="804"
          gradientUnits="userSpaceOnUse"
        >
          {variant === 'gradient' ? (
            GRADIENT_STOPS.map((stop, i) => (
              <stop key={i} offset={stop.offset} stopColor={stop.color} />
            ))
          ) : (
            <stop
              offset="0"
              stopColor={
                tone === 'ink'
                  ? SOLID_COLOR_INK
                  : tone === 'cream'
                    ? SOLID_COLOR_CREAM
                    : SOLID_COLOR_AURORA
              }
            />
          )}
        </linearGradient>
      </defs>
      <g
        stroke={`url(#${gradId})`}
        strokeWidth={MARK_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        // Optical centring: put the ink BBOX centre on the canvas
        // centre, then lift by MARK_OPTICAL_LIFT units (SVG y grows
        // downward, so the lift subtracts).
        transform={`translate(${512 - MARK_BBOX_CX} ${512 - MARK_BBOX_CY - MARK_OPTICAL_LIFT})`}
      >
        {MARK_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );

  if (!props.withBg && !props.glow) return svg;

  const wrapStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  };

  if (props.glow) {
    return (
      <span
        className="trilo-mark trilo-mark--glow"
        aria-hidden={props.decorative ? 'true' : undefined}
        style={wrapStyle}
      >
        <span
          className="trilo-mark__halo"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: `-${size * 0.55}px`,
            background:
              'radial-gradient(closest-side, rgba(219, 201, 127, 0.22), rgba(219, 201, 127, 0.0) 70%)',
            pointerEvents: 'none',
          }}
        />
        {svg}
      </span>
    );
  }

  return (
    <span
      className="trilo-mark trilo-mark--chip"
      aria-hidden={props.decorative ? 'true' : undefined}
      style={{
        ...wrapStyle,
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.275),
        background: CHIP_COLOR,
      }}
    >
      {svg}
    </span>
  );
}
