import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Movie } from "../data/movies";
import { caseBand, cachedPoster, type CaseGeometry } from "./geometry";
import { surfaceTextures, UNITS_PER_TILE } from "../lib/textures";

type Props = {
  movie: Movie;
  geometry: CaseGeometry;
  /** Cover hinge angle in degrees; 0 is shut. */
  open: number;
  finish: "clear" | "matte";
  wear: number;
  lightAngle: number;
  yaw: number;
  pitch: number;
  showDisc: boolean;
  /** Distance from the viewer to the case, shared with the CSS perspective. */
  viewerDistance: number;
  /** 0 turns every surface map off, so the relief can be A/B'd. */
  surfaceDetail: number;
};

/** Named rather than a loose Record, so cloning `shell` stays typed as the
 *  physical material it actually is. */
type Materials = {
  /** The moulded shell. */
  shell: THREE.MeshPhysicalMaterial;
  back: THREE.MeshStandardMaterial;
  tray: THREE.MeshStandardMaterial;
  coverInner: THREE.MeshStandardMaterial;
  /** The printed insert on the front cover. */
  poster: THREE.MeshPhysicalMaterial;
  spineArt: THREE.MeshPhysicalMaterial;
  disc: THREE.MeshPhysicalMaterial;
};

type BaseTextures = {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  /** Mean of the roughness map. A roughnessMap multiplies the material's
   *  roughness, so this is what you divide by to get back the intended value. */
  roughnessMean: number;
};

type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: THREE.Group;
  key: THREE.DirectionalLight;
  materials: Materials | null;
  /** Untiled source maps. Each face clones these with a repeat scaled to its
   *  own real-world size, so grain stays the same physical size everywhere. */
  textures: BaseTextures | null;
  /** Roughness / env intensity each material was built with, so the wear slider
   *  scales from the intended value instead of compounding every update. */
  base: Map<THREE.MeshStandardMaterial, { roughness: number; env: number }>;
  coverPivot: THREE.Object3D | null;
  /** Whatever material the front cover is currently using. With surface detail
   *  on that is a per-build clone, so the async poster swap has to patch it
   *  directly — otherwise the cover keeps the procedural stand-in forever. */
  coverMaterial: THREE.MeshPhysicalMaterial | null;
  disposeCase: () => void;
};

/** Camera field of view in degrees. The shared viewer distance does the
 *  framing, so this only needs to agree with the CSS perspective maths. */
export const FOV = 30;

/**
 * three.js render of the same keepcase the CSS version draws.
 *
 * Real geometry rather than planes: a back slab, spine, three walls, a disc
 * tray, and a front cover on a pivot at the spine edge. That buys a genuinely
 * depth-sorted solid plus real specular highlights off the plastic — the part
 * CSS 3D cannot fake.
 */
