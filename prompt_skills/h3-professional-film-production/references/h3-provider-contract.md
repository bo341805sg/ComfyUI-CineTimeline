# MiniMax H3 provider contract

Use this file as executable provider knowledge, not general film theory.

## Prompt envelope

Compile final prompts in this exact order:

```text
integrated_multimodal_description: <reference map, stable facts, segment action, camera, dialogue constraints>
overall_soundscape: <continuous bed, events, perspective, timing and tail>
non_diegetic_music: <music direction or N/A>
```

Reference-map tags must match actual conditioning order. Describe each reference's responsibility and exclusions. A reference is evidence, not permission to inherit every visible trait.

## Ref2VA

- Accept at most 9 images, 3 videos, 3 standalone audio inputs and 12 total references per segment.
- Require at least one image or video when references exist; audio cannot be the only H3 reference input.
- Number each media class uniquely from 1 within its supported range.
- Use references for identity, wardrobe, environment, prop, pose/contact, style, motion or audio only when the assignment is explicit.
- Count an automatically inherited previous final frame as an image reference.
- Avoid redundant near-identical references; reference competition weakens control.

## FL2VA

- Accept only `first_frame` and `last_frame` references.
- Treat a first frame as the exact opening state and a last frame as the intended settled endpoint, not an instantaneous teleport target.
- Write the intermediate action path, balance/contact changes, screen direction, camera behavior and settle that make both endpoints compatible.
- Exact continuation uses the previous visible last frame as the first frame. Do not provide a second explicit first frame.
- If endpoints imply incompatible identity, topology, camera side or irreversible state, return a conflict instead of hiding it in prose.

## Duration and action load

CineTimeline's validated H3 production range is 124–362 compiled frames unless the generation profile explicitly permits out-of-distribution length. Respect the aligned frame count.

Reserve an opening read for spatial/performance state, make the trigger and dominant action visible, protect reaction or consequence, and leave a settled visual/audio tail. Do not schedule new dialogue, a new major action or a strong transient in the protected tail.

## Dialogue and native sound

Write spoken text only inside `<d>...</d>`, with speaker/language label as required by the workflow:

```text
(S1) <d>[Chinese] 我们陪它走一段。</d>
```

Only tagged text may be spoken. Require exact wording, one delivery, no additions, omissions, substitutions, stutter, substring repetition, whisper duplicate, overlapping duplicate or delayed echo. Keep a continuous environmental bed underneath dialogue unless deliberate silence is specified.

If `audio_lead_seconds` is present, characters remain visibly silent during that opening interval while the defined ambience continues. Finish dialogue and strong sound events before the editorial tail.

## Prompt economy

- Prefer concrete positive behavior over adjective stacks.
- Use stable noun phrases for recurring subjects and props.
- Describe one dominant motion path and one camera responsibility per phase.
- Do not repeat a LoRA trigger in every sentence; follow declared LoRA metadata.
- Avoid unsupported lens metadata, numeric camera telemetry or provider parameters in natural-language prompts.
