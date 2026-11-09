#!/usr/bin/env python3
"""Generates the Raja Silat Rive sources (RML). Run: python3 rive/gen.py && npm run rive:build

hero/  the prisoner king: idle (breathing, headband flutter, swinging shackle), `kick` and `hit` triggers.
dice/  a d20 that tumbles in and lands (plays once on load; the game shows the number on top).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
INK = "FF3C3C3C"


class Ids:
    def __init__(self):
        self.n = 1

    def __call__(self):
        self.n += 1
        return f"0:{self.n}"


def fill(color):
    return f'<Fill name="Fill"><SolidColor colorValue="{color}" name="C"/></Fill>'


def stroke(color, w):
    return f'<Stroke thickness="{w}" cap="round" join="round" name="Stroke"><SolidColor colorValue="{color}" name="C"/></Stroke>'


def poly(points, name="Path"):
    vs = "".join(f'<StraightVertex x="{x:.2f}" y="{y:.2f}"/>' for x, y in points)
    return f'<PointsPath isClosed="true" isClockwise="true" name="{name}">{vs}</PointsPath>'


def line(points, name="Path"):
    vs = "".join(f'<StraightVertex x="{x:.2f}" y="{y:.2f}"/>' for x, y in points)
    return f'<PointsPath isClosed="false" name="{name}">{vs}</PointsPath>'


def key(obj, prop, frames, ease=True):
    """frames: [(frame, value)]. Eased (in-out) by default."""
    out = []
    for f, v in frames:
        if ease:
            out.append(f'<KeyFrameDouble value="{v}" frame="{f}" interpolationType="cubic"><CubicEaseInterpolator x1="0.42" y1="0" x2="0.58" y2="1"/></KeyFrameDouble>')
        else:
            out.append(f'<KeyFrameDouble value="{v}" frame="{f}" interpolationType="linear"/>')
    return f'<KeyedObject objectId="{obj}"><KeyedProperty property="{prop}">{"".join(out)}</KeyedProperty></KeyedObject>'


def write(project, rml):
    d = os.path.join(HERE, project)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "scene.rml"), "w") as f:
        f.write(f'<Rive version="1" kind="fragment">\n{rml}\n</Rive>\n')
    with open(os.path.join(d, "rive.yaml"), "w") as f:
        f.write(f"name: {project}\n")


# ---------------------------------------------------------------- hero
def hero():
    i = Ids()
    S = 3  # the SVG piece is drawn on a 40-unit grid; the artboard is 120
    PX, PY = 60, 105  # pivot: the middle of the base, so leans and bobs look grounded

    def p(x, y):  # SVG units -> coordinates relative to the pivot
        return (x * S - PX, y * S - PY)

    art, sm, layer, ss = i(), i(), i(), i()
    body, tail, chain, flash = i(), i(), i(), i()
    a_idle, a_kick, a_hit = i(), i(), i()
    t_kick, t_hit = i(), i()
    s_idle, s_kick, s_hit = i(), i(), i()

    # Shapes, first declared paints on top.
    shapes = [
        # The red hit flash sits on top of everything.
        f'<Shape x="0" y="{-45}" opacity="0" name="Flash" id="{flash}"><Ellipse width="104" height="104" name="Path"/>{fill("FFFF4B4B")}</Shape>',
        # The headband tail flutters about the knot.
        f'<Shape x="{84 - PX}" y="{51 - PY}" name="Tail" id="{tail}">{poly([(0, 0), (18, -10.5), (14.4, 3.3), (26.4, 7.5), (1.2, 11.4)])}{fill("FFE5383B")}{stroke("FF8E1B1D", 3.6)}</Shape>',
        f'<Shape name="Band">{poly([p(11.3, 16.2), p(28.7, 16.2), p(28.7, 19.8), p(11.3, 19.8)])}{fill("FFE5383B")}{stroke("FF8E1B1D", 3.9)}</Shape>',
        f'<Shape name="Stripes">{line([p(12.3, 24.6), p(27.7, 24.6)], "A")}{line([p(12.9, 27.8), p(27.1, 27.8)], "B")}{stroke("8C3C3C3C", 4.8)}</Shape>',
        f'<Shape name="Belt">{line([p(12.5, 21), p(27.5, 21)])}{stroke(INK, 7.2)}</Shape>',
        f'<Shape name="Cross">{poly([p(18.5, 2.5), p(21.5, 2.5), p(21.5, 5.5), p(24.5, 5.5), p(24.5, 8.5), p(21.5, 8.5), p(21.5, 12.5), p(18.5, 12.5), p(18.5, 8.5), p(15.5, 8.5), p(15.5, 5.5), p(18.5, 5.5)])}{fill("FFFFFFFF")}{stroke(INK, 6)}</Shape>',
        f'<Shape name="Torso">{poly([p(13, 13.5), p(27, 13.5), p(29.7, 17.8), p(27, 31), p(13, 31), p(10.3, 17.8)])}{fill("FFFFFFFF")}{stroke(INK, 6)}</Shape>',
        f'<Shape name="Base">{poly([p(9, 30.5), p(31, 30.5), p(33, 33), p(33, 35), p(31, 37), p(9, 37), p(7, 35), p(7, 33)])}{fill("FFD7D7D7")}{stroke(INK, 6)}</Shape>',
    ]
    # The broken shackle swings from the base, outside the body group.
    shackle = (
        f'<Node x="{p(9, 33)[0] + PX}" y="{p(9, 33)[1] + PY}" name="Shackle" id="{chain}">'
        f'<Shape x="-5.4" y="7.2" name="Ring"><Ellipse width="13.8" height="13.8" name="Path"/>{stroke("FF8C8C8C", 4.5)}</Shape>'
        f'<Shape name="Link">{line([(-9, 13), (-13.5, 17.5)], "A")}{line([(-13, 12), (-18, 13)], "B")}{stroke("FF8C8C8C", 4.2)}</Shape>'
        f'</Node>'
    )

    idle = (
        f'<LinearAnimation loopValue="loop" duration="120" name="idle" id="{a_idle}">'
        + key(body, "scaleY", [(0, 1), (60, 1.035), (120, 1)])
        + key(body, "scaleX", [(0, 1), (60, 0.985), (120, 1)])
        + key(tail, "rotation", [(0, -0.12), (30, 0.22), (60, -0.05), (90, 0.25), (120, -0.12)])
        + key(chain, "rotation", [(0, -0.12), (60, 0.12), (120, -0.12)])
        + "</LinearAnimation>"
    )
    kick = (
        f'<LinearAnimation loopValue="oneShot" duration="27" name="kick" id="{a_kick}">'
        + key(body, "rotation", [(0, 0), (6, -0.22), (12, 0.16), (27, 0)])
        + key(body, "scaleY", [(0, 1), (6, 0.9), (12, 1.08), (27, 1)])
        + key(tail, "rotation", [(0, 0), (8, 0.5), (27, 0)])
        + "</LinearAnimation>"
    )
    hit = (
        f'<LinearAnimation loopValue="oneShot" duration="30" name="hit" id="{a_hit}">'
        + key(body, "x", [(0, PX), (4, PX - 7), (9, PX + 6), (14, PX - 3), (22, PX)])
        + key(body, "rotation", [(0, 0), (4, -0.12), (9, 0.08), (22, 0)])
        + key(flash, "opacity", [(0, 0), (3, 0.45), (30, 0)])
        + "</LinearAnimation>"
    )
    back = 'enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"'
    machine = f'''<StateMachine name="Hero" id="{sm}">
  <StateMachineTrigger name="kick" id="{t_kick}"/>
  <StateMachineTrigger name="hit" id="{t_hit}"/>
  <StateMachineLayer name="Moves" id="{layer}">
    <AnyState x="0" y="-150">
      <StateTransition stateToId="{s_kick}"><TransitionTriggerCondition inputId="{t_kick}"/></StateTransition>
      <StateTransition stateToId="{s_hit}"><TransitionTriggerCondition inputId="{t_hit}"/></StateTransition>
    </AnyState>
    <ExitState x="400" y="-150"/>
    <EntryState x="0" y="0"><StateTransition stateToId="{s_idle}"/></EntryState>
    <AnimationState x="200" y="0" animationId="{a_idle}" id="{s_idle}"/>
    <AnimationState x="200" y="150" animationId="{a_kick}" id="{s_kick}"><StateTransition stateToId="{s_idle}" {back}/></AnimationState>
    <AnimationState x="400" y="150" animationId="{a_hit}" id="{s_hit}"><StateTransition stateToId="{s_idle}" {back}/></AnimationState>
  </StateMachineLayer>
</StateMachine>'''
    rml = f'''<Artboard defaultStateMachineId="{sm}" styleId="{ss}" width="120" height="120" name="Hero" id="{art}">
<LayoutComponentStyle name="Artboard Style" id="{ss}"/>
<Node x="{PX}" y="{PY}" name="Body" id="{body}">
{chr(10).join(shapes)}
</Node>
{shackle}
{machine}
{idle}
{kick}
{hit}
</Artboard>'''
    write("hero", rml)


# ---------------------------------------------------------------- dice
def dice():
    i = Ids()
    art, sm, layer, ss, die, shadow, a_roll, s_roll = i(), i(), i(), i(), i(), i(), i(), i()
    import math
    R = 34
    hexagon = [(R * math.cos(math.radians(90 + 60 * k)), -R * math.sin(math.radians(90 + 60 * k))) for k in range(6)]
    # The visible faces of an icosahedron, flattened: a centre triangle and spokes to the rim.
    tri = [(0, -20), (17.3, 10), (-17.3, 10)]
    face_lines = "".join(line([a, b], f"E{n}") for n, (a, b) in enumerate([
        (tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0]),
        (tri[0], hexagon[0]), (tri[0], hexagon[1]), (tri[0], hexagon[5]),
        (tri[1], hexagon[4]), (tri[1], hexagon[5]), (tri[1], hexagon[3]),
        (tri[2], hexagon[2]), (tri[2], hexagon[3]), (tri[2], hexagon[1]),
    ]))
    shapes = f'''<Node x="60" y="56" name="Die" id="{die}">
  <Shape name="Edges">{face_lines}{stroke("FF8A6400", 2.2)}</Shape>
  <Shape name="Centre">{poly(tri)}{fill("FFFFF4CC")}</Shape>
  <Shape name="Body">{poly(hexagon)}{fill("FFFFC800")}{stroke(INK, 4)}</Shape>
</Node>
<Shape x="60" y="104" name="Shadow" id="{shadow}"><Ellipse width="56" height="10" name="Path"/>{fill("33000000")}</Shape>'''
    roll = (
        f'<LinearAnimation loopValue="oneShot" duration="42" name="roll" id="{a_roll}">'
        + key(die, "rotation", [(0, -9.42), (34, 0.25), (42, 0)])
        + key(die, "y", [(0, -10), (12, 50), (20, 30), (27, 56), (33, 50), (42, 56)])
        + key(die, "scaleX", [(0, 0.5), (12, 1.1), (27, 1), (42, 1)])
        + key(die, "scaleY", [(0, 0.5), (12, 0.88), (20, 1.08), (27, 0.94), (42, 1)])
        + key(shadow, "opacity", [(0, 0), (12, 1), (20, 0.5), (27, 1), (42, 1)])
        + "</LinearAnimation>"
    )
    rml = f'''<Artboard defaultStateMachineId="{sm}" styleId="{ss}" width="120" height="120" name="Dice" id="{art}">
<LayoutComponentStyle name="Artboard Style" id="{ss}"/>
{shapes}
<StateMachine name="Dice" id="{sm}">
  <StateMachineLayer name="Roll" id="{layer}">
    <AnyState x="0" y="-150"/>
    <ExitState x="400" y="-150"/>
    <EntryState x="0" y="0"><StateTransition stateToId="{s_roll}"/></EntryState>
    <AnimationState x="200" y="0" animationId="{a_roll}" id="{s_roll}"/>
  </StateMachineLayer>
</StateMachine>
{roll}
</Artboard>'''
    write("dice", rml)


hero()
dice()
print("wrote rive/hero and rive/dice")
