# CineTimeline planning contract

Return a normalized timeline root with at least:

```json
{
  "schema": "cine_timeline",
  "version": "1.4",
  "fps": 24,
  "total_frames": 240,
  "global_prompt": "...",
  "negative_prompt": "...",
  "shots": [],
  "references": [],
  "audio": [],
  "subtitles": [],
  "metadata": {
    "design": {
      "characters": [],
      "production_design": {},
      "cinematography": {},
      "sound_music": {},
      "reference_provenance": []
    }
  }
}
```

## Shot contract

Every shot must contain:

```json
{
  "shot_id": "SEGMENT_001",
  "start_frame": 0,
  "end_frame": 240,
  "local_prompt": "integrated_multimodal_description: ...\noverall_soundscape: ...\nnon_diegetic_music: N/A",
  "camera": "...",
  "transition": "cut",
  "metadata": {
    "duration_seconds": 10.0,
    "dramatic_beat": "...",
    "performance": {
      "objective": "...",
      "tactic": "...",
      "stimulus": "...",
      "impulse": "...",
      "suppression_or_choice": "...",
      "action": "...",
      "aftereffect": "...",
      "relationship_result": "...",
      "visible_cues": "..."
    },
    "start_state": "...",
    "trigger": "...",
    "during_state": "...",
    "end_state": "...",
    "handoff": "...",
    "generation_mode": "h3_ref2va",
    "reference_image_indices": [],
    "continuity_risks": [],
    "planner_reason": "...",
    "qc": {
      "dramatic_causality": 2,
      "character_identity": 2,
      "performance_observability": 2,
      "spatial_action_readability": 2,
      "camera_motivation": 2,
      "visual_design_coherence": 2,
      "audiovisual_timing": 2,
      "reference_lora_correctness": 2,
      "endpoint_continuity": 2,
      "provider_schema_legality": 2,
      "total": 20,
      "status": "PASS"
    }
  }
}
```

Shots must cover `[0,total_frames)` without overlap or unintended gaps. Use stable sequential IDs. Frame counts and duration metadata must agree with fps.

## Reference contract

Preserve the existing asset ID or stable input index. Include type, media type/order, scope, target, frame range, priority and metadata. Use `first_frame`/`last_frame` only for FL2VA; use semantic reference types for Ref2VA.

Do not emit a reference whose index or asset is unavailable. Do not convert a visual-analysis guess into permanent character identity without user confirmation; label confidence and provenance.

## Planning report

Keep outside the timeline JSON: beat/segmentation logic, global/local ownership decisions, reference assignments, LoRA adaptations and unknown semantics, continuity or capability warnings, assumptions requiring confirmation, and validation status.

Keep full reusable character/look/world designs in root `metadata.design`; keep only current visible changes and execution decisions in shot metadata and prompt text.
