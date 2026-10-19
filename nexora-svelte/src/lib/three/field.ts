/* The curriculum as a field: eighty phases in space.
 *
 * The courses section already has two flat readings of the same data, a plate
 * of lights and a ledger of names, and both of them answer "what ships". This
 * module draws the third reading, a spatial field, and it draws it under three
 * constraints the rest of the build sets for itself.
 *
 * First, the library is never in the first payload. `three` is imported inside
 * the function that needs it, so a reader who never scrolls to the field never
 * downloads a renderer, and a reader who does downloads it once, in its own
 * chunk, while they are looking at the canvas. The page ships the field's
 * words and nothing else.
 *
 * Second, nothing here is decoration. There are no shadows, no textures, no
 * environment map, no bloom and no post-processing: flat points and flat
 * lines, in the two colours the token table already names. The green ink is a
 * phase that is open on the free tier, the amber lamp is a phase that opens
 * with Pro, and the rule colour is the structure that holds the field
 * together. The palette is read from the document at runtime rather than
 * written here, because a second copy of a colour is a second place for the
 * palette to drift.
 *
 * Third, nothing here is the only copy. Every point in the field is a phase
 * that is named in the DOM beside the canvas, and every phase in the field is
 * also listed in the ledger further down the page. The canvas is a reading of
 * the curriculum, never a replacement for it, and the reduced-motion path
 * draws the same points in two dimensions so that a reader who asked for less
 * motion still gets the field rather than an empty frame.
 *
 * The positions are computed rather than sampled: a fixed seed and a fixed
 * curve per course, so the same eighty phases land in the same places on
 * every machine and in every build. A field that rearranged itself between
 * two visits would be a picture, and a picture is not a manifest. */

import { COURSES } from "$lib/content/site";

/** Which tier a phase opens on. The two words the copy already uses. */
export type PhaseTier = "free" | "pro";

/**
 * One phase, as the field reports it.
 *
 * The shape is the one the page can act on: enough to name the phase, enough
 * to open its course in the ledger, and the tier as a word rather than a hue.
 */
export interface PhasePick {
  courseSlug: string;
  courseTitle: string;
  index: number;
  title: string;
  tier: PhaseTier;
}

/** What the caller wants to hear about. */
export interface FieldOptions {
  /** The phase the pointer is nearest to, or null when it is over nothing. */
  onpick?: (pick: PhasePick | null) => void;
  /** The phase that was clicked. */
  onselect?: (pick: PhasePick) => void;
}

/** The shape the field needs from a course, so it can be tested without the content module. */
export interface CourseLike {
  slug: string;
  title: string;
  phases: readonly (readonly [string, string, PhaseTier])[];
}

/** A phase with its place in the field. */
export interface FieldNode extends PhasePick {
  x: number;
  y: number;
  z: number;
}

/** Everything the field is drawn from. */
export interface FieldLayout {
  nodes: FieldNode[];
  /** The line that holds the three roots together, as a run of points. */
  spine: number[][];
  /** One run of points per course: the arm that course's phases travel along. */
  arms: number[][][];
}

type Vec3 = [number, number, number];

/**
 * The seed.
 *
 * "NEXO" in hex. It is fixed on purpose: the field is a reading of a
 * manifest, and a manifest does not reshuffle itself between two loads.
 */
const SEED = 0x4e45584f;

/** A small seeded generator, so the jitter is the same on every machine. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The three arms.
 *
 * One curve per course, each leaving its own root on the spine, so the field
 * reads as one thing with three branches rather than as three things standing
 * next to each other. Every arm leaves its root in a different direction, so
 * the field has a shape from any angle the camera reaches, and no two arms
 * ever sit on top of one another.
 *
 * The numbers are the shape, not ornament: the long arm is the long course
 * and the short arm is the short one, so the point spacing is the same on
 * every arm and the field is read at one scale rather than three.
 */
const ARMS: readonly { tx: number; ty: number; tz: number }[] = [
  { tx: -4.2, ty: 2.6, tz: 3.0 },
  { tx: 2.6, ty: 3.4, tz: -3.4 },
  { tx: 4.2, ty: 2.4, tz: 2.6 },
];

/** Where the roots sit along the spine. */
const ROOT_SPACING = 5;

/** The field of view, in degrees. The camera is placed from the field's own
 * bounds, so this is the only thing that decides how much of the sheet the
 * field takes up. */
const FIELD_FOV = 45;

