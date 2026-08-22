# Distilled screen-performance direction

Direct behavior that the camera and microphone can observe. Never ask H3 to render an internal emotion without its physical evidence.

## Performance hierarchy

Design in this order:

1. `given_state`: knowledge, relationship, recent event, physical condition and emotional carryover;
2. `objective`: what the character wants now;
3. `stakes`: what changes if the objective succeeds or fails;
4. `obstacle`: person, fact, environment, body or self-protection preventing it;
5. `tactic`: the playable action used on the other person or situation;
6. `stimulus`: the exact sight, sound, touch, line or realization that triggers change;
7. `appraisal`: the brief visible processing of what the stimulus means;
8. `impulse`: the first involuntary tendency;
9. `suppression_or_choice`: whether the character permits, redirects or conceals the impulse;
10. `action`: the chosen visible/vocal behavior;
11. `aftereffect`: breath, gaze, posture, silence or recovery remaining after the action;
12. `relationship_result`: the changed distance, power, trust, knowledge or availability for action.

Do not write all twelve items verbatim into the final prompt. Use them to choose the few observable cues that carry the beat.

## Performance beat and tactic shift

A performance beat changes when new information changes the objective, tactic, stakes, relationship or physical possibility. Mark the trigger precisely. Preserve a beat across a cut when none of those changes.

Use playable tactics such as reassure, test, evade, provoke, contain, invite, dismiss, protect, bargain, confess or conceal. Replace “acts sad” with a tactic and resistance pattern: “tries to reassure him while avoiding his eyes; the smile arrives late and fades when he looks away.”

## Observable acting channels

Select only channels visible at the chosen framing:

- eyes: target, focus, hold, break, saccade, blink timing, moisture and refocus;
- brows/forehead: lift, knit, asymmetry, release and held tension;
- mouth/jaw: lip press/part, swallowed words, jaw set/release, corner asymmetry and breath preparation;
- breath/voice: inhale, held breath, exhale, rate, depth, register, volume, pace, rhythm, articulation and fracture;
- head/neck: orientation, delay before turn, chin protection, recoil or offered access;
- torso/shoulders: openness, guarding, collapse, bracing, weight shift and recovery;
- hands/props: grip pressure, hesitation, fidget, self-contact, reach, withdrawal and ownership;
- feet/space: planted/ready weight, approach, retreat, angle, distance and territorial claim;
- timing: onset, hesitation, acceleration, interruption, hold, release and afterbeat.

## Micro-expression protocol

Use micro-expression detail only when the face is large and stable enough to read, the emotional concealment matters, and the segment has time for the event. A micro-expression is a short transition, not a permanent facial mask.

Write it as:

```text
neutral/baseline -> stimulus -> brief involuntary leak -> attempted control -> residual trace
```

Example:

```text
When she hears his name, her eyes stop first; one brow lifts slightly and the lips part for a fraction before she presses them together, lowers her gaze and restores the polite smile, leaving a shallower breath.
```

Use no more than one dominant facial change plus one supporting cue per beat. Avoid lists of simultaneous eyebrow, nostril, pupil, cheek, jaw and lip movements. Do not prescribe exact frame counts for involuntary expression unless a tested workflow requires them.

## Shot-size scaling

| Framing | Prioritize | Avoid relying on |
|---|---|---|
| Extreme/close-up | eyes, mouth/jaw, breath, tiny timing and suppression | large blocking hidden outside frame |
| Medium close/medium | gaze, head, shoulders, hands, voice and relational angle | barely visible pupil/nostril details |
| Wide/full body | silhouette, posture, weight, path, distance, gesture and tempo | subtle lip or eyelid cues as the only story evidence |
| Moving/occluded | one robust action and readable silhouette | several fragile simultaneous micro-cues |

If the essential performance cannot be read in the chosen framing, change the shot responsibility or express the beat through larger behavior. Do not overload the prompt hoping the model will rescue the coverage.

## Listening and reaction

Treat the listener as active performance. For every important line or action, decide:

- where the listener looks before, during and after the stimulus;
- what information lands and when;
- whether the first impulse is revealed or suppressed;
- the change in breath, posture, hand activity or distance;
- whether the speaker notices the reaction;
- how long the reaction remains available before the next action/cut.

Protect reaction time. Do not schedule the next line immediately when the relationship result depends on the listener absorbing the previous one.

## Subtext and contradiction

External behavior may contradict internal pressure. Specify the controllable action and the leak:

```text
She keeps her voice formally even to dismiss him, but her grip tightens on the cup and she waits half a beat too long before turning away.
```

Use contradiction sparingly and causally. Avoid stacking conflicting commands such as smiling, crying, suppressing emotion and remaining expressionless at once.

## Physical and contact performance

Every body action follows `preparation -> initiation -> travel -> contact/change -> response -> recovery/settle`. Preserve balance, support, inertia, grip, force direction and pain/fatigue where relevant.

For touch, include consent/intent from story facts, approach visibility, contact point, pressure/weight, recipient response, duration and release. Do not jump to a completed embrace, fall or strike without the readable approach and response phases.

## Character-specific performance signature

Define a compact stable signature only when supported by story or approved design:

- baseline tempo and gesture scale;
- default eye-contact strategy;
- stress behavior and self-regulation;
- vocal baseline;
- habitual use of space or props;
- how the signature changes under pressure.

Do not make a signature repetitive. It constrains range; it does not force the same gesture in every scene.

## Emotional and performance continuity

At each segment boundary record:

- objective and active tactic;
- knowledge and relationship state;
- emotional intensity and direction of change;
- breath phase, gaze target and posture/weight;
- unfinished impulse, gesture, line or reaction;
- contact and prop state;
- required aftereffect and next trigger.

The next segment starts from that exact state or shows a motivated change. Never reset a character to neutral merely because a new segment begins.

## Generative economy and failure guards

- Limit each beat to one dominant performance change, one dominant physical action and one readable aftereffect.
- Prefer sequential cues to simultaneous cue lists.
- Use precise triggers; avoid “suddenly” without an observable cause.
- Avoid generic acting labels: emotional, dramatic, expressive, natural, intense, cinematic.
- Avoid anatomical micromanagement that does not change audience understanding.
- Avoid involuntary physiology claims H3 cannot reliably control unless they are visually essential and appropriately framed.
- Do not assign mutually exclusive gaze, body or voice states in the same phase.
- Do not let camera movement obscure the only important facial/contact event.

## Compact performance record

```json
{
  "given_state": "她知道儿子在逞强，但没有拆穿",
  "objective": "让他主动求助",
  "obstacle": "他回避她的目光并坚持自己处理",
  "tactic": "保持安静陪伴，给出空间",
  "stimulus": "纸船再次被树枝卡住",
  "appraisal": "先看纸船，再确认孩子的反应",
  "impulse": "伸手替他拨开树枝",
  "suppression_or_choice": "手抬起一半后停住并收回",
  "action": "把长草茎推到孩子手边",
  "aftereffect": "呼吸放松，继续蹲在旁边等待",
  "relationship_result": "帮助方式从代替变为支持",
  "visible_cues": "视线纸船→孩子；右手半抬后收回；身体保持开放但不越过孩子",
  "continuity_handoff": "蹲姿、面向溪流，孩子接过草茎，纸船仍被卡住"
}
```
