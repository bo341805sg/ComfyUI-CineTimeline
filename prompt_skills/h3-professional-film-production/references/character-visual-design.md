# Character visual design

Design a character as a stable, filmable system. Separate permanent identity, production look and temporary performance/state.

## Authority rule

Use approved reference images, character sheets and declared character LoRAs as identity authority. If authority exists, extract and preserve; do not beautify, average, age-shift, change ancestry, redesign facial structure or replace distinctive asymmetry. If references disagree, flag the conflict and identify the chosen authority.

Enter invention mode only when no authority exists or redesign is explicitly requested. Avoid inferring sensitive identity facts that are not needed for visual execution.

## Identity architecture

Define a compact combination of high-recognition anchors:

- apparent age range and maturation cues;
- craniofacial silhouette and face length/width relationship;
- forehead/hairline, brow ridge, cheekbone and jaw/chin structure;
- eye shape, spacing, lid/fold, tilt and iris value relationship;
- brow density, contour, spacing and asymmetry;
- nose bridge/root, length, tip and nostril/alar structure;
- mouth width, philtrum, lip proportions and resting corner behavior;
- ear visibility/form only when distinctive;
- skin value/undertone, texture, pores, freckles, moles, scars, lines and sun/fatigue evidence;
- hairline, part, length, cut geometry, curl pattern, density, texture and controlled flyaways;
- body frame, height impression, shoulder/hip relationship, limb proportion, musculature/fat distribution and posture baseline;
- two or three recognition anchors that remain legible across views.

Do not use idealized ratio templates unless the concept requires them. Preserve plausible facial anatomy and meaningful asymmetry. Avoid exhaustive anatomy that will not be visible.

## Character meaning and silhouette

Translate story function, era, place, occupation, class access, habits and lived history into observable choices. Distinguish characters by silhouette, value grouping, color placement, texture and movement signature—not by random accessories.

Do not reduce culture, age, disability, profession or class to costume stereotypes. Use specific material evidence supported by context.

## Hair, makeup and grooming

Specify cut/shape, part, density, texture, finish, movement response and maintenance state. For makeup, define coverage, finish, color placement, edge softness, era logic and how it behaves under the planned light. Include prosthetics, facial hair and grooming only when story-relevant.

Makeup must not erase identity anchors or natural skin response unless stylization requires it. Track sweat, tears, rain, dirt, blood and wear as state changes with causes.

## Costume design

Define silhouette, layering, construction, fit, material weight, surface texture, color/value hierarchy, closures, footwear, accessories, wear/repair, function, movement behavior and sound. Connect costume to character action and location.

Separate:

- `baseline_costume`: persistent approved look;
- `scene_costume_state`: open/closed, rolled, wet, damaged, dirty, missing, transformed;
- `continuity_events`: visible changes and when they occur.

Protect pockets, straps, hems, jewelry, glasses, hats and handheld items when they affect action or identity.

## View and lighting robustness

Check identity in front, three-quarter, profile, high/low angle, neutral and expressive states. Describe how defining facial planes, skin and hair remain recognizable under key light direction, contrast and color temperature. Do not compensate for weak identity with repeated name-only instructions.

## Prompt compression

Store full design in character metadata or global design. Compile only:

1. stable character ID;
2. 3–6 strongest visible identity/look anchors;
3. current costume/state changes;
4. current performance cues.

Do not repeat the full face catalog in every segment. Do not place transient expressions in permanent identity fields.

## Character record

```json
{
  "character_id": "CHAR_001",
  "authority": {"type": "reference_image", "asset_ids": ["..."]},
  "identity_anchors": {
    "face_structure": "...",
    "eyes_brows": "...",
    "nose_mouth": "...",
    "skin_marks": "...",
    "hair": "...",
    "body_silhouette": "...",
    "recognition_anchors": ["...", "..."]
  },
  "baseline_costume": "...",
  "grooming_makeup": "...",
  "performance_signature": "...",
  "allowed_changes": [],
  "forbidden_drift": []
}
```

## Failure guards

- Avoid “beautiful/handsome/perfect face” as a substitute for design.
- Avoid mutually incompatible facial descriptors.
- Avoid face, body, costume, makeup and performance details that exceed the shot's visibility.
- Avoid accidental identity drift caused by changing synonyms for stable features.
- Avoid copying pose, expression, lighting or background from an identity reference unless assigned.