/** A cubic segment, evaluated. */
function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  ];
}

/** One point of a Catmull-Rom run, the curve that passes through the roots. */
function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    0.5 *
      (2 * p1[2] +
        (-p0[2] + p2[2]) * t +
        (2 * p0[2] - 5 * p1[2] + 4 * p2[2] - p3[2]) * t2 +
        (-p0[2] + 3 * p1[2] - 3 * p2[2] + p3[2]) * t3),
  ];
}

/** The spine, sampled through the three roots. */
function buildSpine(roots: Vec3[], samples: number): Vec3[] {
  if (roots.length < 2) return roots.slice();
  const padded: Vec3[] = [roots[0]!, ...roots, roots[roots.length - 1]!];
  const segments = padded.length - 3;
  const out: Vec3[] = [];
  for (let s = 0; s < segments; s++) {
    const steps = Math.max(2, Math.round(samples / segments));
    for (let i = 0; i < steps; i++) {
      out.push(catmullRom(padded[s]!, padded[s + 1]!, padded[s + 2]!, padded[s + 3]!, i / steps));
    }
  }
  out.push(roots[roots.length - 1]!);
  return out;
}

/**
 * The layout.
 *
 * Every phase gets a place on its course's arm, in the order the course
 * teaches it, with a small deterministic wobble so a long arm does not read
 * as a ruler. The wobble is seeded, so the wobble is always the same wobble.
 */
export function buildLayout(courses: readonly CourseLike[] = COURSES): FieldLayout {
  const random = mulberry32(SEED);
  const nodes: FieldNode[] = [];
  const arms: number[][][] = [];
  const roots: Vec3[] = [];

  courses.forEach((course, index) => {
    const shape = ARMS[index % ARMS.length]!;
    const count = course.phases.length;
    const arm: number[][] = [];

    /* The root is on the spine, and the spine runs straight through the
     * three of them: a rule the field hangs from. */
    const root: Vec3 = [
      (index - (courses.length - 1) / 2) * ROOT_SPACING,
      0,
      0,
    ];
    roots.push(root);

    /* The arm is scaled by the number of phases it carries, so the points are
     * the same distance apart on every arm and the field is read at one
     * scale. The shape is the same shape; only its reach changes. */
    const reach = 0.32 + 0.68 * Math.min(1, count / 54);
    const tip: Vec3 = [
      root[0] + shape.tx * reach,
      shape.ty * reach,
      shape.tz * reach,
    ];
    const p1: Vec3 = [
      root[0] + shape.tx * 0.3 * reach,
      shape.ty * 0.42 * reach,
      shape.tz * 0.3 * reach,
    ];
    const p2: Vec3 = [
      root[0] + shape.tx * 0.74 * reach,
      shape.ty * 0.82 * reach,
      shape.tz * 0.74 * reach,
    ];
    const p3 = tip;

    course.phases.forEach((phase, phaseIndex) => {
      const t = count > 1 ? phaseIndex / (count - 1) : 0.5;
      const point = bezier(root, p1, p2, p3, t);

      // The wobble: perpendicular to the arm, and small enough that the arm
      // still reads as an arm.
      const ahead = bezier(root, p1, p2, p3, Math.min(1, t + 0.01));
      const behind = bezier(root, p1, p2, p3, Math.max(0, t - 0.01));
      const tangent: Vec3 = [ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]];
      const length = Math.hypot(tangent[0], tangent[1], tangent[2]) || 1;
      const unit: Vec3 = [tangent[0] / length, tangent[1] / length, tangent[2] / length];
      const side: Vec3 = [unit[2], 0, -unit[0]];
      const sideLength = Math.hypot(side[0], side[1], side[2]) || 1;
      const perpendicular: Vec3 = [side[0] / sideLength, side[1] / sideLength, side[2] / sideLength];
      const lift: Vec3 = [
        perpendicular[1] * unit[2] - perpendicular[2] * unit[1],
        perpendicular[2] * unit[0] - perpendicular[0] * unit[2],
        perpendicular[0] * unit[1] - perpendicular[1] * unit[0],
      ];
      const amount = (random() - 0.5) * 0.22;
      const rise = (random() - 0.5) * 0.16;

      const x = point[0] + perpendicular[0] * amount + lift[0] * rise;
      const y = point[1] + perpendicular[1] * amount + lift[1] * rise;
      const z = point[2] + perpendicular[2] * amount + lift[2] * rise;

      arm.push([x, y, z]);
      nodes.push({
        courseSlug: course.slug,
        courseTitle: course.title,
        index: phaseIndex,
        title: phase[1],
        tier: phase[2],
        x,
        y,
        z,
      });
    });

    arms.push(arm);
  });

  return { nodes, spine: buildSpine(roots, 48), arms };
}