export function WebglKeepcase({
  movie,
  geometry,
  open,
  finish,
  wear,
  lightAngle,
  yaw,
  pitch,
  showDisc,
  viewerDistance,
  surfaceDetail,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Stage | null>(null);

  // The RAF loop reads these every frame, so they must not re-subscribe it.
  const orbit = useRef({ yaw, pitch });
  const liveId = useRef(movie.id);
  // buildCase poses the hinge as it builds, so a rebuild driven by a thickness
  // change can't leave the cover shut behind the user's open slider.
  const openRef = useRef(open);
  useEffect(() => {
    orbit.current = { yaw, pitch };
    liveId.current = movie.id;
    openRef.current = open;
  });

  const { height } = geometry;

  // ---- renderer, scene, lights, loop --------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.className = "mk-canvas";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // FOV is fixed; the shared viewer distance does the framing, so the case
    // lands at 1 world unit = 1 CSS px here exactly as it does in the CSS panel.
    const camera = new THREE.PerspectiveCamera(FOV, 1, 20, 60000);
    camera.position.set(0, 0, 4000);
    camera.lookAt(0, 0, 0);

    // A procedurally built studio environment — cheaper than importing
    // RoomEnvironment, and it keeps this page's dependency surface to plain
    // three with no examples/ imports.
    scene.environment = studioEnvironment(renderer);
    scene.environmentIntensity = 0.6;

    const key = new THREE.DirectionalLight(0xfff2dd, 2.6);
    scene.add(key);
    const rim = new THREE.PointLight(0x9fd8ff, 2600, 12000);
    rim.position.set(-height, height * 0.5, -height);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0xffffff, 0.42));

    const world = new THREE.Group();
    scene.add(world);

    const stage: Stage = {
      renderer,
      scene,
      camera,
      world,
      key,
      materials: null,
      textures: null,
      base: new Map(),
      coverPivot: null,
      coverMaterial: null,
      disposeCase: () => {},
    };
    stageRef.current = stage;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let raf = 0;
    const tick = () => {
      world.rotation.y = THREE.MathUtils.degToRad(orbit.current.yaw);
      world.rotation.x = THREE.MathUtils.degToRad(orbit.current.pitch);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      stage.disposeCase();
      disposeMaterials(stage);
      disposeBaseTextures(stage);
      scene.environment?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
    };
  }, [height]);

  // ---- materials, rebuilt when the film or finish changes ------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    disposeMaterials(stage);
    disposeBaseTextures(stage);
    disposeCaseOf(stage);

    const matte = finish === "matte";
    const spineColor = new THREE.Color(movie.spine);
    const surface = surfaceTextures();
    const anisotropy = stage.renderer.capabilities.getMaxAnisotropy();

    /**
     * Canvas maps straight through. Colour space is the thing to get right
     * here: albedo is sRGB, but normal and roughness are raw numbers, and
     * tagging them sRGB would gamma-warp every value before the shader sees it.
     */
    const dataTexture = (canvas: HTMLCanvasElement, srgb = false) => {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = anisotropy;
      return texture;
    };

    stage.textures = {
      color: dataTexture(surface.maps.color, true),
      normal: dataTexture(surface.maps.normal),
      roughness: dataTexture(surface.maps.roughness),
      roughnessMean: surface.roughnessMean,
    };

    const posterTexture = new THREE.CanvasTexture(drawPoster(movie));
    posterTexture.colorSpace = THREE.SRGBColorSpace;
    posterTexture.anisotropy = anisotropy;

    const spineTexture = new THREE.CanvasTexture(drawSpine(movie));
    spineTexture.colorSpace = THREE.SRGBColorSpace;

    const discTexture = new THREE.CanvasTexture(drawDisc());
    discTexture.colorSpace = THREE.SRGBColorSpace;

    const flat = (color: THREE.ColorRepresentation, roughness: number) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });

    stage.materials = {
      // The moulded shell. A clear Amaray is glossy with a strong clearcoat; a
      // matte sleeve is flat and swallows the highlight.
      shell: new THREE.MeshPhysicalMaterial({
        color: spineColor,
        roughness: matte ? 0.74 : 0.26,
        metalness: 0.02,
        clearcoat: matte ? 0.04 : 0.85,
        clearcoatRoughness: matte ? 0.7 : 0.1,
        envMapIntensity: matte ? 0.45 : 1.15,
      }),
      back: flat("#141416", 0.62),
      tray: flat("#1b1b1f", 0.66),
      coverInner: flat("#303036", 0.78),
      poster: new THREE.MeshPhysicalMaterial({
        map: posterTexture,
        roughness: matte ? 0.68 : 0.42,
        metalness: 0.03,
        clearcoat: matte ? 0.05 : 0.5,
        clearcoatRoughness: matte ? 0.6 : 0.14,
        envMapIntensity: matte ? 0.45 : 0.8,
      }),
      spineArt: new THREE.MeshPhysicalMaterial({
        map: spineTexture,
        roughness: matte ? 0.68 : 0.28,
        metalness: 0.02,
        clearcoat: matte ? 0.05 : 0.8,
        clearcoatRoughness: matte ? 0.6 : 0.12,
        envMapIntensity: matte ? 0.45 : 1.1,
      }),
      disc: new THREE.MeshPhysicalMaterial({
        map: discTexture,
        // A real disc is glossy polycarbonate, not chrome. At high metalness it
        // has no diffuse term and simply mirrors the (dark) studio back to you.
        metalness: 0.35,
        roughness: 0.3,
        envMapIntensity: 1.2,
        side: THREE.DoubleSide,
      }),
    };

    stage.base = new Map(
      Object.values(stage.materials).map((material) => [
        material,
        {
          roughness: material.roughness,
          env: material.envMapIntensity ?? 1,
        },
      ]),
    );

    // Swap in the real artwork once the cached copy decodes; until then the
    // procedural canvas above stands in, so the case is never blank. The
    // remote Letterboxd URL cannot be used here — it sends no
    // Access-Control-Allow-Origin, so the texture upload would throw.
    const wantedId = movie.id;
    // Comparing the id alone is not enough: under StrictMode, or on a fast
    // film switch, this effect's cleanup has already torn the old stage down by
    // the time the image decodes, and `stage.materials` is an empty object.
    const owner = stage;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      cachedPoster(movie),
      (texture) => {
        const poster = stageRef.current === owner ? owner.materials?.poster : undefined;
        if (liveId.current !== wantedId || !poster) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = owner.renderer.capabilities.getMaxAnisotropy();
        poster.map?.dispose();
        poster.map = texture;
        poster.needsUpdate = true;

        // When surface detail is on the cover face is a clone, which took the
        // stand-in map by reference. Point it at the real artwork too — the
        // clone's map is the very texture just disposed above, so it must be
        // reassigned rather than disposed again.
        const cover = owner.coverMaterial;
        if (cover && cover !== poster) {
          cover.map = texture;
          cover.needsUpdate = true;
        }
      },
      undefined,
      () => {
        // No cached poster, or the dev middleware is off — keep the canvas.
      },
    );
  }, [movie, finish]);

  // ---- framing, matched to the CSS panel's perspective ---------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.camera.position.z = viewerDistance;
    stage.camera.lookAt(0, 0, 0);
  }, [viewerDistance]);

  // ---- case geometry -------------------------------------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !stage.materials) return;
    buildCase(stage, geometry, showDisc, openRef.current, surfaceDetail);
  }, [geometry, showDisc, surfaceDetail]);

  // ---- the cover hinge and the shared key light ----------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.coverPivot) {
      stage.coverPivot.rotation.y = -THREE.MathUtils.degToRad(open);
    }

    const radians = THREE.MathUtils.degToRad(lightAngle);
    const radius = height * 2.6;
    stage.key.position.set(
      Math.sin(radians) * radius,
      height * 1.4,
      Math.cos(radians) * radius,
    );

    // Wear scuffs the plastic: rougher, and less responsive to the environment.
    // Mutating three.js materials in place is intended — they are imperative
    // GPU state held in a ref, not React values — which the react/immutability
    // rule has no way to model.
    const mean = stage.textures?.roughnessMean ?? 1;
    for (const [material, base] of stage.base) {
      // A roughnessMap multiplies material.roughness, so undo the map's average
      // first — otherwise every textured face drifts duller than intended.
      const intended =
        material.roughnessMap && mean > 0 ? base.roughness / mean : base.roughness;
      // oxlint-disable-next-line react/immutability
      material.roughness = Math.min(1, intended + wear * 0.38);
      material.envMapIntensity = base.env * (1 - wear * 0.4);
    }
  }, [open, lightAngle, wear, height, surfaceDetail]);

  return <div ref={hostRef} className="mk-canvas-host" />;
}

