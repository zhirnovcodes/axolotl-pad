"""Knob layout for apps/web/src/ui/assets/device.svg, computed from the body outline.

Top groups are a grid: two rows that are parallel offsets of the egg outline (EDGE and
EDGE + ROW in from it), crossed by three normals of the outline (Rev, Del, Fil pairs). Knobs sit
on the crossings. The right group is the exact mirror of the left. Values were searched to
maximise the smallest knob gap while every knob stays >= 4 px clear of the screen bezel.
LFO knobs sit in a row along the bottom contour, same distance from the edge.
Prints the <g id="knobs"> block and the smile arc; run: python layout_knobs.py
"""
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
BODY = [  # cubic segments of #bodyPath, left half: apex -> bottom centre (counter-clockwise side)
    ((130, 304), (78, 304), (35, 297), (17, 260)),
    ((17, 260), (1, 224), (1, 174), (13, 124)),
    ((13, 124), (28, 60), (66, 3), (130, 3)),
]
R = 9.0          # knob radius (18 px knob, same for every knob)
EDGE = 15.4      # outer row centre distance from the outline
ROW = 29.0       # distance between the two parallel rows
S_NORMALS = (38.0, 84.0, 120.0)  # arc length from the apex to the Rev, Del, Fil normals


def bez(seg, t):
    p0, p1, p2, p3 = seg
    u = 1 - t
    x = u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0]
    y = u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1]
    return x, y


# dense polyline of the left half, ordered from the apex downwards
pts = []
for seg in reversed(BODY):
    for i in range(400):
        pts.append(bez(seg, 1 - i / 400))
pts.append((130, 304))
arc = [0.0]
for a, b in zip(pts, pts[1:]):
    arc.append(arc[-1] + math.dist(a, b))


def at(s):
    """point + inward unit normal at arc length s from the apex (left half)."""
    for i in range(1, len(arc)):
        if arc[i] >= s:
            (x0, y0), (x1, y1) = pts[i - 1], pts[i]
            f = (s - arc[i - 1]) / (arc[i] - arc[i - 1])
            x, y = x0 + f * (x1 - x0), y0 + f * (y1 - y0)
            tx, ty = x1 - x0, y1 - y0
            n = math.hypot(tx, ty)
            # walking apex->bottom on the left side (y down), inward is (ty, -tx)
            return (x, y), (ty / n, -tx / n)
    raise ValueError(s)


def inward(s, d):
    (x, y), (nx, ny) = at(s)
    return x + nx * d, y + ny * d


params = {p['id']: p for p in json.loads((ROOT / 'params.json').read_text())['params']}
knobs = []
# left group: normals at S_NORMALS (Rev, Del, Fil going away from the apex);
# outer row = dry/wet, inner row = feedback / time / position
for sn, (out, inn) in zip(S_NORMALS, [('reverbDw', 'reverbFeedback'), ('delayDw', 'delayTime'), ('filterDw', 'filterPos')]):
    knobs.append((out, sn, EDGE))
    knobs.append((inn, sn, EDGE + ROW))

placed = []
for name, s, d in knobs:
    x, y = inward(s, d)
    placed.append((name + '1', x, y))
    placed.append((name + '2', 260 - x, y))      # exact mirror

MIX = (130.0, 90.0)  # as low as the smile groove allows above the screen bezel (top 109)
placed.append(('oscMix', *MIX))

# LFO knobs in a row along the bottom contour: time further out, amp next to it toward the centre
LFO_EDGE = 30.0  # LFO row distance from the outline (row parallel to the bottom contour)
LFO_AMP = 22.0   # arc length from the bottom centre to the amp knob
LFO_STEP = 28.0  # spacing along the contour between time and amp
tx, ty = inward(arc[-1] - LFO_AMP - LFO_STEP, LFO_EDGE)
ax, ay = inward(arc[-1] - LFO_AMP, LFO_EDGE)
placed += [('lfo1Time', tx, ty), ('lfo1Amp', ax, ay), ('lfo2Time', 260 - tx, ty), ('lfo2Amp', 260 - ax, ay)]

order = ['filterDw1', 'delayDw1', 'reverbDw1', 'filterPos1', 'delayTime1', 'reverbFeedback1',
         'filterDw2', 'delayDw2', 'reverbDw2', 'filterPos2', 'delayTime2', 'reverbFeedback2',
         'oscMix', 'lfo1Amp', 'lfo1Time', 'lfo2Amp', 'lfo2Time']
pos = {k: (x, y) for k, x, y in placed}
lines = ['  <!-- knobs (no captions). Pointer angle = -135 + 270 * value; 0 deg = up -->', '  <g id="knobs">']
for k in order:
    x, y = pos[k]
    a = -135 + 270 * params[k]['default']
    lines.append(f'    <g class="knob" data-param="{k}" transform="translate({x:.1f} {y:.1f})">'
                 f'<use href="#knobBody"/><g class="knob-pointer" transform="rotate({a:.1f})"><use href="#knobPointer"/></g></g>')
lines.append('  </g>')

# smile: circular arc centred on the mix knob, below it, plus the tick
r = R + 5
a0, a1 = math.radians(25), math.radians(155)
p0 = (MIX[0] + r * math.cos(a0), MIX[1] + r * math.sin(a0))
p1 = (MIX[0] + r * math.cos(a1), MIX[1] + r * math.sin(a1))
arc_d = f'M{p0[0]:.2f} {p0[1]:.2f} A{r} {r} 0 0 1 {p1[0]:.2f} {p1[1]:.2f} M{MIX[0]} {MIX[1] + r - 0.5} V{MIX[1] + r + 3}'
smile = ['  <!-- smile: a groove cut into the frame, circular arc centred on the osc-mix knob (lit from top-left) -->',
         '  <g fill="none" stroke-linecap="round">',
         f'    <path d="{arc_d}" stroke="#FFFFFF" stroke-width="1.8" opacity="0.9" transform="translate(0.5 0.8)"/>',
         f'    <path d="{arc_d}" stroke="#B88AA1" stroke-width="1.8"/>',
         f'    <path d="{arc_d}" stroke="#7E4A63" stroke-width="0.8" opacity="0.55" transform="translate(-0.2 -0.3)"/>',
         '  </g>']
print('\n'.join(smile + [''] + lines))