/* --------------------------------------------------------------------------
 * The renderer.
 *
 * `three` ships no type declarations of its own, and adding a second copy of
 * the library to the tree to get them is a worse trade than declaring the
 * small surface this module touches. The import is asserted against that
 * surface, and the surface is the one this file actually uses.
 * ------------------------------------------------------------------------ */

interface VectorLike {
  x: number;
  y: number;
  z: number;
  set(x: number, y: number, z: number): VectorLike;
  project(camera: CameraLike): VectorLike;
}

interface CameraLike {
  position: VectorLike;
  aspect: number;
  near: number;
  far: number;
  lookAt(x: number, y: number, z: number): void;
  updateProjectionMatrix(): void;
  updateMatrixWorld(): void;
}

interface ObjectLike {
  position: VectorLike;
  rotation: { x: number; y: number; z: number };
  visible: boolean;
}

interface AttributeLike {
  array: Float32Array;
  needsUpdate: boolean;
}

interface GeometryLike {
  setAttribute(name: string, attribute: AttributeLike): void;
  dispose(): void;
}

interface ColorLike {
  set(value: string): ColorLike;
}

interface MaterialLike {
  color: ColorLike;
  opacity: number;
  transparent: boolean;
  size: number;
  dispose(): void;
}

interface SceneLike {
  add(...objects: ObjectLike[]): void;
}

interface RendererLike {
  domElement: HTMLCanvasElement;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setClearAlpha(alpha: number): void;
  render(scene: SceneLike, camera: CameraLike): void;
  dispose(): void;
}

interface ThreeSurface {
  Scene: new () => SceneLike;
  PerspectiveCamera: new (
    fov: number,
    aspect: number,
    near: number,
    far: number
  ) => CameraLike;
  WebGLRenderer: new (parameters: {
    canvas: HTMLCanvasElement;
    antialias?: boolean;
    alpha?: boolean;
  }) => RendererLike;
  BufferGeometry: new () => GeometryLike;
  Float32BufferAttribute: new (array: Float32Array | number[], itemSize: number) => AttributeLike;
  Points: new (geometry: GeometryLike, material: MaterialLike) => ObjectLike;
  Line: new (geometry: GeometryLike, material: MaterialLike) => ObjectLike;
  LineLoop: new (geometry: GeometryLike, material: MaterialLike) => ObjectLike;
  PointsMaterial: new (parameters: {
    color?: string;
    size?: number;
    sizeAttenuation?: boolean;
    transparent?: boolean;
    opacity?: number;
  }) => MaterialLike;
  LineBasicMaterial: new (parameters: {
    color?: string;
    transparent?: boolean;
    opacity?: number;
  }) => MaterialLike;
  Vector3: new (x?: number, y?: number, z?: number) => VectorLike;
}

/**
 * A colour from the document.
 *
 * The tokens are read at runtime so the palette lives in one place, the
 * stylesheet. If a token is somehow missing, the page's own ink is used
 * rather than a second hardcoded value.
 */
function readToken(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (value) return value;
  return getComputedStyle(document.body).color;
}

/**
 * How near the pointer has to be, in CSS pixels, to be on a point.
 *
 * The field picks the nearest point within this distance and says nothing
 * about points further away, because a phase the pointer is nowhere near is
 * not the phase the reader is asking about. The reticle is drawn on the point
 * that was picked, so a reader can see which one the field heard.
 */
const PICK_RADIUS = 24;

/**
 * Whether this browser can draw the field at all.
 *
 * A throwaway canvas, asked for a context and then thrown away. The check is
 * cheap and the answer is definitive: a browser that cannot give us a context
 * will not give one to a canvas that matters.
 */
