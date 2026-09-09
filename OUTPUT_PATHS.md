# Output directory

New default outputs use the configured ComfyUI output directory with a common
`CineTimeline` parent: `segments` for saved clips, `Latents` for continuation
context, and `final` for assembled films.

Restart ComfyUI after updating. Existing workflows retain their explicit save
prefixes; update those manually if they point elsewhere. Existing files are not
moved or deleted, and saved historical asset references remain unchanged.
