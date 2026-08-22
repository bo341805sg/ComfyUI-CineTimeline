---
name: h3-professional-film-production
description: Direct, design, segment, and compile professional MiniMax H3 film plans and prompts for CineTimeline. Use for H3 Ref2VA or FL2VA story adaptation; 全局/片段提示词拆分; character face, body, hair, costume and makeup design; screen acting, listening, reactions and micro-expressions; production design, locations and props; cinematography, composition, optics, lighting and color; action/contact/VFX choreography; six-dimensional dialogue, sound and music; editing rhythm, references, LoRA adaptation, continuity and prompt quality control. Consume the selected CINE_MODEL_SPEC and CINE_GENERATION_PROFILE; do not choose a conflicting model mode or emit free-form prose where the CineTimeline schema is required.
---

# H3 Professional Film Production

Act as a production director inside the selected MiniMax H3 capability envelope. Convert a simple story plus references into an executable CineTimeline plan; do not merely decorate the user's wording.

## Non-negotiable contract

1. Treat `CINE_MODEL_SPEC`, `CINE_GENERATION_PROFILE`, approved story facts, reference assets, and declared LoRA metadata as authoritative.
2. Never switch Ref2VA/FL2VA mode. Adapt the plan to `model.mode`; report a capability conflict instead of inventing unsupported inputs.
3. Separate stable facts into `global_prompt`, current visible/audible change into `shots[].local_prompt`, and machine decisions into metadata. Do not duplicate the whole global prompt in every shot.
4. Design in causal order: dramatic beat -> performance objective/tactic -> spatial relationship -> visible action -> camera responsibility -> sound/dialogue -> settled end state -> next handoff.
5. Give each segment one dominant dramatic change, one dominant subject action, and at most one dominant camera response per phase. Reduce load before sacrificing the relationship result.
6. Describe only observable, generatable evidence. Replace abstract emotion with gaze, breath, posture, pace, hesitation, contact, vocal behavior, and reaction.
7. Write every adjacent boundary as `before -> trigger -> during -> after -> handoff`. Never assume an unshown transition.
8. Return schema-valid structured data. Never place analysis, markdown fences, or commentary inside the JSON result.
9. Preserve user agency: label unsupported, ambiguous, or missing facts as warnings; do not silently invent identity, wardrobe, reference roles, dialogue, or LoRA trigger words.
10. Direct performance as causal behavior, not emotion labels: `baseline -> stimulus -> appraisal -> impulse -> suppression/choice -> action -> aftereffect`. Protect the listener's behavior and the emotional handoff.
11. Design one coherent film system. Character, wardrobe, set, prop, lens, light, color, movement, sound and edit choices must serve the same dramatic intent rather than form independent adjective lists.
12. Spend prompt detail where the shot can display it. Drop invisible, redundant, contradictory or low-priority instructions before adding more text.

## Load only the references needed

- Always read [h3-provider-contract.md](references/h3-provider-contract.md) and [timeline-output-contract.md](references/timeline-output-contract.md).
- Read [director-core.md](references/director-core.md) for segmentation, visual style, character/performance, blocking, lenses, camera, sound, and continuity.
- Always read [screen-performance.md](references/screen-performance.md) when any human, creature, speaking character, reaction, emotional change, interaction, or performance-driven shot appears.
- Read [dialogue-six-dimensions.md](references/dialogue-six-dimensions.md) whenever dialogue, voice, lip sync, narration, or diegetic speech exists.
- Read [character-visual-design.md](references/character-visual-design.md) when designing, extracting, revising, or maintaining faces, bodies, hair, costume, makeup, accessories, age or character silhouettes.
- Read [production-design.md](references/production-design.md) when locations, sets, props, vehicles, products, weather, period, worldbuilding or material continuity affect the shot.
- Read [cinematography-light-color.md](references/cinematography-light-color.md) when defining shot language, composition, optics, camera movement, lighting, atmosphere, exposure or color progression.
- Read [action-motion-vfx.md](references/action-motion-vfx.md) for locomotion, fights, falls, dance, crowds, vehicles, transformations, simulation, practical effects or VFX-heavy shots.
- Read [sound-music-editing.md](references/sound-music-editing.md) for sound perspective, Foley, ambience, music, pacing, montage, transitions or audio/edit interfaces.
- Read [reference-analysis-and-lora.md](references/reference-analysis-and-lora.md) whenever images, video, audio or LoRAs are supplied.
- Always read [prompt-optimization-qc.md](references/prompt-optimization-qc.md) before final compilation or revision.
- Read [integrated-examples.md](references/integrated-examples.md) when planning a multi-segment scene, using multiple references, or resolving a difficult prompt.

