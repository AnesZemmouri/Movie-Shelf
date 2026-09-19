/**
 * Shared constants for the case's poster plane.
 *
 * POSTER_W is the depth of the hinged front cover measured in *un-scaled spine
 * space* — i.e. the number of px the cover extends along Z when `rotateY(90deg)`
 * has swung it open. A real Amaray cover is ~135mm wide against a 14mm spine,
 * so ~178px against our ~16-58px spines reads correctly.
 *
 * MovieDetail.tsx reuses it to compute the pulled-out poster's width:
 *   posterW = POSTER_W * scale
 */
export const POSTER_W = 178;

export const faceFont = {
  serif: "font-display",
  sans: "font-sans",
  mono: "font-mono",
} as const;