/* ---------------------------------------------------------------------------
   Case construction
   --------------------------------------------------------------------------- */

/**
 * Copy of a base map wrapped to a face of worldW × worldH.
 *
 * Clones share the underlying image (and therefore the GPU upload), so giving
 * every face its own repeat costs nothing but a texture object. Doing it this
 * way is what keeps orange-peel the same physical size on a narrow spine wall
 * as on the full-size cover — one shared repeat would make the spine six times
 * finer than the front.
 */
function tiledTo(base: THREE.Texture, worldW: number, worldH: number) {
  const texture = base.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    Math.max(1, Math.round(worldW / UNITS_PER_TILE)),
    Math.max(1, Math.round(worldH / UNITS_PER_TILE)),
  );
  texture.needsUpdate = true;
  return texture;
}

/**
 * Lays the case out in its own units, centred on the origin.
 *
 * Depth, front to back: the cover occupies the foremost `shell` slice of the
 * spine depth, the disc tray fills the space behind it, and the back slab sits
 * flush on the rear. Interior walls run the tray's depth so nothing z-fights.
 */
function buildCase(
  stage: Stage,
  geometry: CaseGeometry,
  showDisc: boolean,
  open: number,
  surfaceDetail: number,
) {
  const m = stage.materials;
  // Materials are built by an earlier effect in the same commit; if they are
  // missing there is nothing to texture and no case to build.
  if (!m) return;

  stage.disposeCase();
  const { coverW: W, height: H, spine: T } = geometry;
  const surface = stage.textures;
  const shaped = surfaceDetail > 0.02;
  const shell = Math.max(2, T * 0.14);
  const innerD = Math.max(2, T - shell * 2);
  const innerW = Math.max(2, W - shell * 2);
  const innerH = Math.max(2, H - shell * 2);

  const geometries: THREE.BufferGeometry[] = [];
  const objects: THREE.Object3D[] = [];
  /**
   * Materials minted for this build only, with the exact textures each one
   * created. Ownership matters: a clone copies its source's `map` by reference,
   * so disposing everything a clone points at would tear down the base
   * material's artwork as soon as the case was rebuilt.
   */
  const extra: { material: THREE.MeshPhysicalMaterial; owned: THREE.Texture[] }[] = [];
  const track = (g: THREE.BufferGeometry) => {
    geometries.push(g);
    return g;
  };

  /**
   * Register a per-build material with the wear pass. buildCase runs before the
   * wear effect in the same commit, so anything registered here picks up the
   * current wear value immediately — and on a wear-only change the variants
   * survive from the last build and get updated with everything else.
   */
  const register = (
    material: THREE.MeshPhysicalMaterial,
    owned: (THREE.Texture | null)[],
  ) => {
    stage.base.set(material, {
      roughness: material.roughness,
      env: material.envMapIntensity ?? 1,
    });
    extra.push({
      material,
      owned: owned.filter((texture): texture is THREE.Texture => Boolean(texture)),
    });
    return material;
  };

  /**
   * The shell material, textured for this particular face. Walls differ in
   * width, so they get their own repeat rather than sharing one.
   */
  const shellFor = (worldW: number, worldH: number) => {
    if (!shaped || !surface) return m.shell;
    const variant = m.shell.clone();
    variant.map = tiledTo(surface.color, worldW, worldH);
    variant.normalMap = tiledTo(surface.normal, worldW, worldH);
    variant.roughnessMap = tiledTo(surface.roughness, worldW, worldH);
    // Deliberately the plain intended value. The map multiplies it, and the
    // division that undoes that lives in the wear pass — doing it here too
    // would compound and pin the material at fully rough.
    variant.roughness = m.shell.roughness;
    variant.normalScale.set(0.7 * surfaceDetail, 0.7 * surfaceDetail);
    variant.needsUpdate = true;
    return register(variant, [variant.map, variant.normalMap, variant.roughnessMap]);
  };

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(track(geometry), material);
    mesh.position.set(x, y, z);
    stage.world.add(mesh);
    objects.push(mesh);
    return mesh;
  };

  // Back slab. Its +z face looks into the case, its -z face is the outer back.
  add(
    new THREE.BoxGeometry(W, H, shell),
    [shellFor(W, H), shellFor(W, H), shellFor(W, H), shellFor(W, H), m.back, m.back],
    0,
    0,
    -T / 2 + shell / 2,
  );

  // Spine (left wall). BoxGeometry material order is [+x, -x, +y, -y, +z, -z],
  // so the outward -x face is index 1 and carries the printed spine.
  const spineArt = shaped && surface
    ? Object.assign(m.spineArt.clone(), {
        normalMap: tiledTo(surface.normal, shell, H),
        roughnessMap: tiledTo(surface.roughness, shell, H),
        roughness: m.spineArt.roughness / 0.5,
      })
    : m.spineArt;
  if (spineArt !== m.spineArt) {
    spineArt.normalScale.set(0.7 * surfaceDetail, 0.7 * surfaceDetail);
    spineArt.roughness = m.spineArt.roughness;
    spineArt.needsUpdate = true;
    // Its `map` is the base spine texture, borrowed — not owned.
    register(spineArt, [spineArt.normalMap, spineArt.roughnessMap]);
  }
  add(
    new THREE.BoxGeometry(shell, H, innerD),
    [shellFor(shell, H), spineArt, shellFor(shell, H), shellFor(shell, H), shellFor(shell, H), shellFor(shell, H)],
    -W / 2 + shell / 2,
    0,
    0,
  );

  // Right, top and bottom walls.
  add(new THREE.BoxGeometry(shell, H, innerD), shellFor(shell, H), W / 2 - shell / 2, 0, 0);
  add(
    new THREE.BoxGeometry(innerW, shell, innerD),
    shellFor(innerW, shell),
    0,
    H / 2 - shell / 2,
    0,
  );
  add(
    new THREE.BoxGeometry(innerW, shell, innerD),
    shellFor(innerW, shell),
    0,
    -H / 2 + shell / 2,
    0,
  );

  // Disc tray, and the disc resting on it.
  add(new THREE.BoxGeometry(innerW, innerH, innerD), m.tray, 0, 0, 0);
  if (showDisc) {
    const disc = new THREE.Mesh(
      track(new THREE.CircleGeometry(Math.min(innerW, innerH) * 0.42, 72)),
      m.disc,
    );
    disc.position.set(0, 0, innerD / 2 + 0.6);
    stage.world.add(disc);
    objects.push(disc);
  }

  // Front cover on a pivot at the spine edge. Idle, it rests in the frontmost
  // shell slice so the tray and disc never poke through.
  const pivot = new THREE.Group();
  pivot.position.set(-W / 2, 0, T / 2 - shell / 2);
  // Negative so the cover sweeps forward through +Z and ends flat to the left,
  // the way a keepcase actually opens. CssKeepcase uses the same sign.
  pivot.rotation.y = -THREE.MathUtils.degToRad(open);

  // The cover carries the printed insert, so it gets the paper-plastic relief
  // tiled to the full cover rather than the shell's.
  const coverArt = shaped && surface
    ? Object.assign(m.poster.clone(), {
        normalMap: tiledTo(surface.normal, W, H),
        roughnessMap: tiledTo(surface.roughness, W, H),
        roughness: m.poster.roughness / 0.5,
      })
    : m.poster;
  if (coverArt !== m.poster) {
    coverArt.normalScale.set(0.7 * surfaceDetail, 0.7 * surfaceDetail);
    coverArt.roughness = m.poster.roughness;
    coverArt.needsUpdate = true;
    // Its `map` is the base poster texture, borrowed — the async swap owns it.
    register(coverArt, [coverArt.normalMap, coverArt.roughnessMap]);
  }

  const cover = new THREE.Mesh(
    track(new THREE.BoxGeometry(W, H, shell)),
    [shellFor(W, H), shellFor(W, H), shellFor(W, H), shellFor(W, H), coverArt, m.coverInner],
  );
  // Offset back to the case centre, since the pivot sits on the left edge.
  cover.position.set(W / 2, 0, 0);
  pivot.add(cover);
  stage.world.add(pivot);
  stage.coverPivot = pivot;
  stage.coverMaterial = coverArt;
  objects.push(pivot);

  stage.disposeCase = () => {
    for (const geometry of geometries) geometry.dispose();
    for (const object of objects) object.removeFromParent();
    for (const { material, owned } of extra) {
      // Only the textures this build actually minted — see `extra`.
      for (const texture of owned) texture.dispose();
      material.dispose();
      stage.base.delete(material);
    }
    extra.length = 0;
    stage.coverPivot = null;
    stage.coverMaterial = null;
  };
}

