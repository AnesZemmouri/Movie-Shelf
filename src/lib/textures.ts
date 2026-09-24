/**
 * Procedural PBR maps for the keepcase surfaces.
 *
 * Everything here is generated at runtime — no texture assets. That keeps the
 * claim that both renderers draw the same object: WebGL consumes these as
 * Texture maps, and the CSS panel consumes the same canvases as data URLs.
 *
 * Maps are generated ONCE and cached. They describe generic moulded plastic, so
 * they do not vary per film; the film's own colour rides on the material, and
 * per-film wear is applied as a material parameter rather than baked in.
 *
 * Shared by three callers — the study's CSS and WebGL panels, and the archive's
 * shelf — which is why it sits in lib/ rather than inside src/mockup/, a folder
 * vite.config.ts documents as deletable.
 */

/** Edge length of every generated map, in px. */
const TILE = 512;

/**
 * World units covered by one tile. Tiling is computed from the real face size
 * so orange-peel stays the same physical size on a 52px spine wall and a 327px
 * cover — otherwise the spine would come out six times finer than the front.
 */
export const UNITS_PER_TILE = 110;

export type SurfaceMaps = {
  /** Albedo. Near-white: it multiplies the material colour, and carries the
   *  whitened stress marks that handling leaves on plastic. */
  color: HTMLCanvasElement
  /** Tangent-space normal map, OpenGL convention (+Y up). */
  normal: HTMLCanvasElement;
  /** Linear roughness. Mid-grey base, scuffs read brighter (duller). */
  roughness: HTMLCanvasElement;
  /** Mid-grey noise straight through, for a CSS overlay layer. */
  grain: HTMLCanvasElement;
  /** Alpha-only noise, for masking a specular layer in CSS. */
  sheenMask: HTMLCanvasElement;
};

export type SurfaceTextures = {
  maps: SurfaceMaps;
  /** Mean of the roughness map, in 0..1. Divide a material's intended
   *  roughness by this when a roughnessMap is attached. */
  roughnessMean: number;
  color: string;
  grain: string;
  sheenMask: string;
};

/**
 * The subset a CSS-only case can use: the WebGL maps are canvases meant for a
 * GPU, whereas these two are consumed as data URLs — grain for an overlay
 * blend, sheenMask for an alpha mask. Defined here so the shelf does not have
 * to import a type out of the study.
 */
export type SurfaceUrls = {
  grain: string;
  sheenMask: string;
};

/* ---------------------------------------------------------------------------
   Tileable noise
   --------------------------------------------------------------------------- */

/** Integer hash. Math.imul keeps this in 32-bit territory, which the plain
 *  `*` would not — it would drift past 2^53 and lose low bits. */
function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Value noise that wraps every `period` cells, so the resulting tile is
 * seamless. The wrap is what stops a visible grid seam every 110 world units.
 */
function valueNoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const wrap = (v: number) => ((v % period) + period) % period;
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);

  const x0 = wrap(xi);
  const x1 = wrap(xi + 1);
  const y0 = wrap(yi);
  const y1 = wrap(yi + 1);

  return lerp(
    lerp(hash(x0, y0, seed), hash(x1, y0, seed), tx),
    lerp(hash(x0, y1, seed), hash(x1, y1, seed), tx),
    ty,
  );
}

/** Fractal sum. Frequencies stay integer multiples of `period` so each octave
 *  wraps too. */
function fbm(x: number, y: number, period: number, octaves: number, seed: number) {
  let sum = 0;
  let amplitude = 1;
  let normalisation = 0;
  let frequency = 1;

  for (let octave = 0; octave < octaves; octave++) {
    sum +=
      amplitude *
      valueNoise(x * frequency, y * frequency, period * frequency, seed + octave * 131);
    normalisation += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / normalisation;
}

/* ---------------------------------------------------------------------------
   Height field
   --------------------------------------------------------------------------- */

/**
 * Surface relief, in 0..1.
 *
 * Three scales, because plastic has three: a slow orange-peel from the mould
 * (large and gentle), a fine grind from the abrasive in the polymer, and
 * directional scratches from handling. Only the first two are uniform — the
 * scratches are what make a used case read as used.
 */
function buildHeight(): { height: Float32Array; scuff: Float32Array } {
  const height = new Float32Array(TILE * TILE);
  const scuff = new Float32Array(TILE * TILE);

  // Orange peel: period 8 cells over the tile (~14 world units per cell).
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const u = (x / TILE) * 8;
      const v = (y / TILE) * 8;
      const peel = fbm(u, v, 8, 3, 7);
      // Fine grind, at a much higher frequency.
      const grind = fbm((x / TILE) * 64, (y / TILE) * 64, 64, 2, 991);
      height[y * TILE + x] = peel * 0.72 + grind * 0.28;
    }
  }

  // Scratches. Drawn rather than noised: they are long, thin and sparse, which
  // is exactly what fBm cannot produce at any octave count.
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.lineCap = "round";

  // Deterministic layout — no Math.random, so both renderers and every reload
  // get byte-identical maps.
  let seed = 20260924;
  const rand = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let i = 0; i < 90; i++) {
    const angle = rand() * Math.PI * 0.55 - Math.PI * 0.28;
    const length = 40 + rand() * 260;
    const x = rand() * TILE;
    const y = rand() * TILE;
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + rand() * 0.5})`;
    ctx.lineWidth = rand() < 0.75 ? 0.7 + rand() * 0.7 : 1.6 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  // A dusting of pits, so the surface isn't purely linear damage.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.08 + rand() * 0.3})`;
    ctx.beginPath();
    ctx.arc(rand() * TILE, rand() * TILE, 0.6 + rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const drawn = ctx.getImageData(0, 0, TILE, TILE).data;
  for (let i = 0; i < TILE * TILE; i++) {
    const s = drawn[i * 4] / 255;
    scuff[i] = s;
    height[i] = height[i] * (1 - s * 0.55) - s * 0.18;
  }

  return { height, scuff };
}

