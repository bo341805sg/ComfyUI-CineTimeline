# Six-dimensional dialogue direction

Treat dialogue as text plus five execution dimensions. Decide all six or explicitly mark neutral/not applicable.

Use [screen-performance.md](screen-performance.md) to derive the speaker's and listener's causal performance beats. This file governs dialogue execution, not the entire acting design.

| Dimension | Directing question | Observable specification |
|---|---|---|
| Verbal content | What exact words are spoken? | Exact `<d>` text, language and speaker; no paraphrase |
| Intention/subtext | What does the speaker want and conceal? | Objective, tactic, subtext and relationship pressure |
| Vocal performance | How is it voiced? | Voice identity, register, volume, pace, rhythm, pitch contour, articulation, breath and restraint |
| Facial/ocular behavior | What do face and gaze do? | Gaze target, eye contact/avoidance, blink/hold, mouth preparation, facial tension and reaction |
| Body/blocking | What physical action carries the line? | Posture, orientation, gesture, movement/contact, prop use and listening behavior |
| Temporal/audiovisual relation | When and how does it meet picture/sound? | Lead-in, cue, pauses, overlap policy, reaction window, lip visibility, ambience and tail |

## Procedure

1. Preserve approved wording exactly and assign one speaker ID and language label.
2. State objective, tactic and subtext outside the spoken text.
3. Choose playable vocal behavior. Prefer “low volume, steady pace, short breath before the final phrase” over “deeply emotional.”
4. Choreograph gaze, facial preparation, body action and the listener's reaction. Listening is performance.
5. Fit the line to duration, including lead-in, pauses, reaction and tail. Shorten upstream text when it cannot fit; do not force unnaturally fast delivery.
6. Protect sound perspective and exact lip-sync interval. Specify no overlap unless interruption is required and technically acceptable.

## Compact record

```json
{
  "speaker_id": "CHAR_MOTHER",
  "language": "Chinese",
  "exact_text": "我们陪它走一段。",
  "objective": "让孩子继续尝试",
  "tactic_subtext": "温柔鼓励，不替他完成",
  "voice": {
    "register": "natural mid-low",
    "volume": "soft close voice",
    "pace": "unhurried",
    "rhythm": "one brief pause after 我们",
    "articulation": "clear",
    "breath": "quiet inhale before speaking"
  },
  "face_gaze": "先看纸船，转向孩子并保持温和眼神",
  "body_blocking": "保持蹲姿，手掌朝溪流作小幅指引，不代替孩子触碰纸船",
  "timing": "环境声先行；动作触发后开口；说完保留孩子反应和环境声尾",
  "tagged_line": "(S1) <d>[Chinese] 我们陪它走一段。</d>"
}
```

## Failure guards

- Put only exact spoken words inside `<d>`; keep delivery directions outside.
- Do not generate untagged speech, paraphrases, filler, narration, whispers or echo duplicates.
- Avoid simultaneous dialogue when clean single-speaker timing communicates the beat.
- Do not make every line slow, breathy or whispered; derive behavior from objective and relationship.
- Do not omit the listener's visible response when it carries the dramatic result.