function disposeCaseOf(stage: Stage) {
  stage.disposeCase();
  stage.disposeCase = () => {};
}

/* ---------------------------------------------------------------------------
   Textures
   --------------------------------------------------------------------------- */

function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#40382c");
  sky.addColorStop(0.42, "#16161a");
  sky.addColorStop(0.68, "#0a0a0c");
  sky.addColorStop(1, "#000000");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 64, 256);
  // A softbox. This one bright band is what makes the plastic read as plastic.
  ctx.fillStyle = "rgba(255,247,229,0.95)";
  ctx.fillRect(5, 34, 17, 66);
  ctx.fillStyle = "rgba(190,214,255,0.5)";
  ctx.fillRect(44, 60, 10, 90);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return env;
}

const POSTER_W = 512;
const POSTER_H = 720;

/** Stand-in cover art, used until — or instead of — the cached poster decoding. */
function drawPoster(movie: Movie) {
  const canvas = sized(POSTER_W, POSTER_H);
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, POSTER_W, POSTER_H);
  gradient.addColorStop(0, movie.spine);
  gradient.addColorStop(0.52, shade(movie.spine, -0.42));
  gradient.addColorStop(1, "#08080a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  ctx.fillStyle = caseBand(movie);
  ctx.fillRect(0, 0, POSTER_W, 12);

  ctx.fillStyle = movie.ink;
  ctx.font = `500 34px ${movie.face === "serif" ? "Georgia, serif" : "Helvetica, Arial, sans-serif"}`;
  ctx.textAlign = "left";
  let y = POSTER_H - 190;
  for (const line of wrap(ctx, movie.title, POSTER_W - 96, 3)) {
    ctx.fillText(line, 48, y);
    y += 42;
  }
  ctx.font = "500 15px monospace";
  ctx.globalAlpha = 0.72;
  ctx.fillText(movie.director.toUpperCase(), 48, y + 20);
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * The printed spine: colour field, band rules, vertical title.
 *
 * Drawn at a fixed 1:8 aspect rather than the exact face aspect. The spine box
 * face is close to that for most cases, and the alternative — regenerating this
 * canvas on every frame of a thickness drag — is not worth the pixel accuracy.
 */
function drawSpine(movie: Movie) {
  const W = 128;
  const H = 1024;
  const canvas = sized(W, H);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = movie.spine;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = caseBand(movie);
  ctx.fillRect(0, 10, W, 7);
  ctx.fillRect(0, H - 17, W, 7);

  ctx.save();
  ctx.translate(W / 2 + 8, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = movie.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const serif = movie.face === "serif";
  ctx.font = `${serif ? 400 : 500} 44px ${serif ? "Georgia, serif" : "Helvetica, Arial, sans-serif"}`;
  const text = movie.caps ? movie.title.toUpperCase() : movie.title;
  ctx.fillText(fit(ctx, text, H - 220), 0, 0);
  ctx.restore();
  return canvas;
}

/** Iridescent disc face: silver base with banded colour, like a pressed DVD. */
function drawDisc() {
  const S = 512;
  const canvas = sized(S, S);
  const ctx = canvas.getContext("2d")!;
  const R = S / 2;

  const silver = ctx.createRadialGradient(R, R, R * 0.05, R, R, R);
  silver.addColorStop(0, "#c9ccd4");
  silver.addColorStop(0.62, "#9ba1ac");
  silver.addColorStop(1, "#d3d7de");
  ctx.fillStyle = silver;
  ctx.beginPath();
  ctx.arc(R, R, R, 0, Math.PI * 2);
  ctx.fill();

  // Fake the rainbow by sweeping hue around the disc in thin wedges.
  const wedges = 180;
  for (let i = 0; i < wedges; i++) {
    const start = (i / wedges) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(R, R);
    ctx.arc(R, R, R, start, start + (Math.PI * 2) / wedges + 0.01);
    ctx.closePath();
    ctx.fillStyle = `hsla(${(i * 7) % 360}, 85%, 68%, 0.16)`;
    ctx.fill();
  }

  // The data rings. A pressed disc reads as concentric bands, not a flat sheen.
  ctx.globalAlpha = 0.09;
  for (let r = R * 0.2; r < R; r += 2.5) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(R, R, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // The hub hole, punched out, plus its clamping ring.
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(R, R, R * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(R, R, R * 0.17, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */

function sized(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

/** Truncate to fit, so a long title doesn't run off the spine. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}…`;
}

/** Lighten (amount > 0) or darken (amount < 0) a hex colour. */
function shade(hex: string, amount: number) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const mix = (channel: number) =>
    Math.round(
      amount < 0 ? channel * (1 + amount) : channel + (255 - channel) * amount,
    );
  return `rgb(${mix((num >> 16) & 255)}, ${mix((num >> 8) & 255)}, ${mix(num & 255)})`;
}

function disposeMaterials(stage: Stage) {
  if (!stage.materials) return;
  for (const material of Object.values(stage.materials)) {
    material.map?.dispose();
    material.dispose();
  }
  stage.materials = null;
  stage.base = new Map();
}

function disposeBaseTextures(stage: Stage) {
  if (!stage.textures) return;
  stage.textures.color.dispose();
  stage.textures.normal.dispose();
  stage.textures.roughness.dispose();
  stage.textures = null;
}
