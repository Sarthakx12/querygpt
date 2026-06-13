/**
 * Ambient hero background — fine white elevation-contour lines on matte
 * black. Nested irregular rings around two focal points, generated
 * deterministically at module scope (identical on server and client).
 */

type Focal = {
  cx: number;
  cy: number;
  /** [amplitude of 3-lobe wobble, amplitude of 5-lobe wobble, phase] */
  wobble: [number, number, number];
  /** ring radii, innermost → outermost */
  radii: number[];
  /** vertical squash so rings read as terrain, not circles */
  squash: number;
};

const FOCALS: Focal[] = [
  {
    cx: 470,
    cy: 390,
    wobble: [0.16, 0.07, 0.9],
    radii: [46, 84, 126, 172, 224, 282, 348],
    squash: 0.74,
  },
  {
    cx: 1010,
    cy: 540,
    wobble: [0.13, 0.09, 2.6],
    radii: [40, 76, 118, 168, 226, 294],
    squash: 0.68,
  },
];

const SAMPLES = 18;

/** Sample an organic ring, then smooth it with Catmull-Rom → cubic béziers. */
function contourPath(f: Focal, radius: number, ring: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2;
    const [a3, a5, phase] = f.wobble;
    // each ring drifts in phase so contours nest irregularly, like terrain
    const r =
      radius *
      (1 +
        a3 * Math.sin(3 * t + phase + ring * 0.45) +
        a5 * Math.sin(5 * t + phase * 1.7 - ring * 0.3));
    pts.push([
      f.cx + r * Math.cos(t),
      f.cy + r * f.squash * Math.sin(t),
    ]);
  }

  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + " Z";
}

type Contour = { d: string; opacity: number };

const CONTOURS: Contour[] = FOCALS.flatMap((f) => {
  const count = f.radii.length;
  return f.radii.map((radius, i) => ({
    d: contourPath(f, radius, i),
    // innermost 0.16 → outermost 0.04
    opacity: 0.16 - (0.12 * i) / (count - 1),
  }));
});

export default function TopoBackground() {
  return (
    <div
      aria-hidden="true"
      className="topo-mask pointer-events-none absolute inset-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="topo-drift h-full w-full"
      >
        {CONTOURS.map((c, i) => (
          <path
            key={i}
            d={c.d}
            fill="none"
            stroke="#fff"
            strokeWidth={1}
            opacity={c.opacity}
          />
        ))}
      </svg>
    </div>
  );
}
