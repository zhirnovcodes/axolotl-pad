"""Knob layout for apps/web/src/ui/assets/device.svg, computed from the body outline.

Top groups are a grid: two rows that are parallel offsets of the egg outline (EDGE and
EDGE + ROW in from it), crossed by three normals of the outline (Rev, Del, Fil pairs). Knobs sit
on the crossings. The right group is the exact mirror of the left. Values were searched to
maximise the smallest knob gap while every knob stays >= 4 px clear of the screen bezel.
OSC vol / pan / detune sit in columns beside the screen; the three LFO pairs along the bottom (Figma frame 5).
Prints the <g id="knobs"> block and the smile arc; run: python layout_knobs.py
"""
import json, math, pathlib, re

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

# Side columns (Figma frame "5"): OSC1 vol / pan / detune left of the screen, OSC2 the mirror on the right.
SIDE_X = 40.0
SIDE_Y = (150.0, 180.0, 210.0)
for name, y in zip(('Vol', 'Pan', 'Detune'), SIDE_Y):
    placed.append((f'osc1{name}', SIDE_X, y))
    placed.append((f'osc2{name}', 260 - SIDE_X, y))

# LFO pairs along the bottom (Figma frame "5"): LFO1 bottom-left, LFO2 centre, LFO3 the mirror of LFO1.
# Each pair is time + amp, LFO_STEP apart, turned to follow the contour; every pair reads time, amp left to right.
LFO_STEP = 24.4
PAIRS = {1: ((69.0, 278.0), 17.0), 2: ((130.0, 285.0), 0.0)}
for n, ((cx, cy), deg) in PAIRS.items():
    dx, dy = math.cos(math.radians(deg)) * LFO_STEP / 2, math.sin(math.radians(deg)) * LFO_STEP / 2
    placed += [(f'lfo{n}Time', cx - dx, cy - dy), (f'lfo{n}Amp', cx + dx, cy + dy)]
(tx, ty), (ax, ay) = [(x, y) for k, x, y in placed if k in ('lfo1Time', 'lfo1Amp')]
placed += [('lfo3Time', 260 - ax, ay), ('lfo3Amp', 260 - tx, ty)]  # mirrored places, same order: time left, amp right

# Colours: effect knobs pink, osc mix blue (the screen buttons' #B1D2DF), side and LFO knobs the frame's #EDD8E1.
def body(k):
    if k == 'oscMix':
        return 'Blue'
    if k.startswith('lfo') or re.fullmatch(r'osc\d(Vol|Pan|Detune)', k):
        return 'Frame'
    return ''

order = ['filterDw1', 'delayDw1', 'reverbDw1', 'filterPos1', 'delayTime1', 'reverbFeedback1',
         'filterDw2', 'delayDw2', 'reverbDw2', 'filterPos2', 'delayTime2', 'reverbFeedback2',
         'oscMix', 'osc1Vol', 'osc1Pan', 'osc1Detune', 'osc2Vol', 'osc2Pan', 'osc2Detune',
         'lfo1Amp', 'lfo1Time', 'lfo2Amp', 'lfo2Time', 'lfo3Amp', 'lfo3Time']
pos = {k: (x, y) for k, x, y in placed}
lines = ['  <!-- knobs. Pointer angle = -135 + 270 * value; 0 deg = up -->', '  <g id="knobs">']
for k in order:
    x, y = pos[k]
    p = params[k]
    a = -135 + 270 * (p['default'] - p['min']) / (p['max'] - p['min'])
    b = body(k)
    lines.append(f'    <g class="knob" data-param="{k}" transform="translate({x:.1f} {y:.1f})">'
                 f'<use href="#knobBody{b}"/><g class="knob-pointer" transform="rotate({a:.1f})"><use href="#knobPointer{b}"/></g></g>')
lines.append('  </g>')

# Captions: Orbitron Bold, sizes from the Figma frame, placed symmetrically (x centred, y = baseline).
CAPTIONS = [('FX', 130, 35, 12), ('MIX', 130, 76, 12), ('OSC1', SIDE_X, 126, 10), ('OSC2', 260 - SIDE_X, 126, 10),
            ('LFO', 130, 262, 10), ('1', 74, 267, 8), ('2', 130, 276, 8), ('3', 186, 267, 8)]
for text, y in zip(('V', 'P', 'DT'), SIDE_Y):
    CAPTIONS += [(text, 20, y + 3, 8), (text, 240, y + 3, 8)]
caps = ['  <!-- captions -->', '  <g class="captions" text-anchor="middle" aria-hidden="true">']
caps += [f'    <text x="{x:g}" y="{y:g}" font-size="{size}">{text}</text>' for text, x, y, size in CAPTIONS]
caps.append('  </g>')

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
print('\n'.join(smile + [''] + caps + [''] + lines))
