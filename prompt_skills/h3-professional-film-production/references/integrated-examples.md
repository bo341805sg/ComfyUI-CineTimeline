# Integrated examples

## Ref2VA: two characters, dialogue and prop

Input: a mother and child follow a paper boat; references contain both characters, the park and the boat. Selected mode is `h3_ref2va`.

Good decisions:

- Put stable identity, wardrobe, rainy-morning park grammar, white paper-boat identity, naturalistic finish and continuous creek ambience in the global prompt.
- Use four references only when each has a distinct responsibility; map character images to identity/wardrobe, park to environment, boat to prop geometry. Exclude source poses and lighting unless approved.
- Segment at obstacle and relationship-result changes: release boat; branch traps boat and child solves it; boat clears bridge and resolves the theme.
- Give each segment a settled end state that becomes the next start. Preserve creek direction, boat location, screen direction and ambience.
- Direct dialogue through exact tags plus intention, voice, gaze, body and timing. Leave the listener reaction visible.

Bad decisions include repeating all appearance paragraphs in every local prompt, adding unused references, writing prestige adjectives without executable direction, or beginning the next segment in a completed body state that was never shown.

## FL2VA endpoint design

Input first frame: a woman outside a door, right hand near the handle. Last frame: she stands inside, looking back through the open door. Selected mode is `h3_fl2va`.

Good local design:

```text
Start in the exact first-frame composition. Her weight rests on the rear foot and her right hand hovers just short of the handle. A sound from inside triggers a brief gaze shift; she grips and turns the handle, pushes the door inward, transfers weight through the threshold and takes two controlled steps. The camera holds its side of the axis and makes only a small backward reframe to preserve her hand, doorway and face. She stops at the last-frame mark, releases the handle, then turns her head back through the still-open door; motion and camera settle into the supplied last-frame composition.
```

Bad local design:

```text
She goes inside dramatically while the camera orbits and cranes into a close-up.
```

The bad version omits the endpoint path, grip, weight transfer, axis, visibility and settle while adding incompatible camera load.

## Global versus local

Global:

```text
Same adult East Asian woman, angular oval face, shoulder-length black hair, dark red wool coat and black ankle boots. Restrained urban drama; cool overcast daylight, muted cyan-gray environment against the coat's deep red, natural skin texture, controlled contrast, subtle grain, stable identity and wardrobe. Continuous distant traffic and light rain. Mandarin dialogue, same natural mid-low voice.
```

Local:

```text
She waits beneath the bus shelter in a medium profile, shoulders held high against the cold, left hand gripping the damp paper ticket. Arriving bus headlights motivate a warm reflection across the glass. She notices a familiar silhouette, releases one held breath and lowers the ticket; the camera remains static until recognition, then makes a slow small push to her eyes and settles before she speaks. (S1) <d>[Chinese] 你还是来了。</d>
```

Do not place the arriving bus, recognition, ticket action or current camera push in the global prompt.

## Performance and micro-expression

Input: a father tells his adult daughter that he sold the family shop. She wants to appear unaffected, but the news changes her plan. Medium close-up, static camera.

Weak:

```text
She is shocked and deeply emotional, with a cinematic micro-expression, then speaks sadly.
```

Production-ready:

```text
She begins with a polite listening smile and steady eye contact. On “卖掉了,” her eyes hold still before the smile disappears; her lips part as if to answer, then press together. She looks once toward the shop keys in his hand, draws a shallow breath and places both hands flat on the table to stop herself reaching for them. She restores an even voice without restoring the smile. (S1) <d>[Chinese] 什么时候决定的？</d> After the question, she keeps her gaze on the keys rather than him, leaving the father time to register that she is hurt.
```

This version provides baseline, exact stimulus, involuntary leak, suppression, chosen action, dialogue behavior, listener consequence and aftereffect. The cues are visible at medium close-up and occur sequentially.

## Character design compression

Full approved design:

```text
Late-30s woman; long narrow oval face with prominent high cheekbones and a compact tapered chin; slightly deep-set almond eyes with unequal lid folds; straight brows with a small break over the left eye; long narrow nose with a softly rounded tip; broad mouth, thinner upper lip and a small mole below the right corner; medium neutral-warm skin with visible pores and faint sun lines; dense shoulder-length black hair, off-center part and loose natural bend; narrow-shouldered, long-limbed silhouette. Dark red wool coat with broad notched lapels, charcoal knit layer and black ankle boots.
```

Compressed recurring prompt anchor:

```text
The same late-30s woman with the long narrow face, high cheekbones, unequal almond-eye lid folds, mole below the right mouth corner, shoulder-length off-center black hair, long-limbed silhouette and dark red wool coat.
```

Current local state:

```text
Rain has darkened the coat shoulders and loosened several strands across her right cheek; she keeps her jaw set and weight slightly back while watching the doorway.
```

Do not repeat the complete anatomical catalog per segment or turn wet hair and a set jaw into permanent identity.
