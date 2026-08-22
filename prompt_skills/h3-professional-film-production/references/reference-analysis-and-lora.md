# Reference analysis and LoRA adaptation

Use multimodal inputs as assigned evidence. H3 benefits from natural-language descriptions of the relationship among each input and the target video.

## Analyze before assigning

For each image, video or audio input record:

- stable index/asset ID and media type;
- observed facts separated from inference;
- candidate responsibility: identity, wardrobe, environment, prop/product, pose/contact, composition, style, light, motion, performance, voice, ambience, effect or music;
- traits to inherit;
- traits to ignore;
- applicable segments and priority;
- confidence and conflicts with other authorities.

Do not infer invisible details. Do not turn a single pose or expression into a permanent character trait. Do not let a style reference override identity, product or story facts.

## Reference relationship language

Use explicit relationships:

```text
Use Picture 1 only for CHAR_001 facial identity and hair structure; preserve the approved red coat from Picture 2; do not copy either source pose or background. Use Video 1 for the restrained shoulder-level tracking motion, not its subject or location. Match Audio 1 only for the speaker's voice identity and close-mic tone; speak the new tagged line exactly.
```

Avoid vague “refer to all images” instructions. Prefer the lowest sufficient reference set.

## Ref2VA selection

Rank references by authority and marginal value. Remove redundant or conflicting inputs before approaching provider limits. Ensure actual conditioning order matches `<Picture N>`, `<Video N>` and `<Audio N>` tags.

## FL2VA analysis

Compare first and last frame identity, count, topology, body/contact, prop state, camera side/framing, light, weather and irreversible changes. Derive a feasible intermediate path. Flag incompatible endpoints rather than inventing an unexplained transformation.

## LoRA contract

Consume structured metadata when available:

```json
{
  "name": "...",
  "strength": 0.8,
  "order": 2,
  "role": "character_identity | action | style | camera | costume | object | acceleration | unknown",
  "trigger_words": [],
  "prompt_guidance": "...",
  "known_conflicts": []
}
```

- Treat acceleration LoRAs as technical constraints, not creative style.
- Use declared trigger words at the required frequency and spelling; never invent them from filenames.
- Let identity/costume LoRAs reduce repeated prose but retain critical current-state changes.
- Adapt action/camera/style wording to the LoRA's tested behavior without adding unrelated demands.
- Detect overlapping roles, excessive combined strength, conflicting styles and duplicate triggers; report rather than silently resolve material conflicts.
- Mark missing semantic metadata as `unknown_lora_semantics`.

## Vision-off behavior

When visual analysis is disabled, trust only supplied labels, role metadata and asset IDs. Do not claim to have inspected the media. Ask for or flag missing responsibility labels only when they block execution.

## Provenance

Record which stable facts came from user text, approved reference, LoRA metadata or planner inference. Keep inference revisable and never promote it to authority without confirmation.