export function supportsWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!context) return false;
    const lose = (context as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Mount the field.
 *
 * The renderer is fetched here, at the moment the field is wanted, so the
 * library never rides along with the page. Everything the caller gets back is
 * a way to stop it: the animation, the observers and the GPU resources all go
 * away with one call.
 */
export async function mountPhaseField(
  canvas: HTMLCanvasElement,
  options: FieldOptions = {}
): Promise<{ destroy: () => void }> {
  // @ts-expect-error three ships no declarations; the surface is declared above.
  const THREE = (await import("three")) as unknown as ThreeSurface;

  const layout = buildLayout();

  let width = canvas.clientWidth || 640;
  let height = canvas.clientHeight || 360;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FIELD_FOV, 1, 0.1, 400);

  /* The camera is framed on the field rather than on a fixed point, so the
   * field fills the sheet whatever the curriculum is. The bounds are read off
   * the layout that was just built, and the distance is whatever it takes to
   * hold the whole field with a margin, so a fourth course would frame itself
   * rather than fall out of the picture. */
  const bounds = layout.nodes.reduce(
    (box, node) => ({
      minX: Math.min(box.minX, node.x),
      maxX: Math.max(box.maxX, node.x),
      minY: Math.min(box.minY, node.y),
      maxY: Math.max(box.maxY, node.y),
      minZ: Math.min(box.minZ, node.z),
      maxZ: Math.max(box.maxZ, node.z),
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
  const centre: Vec3 = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
  const radius =
    Math.max(
      (bounds.maxX - bounds.minX) / 2,
      (bounds.maxY - bounds.minY) / 2,
      (bounds.maxZ - bounds.minZ) / 2
    ) || 1;

  /* The camera is level with the middle of the field and far enough back to
   * hold it. The field is a wide, shallow spread rather than a ball, so it is
   * measured against the sheet's own proportions: the sheet is wide, the field
   * is wide, and a camera that framed the field as a sphere would sit much
   * too far away and leave the sheet mostly empty. */
  const halfVertical = (FIELD_FOV * Math.PI) / 360;

  /* The distance is recomputed when the sheet changes shape, so a phone in
   * portrait and a wide desktop both get a field that fills them. */
  const halfWidth = (bounds.maxX - bounds.minX) / 2;
  const halfHeight = (bounds.maxY - bounds.minY) / 2;
  let distance = halfWidth * 2;
  const place = (): void => {
    const aspect = Math.max(0.4, width / Math.max(1, height));
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
    distance =
      Math.max(
        halfWidth / Math.tan(halfHorizontal),
        halfHeight / Math.tan(halfVertical)
      ) * 1.2;
  };
  place();

  camera.position.set(
    centre[0],
    centre[1] + distance * 0.22,
    centre[2] + distance
  );
  camera.lookAt(centre[0], centre[1], centre[2]);

  const freeColour = readToken("--color-added");
  const proColour = readToken("--color-accent");
  const ruleColour = readToken("--color-rule-strong");
  const inkColour = readToken("--color-ink");

  const geometries: GeometryLike[] = [];
  const materials: MaterialLike[] = [];

  const makePoints = (group: FieldNode[]): void => {
    if (group.length === 0) return;
    const positions = new Float32Array(group.length * 3);
    group.forEach((node, i) => {
      positions[i * 3] = node.x;
      positions[i * 3 + 1] = node.y;
      positions[i * 3 + 2] = node.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: group[0]!.tier === "free" ? freeColour : proColour,
      size: 6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.95,
    });
    geometries.push(geometry);
    materials.push(material);
    scene.add(new THREE.Points(geometry, material));
  };

  const makeLine = (points: number[][], opacity: number): void => {
    if (points.length < 2) return;
    const positions = new Float32Array(points.length * 3);
    points.forEach((point, i) => {
      positions[i * 3] = point[0] ?? 0;
      positions[i * 3 + 1] = point[1] ?? 0;
      positions[i * 3 + 2] = point[2] ?? 0;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: ruleColour,
      transparent: true,
      opacity,
    });
    geometries.push(geometry);
    materials.push(material);
    scene.add(new THREE.Line(geometry, material));
  };

  makePoints(layout.nodes.filter((node) => node.tier === "free"));
  makePoints(layout.nodes.filter((node) => node.tier === "pro"));
  makeLine(layout.spine, 1);
  for (const arm of layout.arms) makeLine(arm, 0.8);

  /* The reticle: a small square of ink around the point the pointer is on.
   * A pointer that has been heard is a pointer that has been seen. */
  const reticlePositions = new Float32Array(12);
  const reticleGeometry = new THREE.BufferGeometry();
  reticleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(reticlePositions, 3));
  const reticleMaterial = new THREE.LineBasicMaterial({
    color: inkColour,
    transparent: true,
    opacity: 0.9,
  });
  geometries.push(reticleGeometry);
  materials.push(reticleMaterial);
  const reticle = new THREE.LineLoop(reticleGeometry, reticleMaterial);
  reticle.visible = false;
  scene.add(reticle);

  const drawReticle = (node: FieldNode | null): void => {
    if (!node) {
      reticle.visible = false;
      return;
    }
    const r = 0.34;
    const corners: Vec3[] = [
      [node.x - r, node.y - r, node.z],
      [node.x + r, node.y - r, node.z],
      [node.x + r, node.y + r, node.z],
      [node.x - r, node.y + r, node.z],
    ];
    corners.forEach((corner, i) => {
      reticlePositions[i * 3] = corner[0];
      reticlePositions[i * 3 + 1] = corner[1];
      reticlePositions[i * 3 + 2] = corner[2];
    });
    reticleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(reticlePositions, 3));
    reticle.visible = true;
  };

  const resize = (): void => {
    width = canvas.clientWidth || width;
    height = canvas.clientHeight || height;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    place();
  };
  resize();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  // The picking.
  const vector = new THREE.Vector3();
  let picked: FieldNode | null = null;

  /** The nearest point to the pointer, and how far away it is. */
  const nearest = (clientX: number, clientY: number): { node: FieldNode | null; distance: number } => {
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best: FieldNode | null = null;
    let bestDistance = Infinity;
    for (const node of layout.nodes) {
      vector.set(node.x, node.y, node.z);
      vector.project(camera);
      const sx = (vector.x * 0.5 + 0.5) * rect.width;
      const sy = (-vector.y * 0.5 + 0.5) * rect.height;
      const distance = Math.hypot(sx - px, sy - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    return { node: best, distance: bestDistance };
  };

  const report = (node: FieldNode | null): void => {
    if (node === picked) return;
    picked = node;
    drawReticle(node);
    options.onpick?.(node ? { ...node } : null);
  };

  const onPointerMove = (event: PointerEvent): void => {
    const { node, distance } = nearest(event.clientX, event.clientY);
    // The nearest point within the threshold is the one the field has heard.
    // Past the threshold the pointer is over the field but on nothing, and the
    // field says nothing rather than naming a phase the pointer is nowhere
    // near.
    report(node !== null && distance <= PICK_RADIUS ? node : null);
  };

  const onPointerLeave = (): void => {
    report(null);
  };

  const onClick = (event: PointerEvent): void => {
    const { node, distance } = nearest(event.clientX, event.clientY);
    if (node !== null && distance <= PICK_RADIUS) options.onselect?.({ ...node });
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);

  // The rotation. Slow, continuous, and enough to read the shape of the field
  // from one glance and the order of a course from another.
  let angle = 0.6;
  let frame = 0;
  let last = performance.now();
  let running = true;

  const tick = (now: number): void => {
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    angle += delta * 0.11;
    camera.position.set(
      centre[0] + Math.sin(angle) * distance,
      centre[1] + distance * 0.28,
      centre[2] + Math.cos(angle) * distance
    );
    camera.lookAt(centre[0], centre[1], centre[2]);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    if (running) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  // The field stops when it leaves the screen. A rotation nobody can see is
  // a rotation that costs somebody's battery.
  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && !running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(frame);
      }
    }
  });
  visibility.observe(canvas);

  return {
    destroy: (): void => {
      running = false;
      cancelAnimationFrame(frame);
      visibility.disconnect();
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
    },
  };
}