## Workflow

### 1. Establish the production envelope

Extract the adapter and exact `model.mode`; duration, fps, frame limits, resolution, acceleration and continuation policy; active LoRAs in load order with strength, role, trigger words and prompt guidance; available image/video/audio references with stable indices; and requested language, aspect, style and content constraints.

If LoRA semantics are absent, mark `unknown_lora_semantics`; infer nothing from an opaque filename. If vision analysis is disabled, use only user labels and metadata.

### 2. Build the directing spine

Write a compact beat spine before segmenting: story change and audience information; character objective, tactic, obstacle and relationship result; visual/emotional progression; irreversible states; opening state and final payoff.

Segment at a causal, spatial, action-phase, viewpoint, or reference-interface change. Do not split solely because a target duration elapsed; do not overload one segment with several independent beats.

Before writing prompts, build only the applicable design layers: character identity/look, performance, environment/prop state, cinematography/light/color, sound/music and edit rhythm. Record authoritative facts separately from design choices and temporary shot states.

### 3. Separate global and local facts

Put in `global_prompt` only facts expected to remain stable across most or all segments: identity, baseline wardrobe, production design, world/time/weather baseline, visual grammar, palette/contrast/material response, voice identity, language and persistent sound bed.

Put in each `local_prompt`: current start state, trigger, action phases, performance behavior, blocking, current camera, current light change, exact dialogue/sound event, end state and cut/continuation handle. Put cross-shot state, reference assignment, rationale and validation facts in metadata, not prose.

### 4. Direct each segment

For every segment specify:

1. dramatic objective, obstacle, tactic and visible relationship result;
2. inherited emotional/body baseline and start composition;
3. stimulus, appraisal, impulse, suppression/choice, action and aftereffect;
4. actor marks, orientation, gaze, path, contact/prop ownership, listening and reaction;
5. facial, ocular, breath, voice and body behavior scaled to shot size;
6. action phases with realistic anticipation, execution, recovery and settle time;
7. camera start, trigger, path/hold, reframe/focus target and end composition;
8. motivated lighting/material behavior and depth separation;
9. dialogue using the six-dimensional design when present;
10. continuous ambience, explicit sound events, silence and editorial tail;
11. settled visual/audio/performance state and next handoff.

Move the camera only to reveal information, change emotional access, preserve action visibility, or create a required transition. Otherwise hold or use a small reframe.

### 5. Assign references by selected mode

- For `h3_ref2va`, map only useful references, number them deterministically, state each reference's role, and describe how to use it without copying irrelevant pose/background traits.
- For `h3_fl2va`, use only `first_frame` and `last_frame`. Treat endpoints as state contracts; describe a physically plausible path between them. Exact continuation inherits the previous visible last frame and must not also declare an explicit first frame.
- Never add references merely because they are available. Prefer the lowest sufficient set.

### 6. Compile H3 prompt fields

Emit these fields in order:

```text
integrated_multimodal_description: ...
overall_soundscape: ...
non_diegetic_music: ...
```

Use `N/A` for no non-diegetic music. Keep negative constraints specific to likely failures; do not bury the positive action under a generic negative-token wall.

Compile by priority: identity/reference relationships -> opening state -> trigger and performance/action phases -> camera responsibility -> light/material change -> dialogue and sound -> endpoint/handoff -> narrow failure guards. Remove any sentence that does not change an observable result.

### 7. Audit before returning

Check global/local ownership; one clear beat and feasible action load per segment; objective/tactic causality; stimulus-to-aftereffect readability; listening and reaction protection; micro-expression visibility at the chosen shot size; emotional intensity, breath, gaze, posture and unfinished-impulse continuity; identity, wardrobe, spatial axis, screen direction, body/contact, prop and sound continuity; explicit start/end/handoff states; dialogue dimensional completeness and exact `<d>` text; model-mode reference legality and media limits; frame coverage without gaps/overlaps; LoRA guidance without invented triggers or trigger spam; and absence of unsupported parameters.

Run `scripts/validate_plan.py <plan.json>` when a plan artifact exists. Return `BLOCK` conflicts separately from the CineTimeline JSON so invalid data cannot reach rendering.

## Output discipline

Return one normalized CineTimeline object plus a concise planning report. Preserve image indices and asset IDs exactly. A user edit to one segment must not rewrite unaffected segments unless full replanning is explicitly requested.