/** Wrap-around sample, so the normal map tiles as cleanly as the height does. */
function at(field: Float32Array, x: number, y: number) {
  const wx = ((x % TILE) + TILE) % TILE;
  const wy = ((y % TILE) + TILE) % TILE;
  return field[wy * TILE + wx];
}

/* ---------------------------------------------------------------------------
   Derivations
   --------------------------------------------------------------------------- */

function canvasFrom(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  return [canvas, canvas.getContext("2d")!];
}

function normalFromHeight(height: Float32Array, strength: number) {
  const [canvas, ctx] = canvasFrom();
  const image = ctx.createImageData(TILE, TILE);

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // Central difference, wrapped — a forward difference would leave a seam.
      const dx = (at(height, x + 1, y) - at(height, x - 1, y)) * strength;
      const dy = (at(height, x, y + 1) - at(height, x, y - 1)) * strength;

      // Normalise (-dx, -dy, 1). OpenGL convention: +Y (green) is up.
      const length = Math.hypot(dx, dy, 1);
      const i = (y * TILE + x) * 4;
      image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((dy / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = (1 / length) * 0.5 * 255 + 127.5;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Roughness. Base sits mid-grey and scuffs push it brighter — a scratched
 * patch of plastic scatters light, so it reads duller than the polished field
 * around it. This is the map that does the most work: it is what breaks a
 * specular streak into patches instead of a clean gradient.
 *
 * The mean comes back too. A roughnessMap *multiplies* the material's
 * roughness, so to keep the intended value you have to divide by the map's
 * actual average — guessing 0.5 leaves the material brighter or duller than
 * asked for.
 */
function roughnessFromHeight(height: Float32Array, scuff: Float32Array) {
  const [canvas, ctx] = canvasFrom();
  const image = ctx.createImageData(TILE, TILE);
  let sum = 0;

  for (let i = 0; i < TILE * TILE; i++) {
    // The height field already carries the scuff, so it drives the spread;
    // scuff is added again to weight damage above undamaged mould texture.
    const value = 0.42 + (height[i] - 0.5) * 0.5 + scuff[i] * 0.45;
    const clamped = Math.max(0.05, Math.min(1, value));
    sum += clamped;
    const v = clamped * 255;
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, mean: sum / (TILE * TILE) };
}

/**
 * Albedo grain. Nearly white, because it multiplies the material's colour —
 * anything stronger turns the case grey. The one real feature is that scuffs
 * come out brighter: stressed plastic whitens.
 */
function colorFromHeight(height: Float32Array, scuff: Float32Array) {
  const [canvas, ctx] = canvasFrom();
  const image = ctx.createImageData(TILE, TILE);

  for (let i = 0; i < TILE * TILE; i++) {
    const value = 0.86 + (height[i] - 0.5) * 0.16 + scuff[i] * 0.34;
    const v = Math.max(0, Math.min(255, value * 255));
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Mid-grey noise for CSS overlay blending — overlay is a no-op at 128, so this
 *  must stay centred rather than near-white. */
function grainFromHeight(height: Float32Array) {
  const [canvas, ctx] = canvasFrom();
  const image = ctx.createImageData(TILE, TILE);

  for (let i = 0; i < TILE * TILE; i++) {
    const v = (0.5 + (height[i] - 0.5) * 0.9) * 255;
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Alpha-only noise for CSS. A CSS mask reads the alpha channel, so the grain
 * has to live there — a greyscale PNG would mask on luminance and silently do
 * nothing useful in Chrome.
 */
function sheenMaskFromHeight(height: Float32Array) {
  const [canvas, ctx] = canvasFrom();
  const image = ctx.createImageData(TILE, TILE);

  for (let i = 0; i < TILE * TILE; i++) {
    // Bright alpha where the surface is polished, so the highlight survives
    // there and gets eaten where the plastic is dull.
    const v = Math.max(0, Math.min(1, 0.35 + (height[i] - 0.5) * 2.2));
    image.data[i * 4] = 255;
    image.data[i * 4 + 1] = 255;
    image.data[i * 4 + 2] = 255;
    image.data[i * 4 + 3] = v * 255;
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/* ---------------------------------------------------------------------------
   Cache
   --------------------------------------------------------------------------- */

let cache: SurfaceTextures | null = null;

/** Generated on first use and reused for every film — this is generic moulded
 *  plastic, not per-film artwork. Costs a few hundred ms once. */
export function surfaceTextures(): SurfaceTextures {
  if (cache) return cache;

  const { height, scuff } = buildHeight();
  const roughness = roughnessFromHeight(height, scuff);
  const maps: SurfaceMaps = {
    color: colorFromHeight(height, scuff),
    normal: normalFromHeight(height, 9),
    roughness: roughness.canvas,
    grain: grainFromHeight(height),
    sheenMask: sheenMaskFromHeight(height),
  };

  cache = {
    maps,
    roughnessMean: roughness.mean,
    color: maps.color.toDataURL("image/png"),
    grain: maps.grain.toDataURL("image/png"),
    sheenMask: maps.sheenMask.toDataURL("image/png"),
  };
  return cache;
}
