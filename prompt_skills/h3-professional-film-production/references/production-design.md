# Production design, world and props

Design an environment as playable geography with story evidence, not scenic decoration.

## World and location layers

Define only applicable layers:

- period, region, climate, time and social/economic context;
- architecture, room/terrain topology, entrances, exits and level changes;
- foreground/midground/background anchors and safe movement zones;
- motivated practical sources, windows, reflective surfaces and atmosphere sources;
- material palette, age, wear, moisture, dirt and maintenance state;
- set dressing that reveals use, ownership and recent events;
- weather, wind, precipitation, accumulation and physical consequences;
- signage/screen text only when deliberately required and legible;
- spatial sound sources and off-screen world continuation.

Preserve a small set of strong geographic anchors across segments. Avoid rebuilding the location from unrelated adjectives each time.

## Production-design causality

Every prominent object should support action, information, mood, composition, continuity or brand/product responsibility. Remove decorative clutter that competes with faces, hands, contact or the story prop.

Connect atmosphere to material response: rain darkens fabric and pavement, wind moves loose hair and foliage, warm practicals create motivated highlights, dust changes visibility and sound.

## Props and products

For each critical prop define:

- stable ID, category, dimensions/scale impression, shape, material, color, markings and condition;
- owner, hand/location, orientation, visibility and access;
- functional parts and allowed motion;
- interaction phases and resulting state;
- irreversible changes, damage, contents or depletion;
- sound and light response;
- reference authority and branding/text requirements.

Track `before -> interaction -> after -> handoff`. A prop cannot change hand, orientation, condition or location between segments without an event.

For products, preserve silhouette, proportions, color, logo/text placement and surface finish. Do not invent branding or claims.

## Set continuity record

```json
{
  "scene_id": "SCENE_001",
  "topology": "...",
  "anchors": ["door screen-left", "window behind table"],
  "materials": "...",
  "light_sources": "...",
  "weather_state": "...",
  "critical_props": [{"prop_id": "PROP_001", "state": "...", "owner": "..."}],
  "allowed_changes": [],
  "continuity_risks": []
}
```

## Failure guards

- Avoid impossible room geography, door/window drift and changing background anchors.
- Avoid uncontrolled crowds or clutter when a clean performance/contact read is essential.
- Avoid atmosphere with no physical effect.
- Avoid spawning duplicate critical props.
- Avoid illegible or invented text when exact text is story-critical; route exact typography through a verified workflow.