/* --------------------------------------------------------------------------
 * The flat reading.
 *
 * A reader who asked for less motion does not get an empty frame: they get
 * the same eighty points, projected, drawn once, in the same colours, with the
 * same names beside it. Nothing rotates and nothing is fetched.
 * ------------------------------------------------------------------------ */

/** A point turned into a place on a sheet. */
function flatProjector(points: Vec3[], width: number, height: number) {
  /* The sheet is a plan, not a perspective.
   *
   * The three courses leave their roots on one line and curve away from it, so
   * a view from above separates them completely: three arms, fanning out of
   * one spine, which is the shape the curriculum actually has. Seen from the
   * side, two of the three arms collapse into lines and the drawing reads as
   * dust on a sheet. The slight tilt left in the pitch keeps a little depth,
   * because the arms climb as they go. */
  const yaw = 0;
  const pitch = 1.36;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const turned = (point: Vec3): [number, number] => {
    const x1 = point[0] * cy - point[2] * sy;
    const z1 = point[0] * sy + point[2] * cy;
    const y2 = point[1] * cp - z1 * sp;
    const z2 = point[1] * sp + z1 * cp;
    const depth = 1 + z2 * 0.08;
    return [x1 / depth, y2 / depth];
  };

  const flat = points.map(turned);
  const xs = flat.map((p) => p[0]);
  const ys = flat.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 30;
  const scale = Math.min(
    (width - pad * 2) / Math.max(0.001, maxX - minX),
    (height - pad * 2) / Math.max(0.001, maxY - minY)
  );
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return (point: Vec3): [number, number] => {
    const [x, y] = turned(point);
    return [width / 2 + (x - midX) * scale, height / 2 - (y - midY) * scale];
  };
}

/**
 * Draw the field flat.
 *
 * The same layout, the same colours, one frame, no renderer. The pointer
 * still names a phase, because a reader who cannot have the motion should not
 * lose the names either.
 */
export function drawPhaseFieldFlat(
  canvas: HTMLCanvasElement,
  options: FieldOptions = {}
): { destroy: () => void } {
  const context = canvas.getContext("2d");
  if (!context) return { destroy: (): void => {} };

  const layout = buildLayout();
  const freeColour = readToken("--color-added");
  const proColour = readToken("--color-accent");
  const ruleColour = readToken("--color-rule-strong");
  const inkColour = readToken("--color-ink");

  const all: Vec3[] = [
    ...layout.nodes.map((node) => [node.x, node.y, node.z] as Vec3),
    ...layout.spine.map((point) => [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0] as Vec3),
  ];

  let width = canvas.clientWidth || 640;
  let height = canvas.clientHeight || 360;
  const ratio = Math.min(window.devicePixelRatio || 1, 1.75);

  let project = flatProjector(all, width, height);
  const screen: [number, number][] = layout.nodes.map((node) =>
    project([node.x, node.y, node.z])
  );

  let picked: FieldNode | null = null;

  const paint = (): void => {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const stroke = (points: number[][], colour: string, opacity: number): void => {
      if (points.length < 2) return;
      context.strokeStyle = colour;
      context.globalAlpha = opacity;
      context.lineWidth = 1;
      context.beginPath();
      points.forEach((point, i) => {
        const [x, y] = project([point[0] ?? 0, point[1] ?? 0, point[2] ?? 0]);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.globalAlpha = 1;
    };

    stroke(layout.spine, ruleColour, 0.9);
    for (const arm of layout.arms) stroke(arm, ruleColour, 0.5);

    for (let i = 0; i < layout.nodes.length; i++) {
      const node = layout.nodes[i]!;
      const [x, y] = screen[i]!;
      context.fillStyle = node.tier === "free" ? freeColour : proColour;
      context.fillRect(x - 3, y - 3, 6, 6);
    }

    if (picked) {
      const [x, y] = screen[layout.nodes.indexOf(picked)]!;
      context.strokeStyle = inkColour;
      context.lineWidth = 1;
      context.strokeRect(x - 8, y - 8, 16, 16);
    }
  };

  const resize = (): void => {
    width = canvas.clientWidth || width;
    height = canvas.clientHeight || height;
    project = flatProjector(all, width, height);
    for (let i = 0; i < layout.nodes.length; i++) {
      screen[i] = project([layout.nodes[i]!.x, layout.nodes[i]!.y, layout.nodes[i]!.z]);
    }
    paint();
  };
  resize();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const onPointerMove = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best: FieldNode | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < layout.nodes.length; i++) {
      const node = layout.nodes[i]!;
      const point = screen[i]!;
      const distance = Math.hypot(point[0] - px, point[1] - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    const on = best !== null && bestDistance <= PICK_RADIUS ? best : null;
    if (on !== picked) {
      picked = on;
      paint();
    }
    options.onpick?.(on === null ? null : { ...on });
  };

  const onPointerLeave = (): void => {
    if (picked === null) return;
    picked = null;
    paint();
    options.onpick?.(null);
  };

  const onClick = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best: FieldNode | null = null;
    let bestDistance = Infinity;
    for (let i = 0; i < layout.nodes.length; i++) {
      const node = layout.nodes[i]!;
      const point = screen[i]!;
      const distance = Math.hypot(point[0] - px, point[1] - py);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = node;
      }
    }
    if (best !== null && bestDistance <= PICK_RADIUS) options.onselect?.({ ...best });
  };

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("click", onClick);

  return {
    destroy: (): void => {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("click", onClick);
    },
  };
}
