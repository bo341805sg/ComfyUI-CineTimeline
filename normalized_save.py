import hashlib
import json
import os

import folder_paths

from comfy.cli_args import args
from comfy_api.latest import Input, Types, io, ui

from .routes import _normalize_saved_video_audio


class CineSaveNormalizedVideo(io.ComfyNode):
    """Save a VIDEO and normalize its audio before publishing the result."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="CineSaveNormalizedVideo",
            display_name="CineTimeline Save Video (Normalized Audio)",
            category="CineTimeline",
            description="Saves a video and applies EBU R128 loudness normalization to its audio.",
            inputs=[
                io.Video.Input("video"),
                io.String.Input("filename_prefix", default="H3-CineTimeline/segments/segment"),
                io.Combo.Input("format", options=Types.VideoContainer.as_input(), default="mp4"),
                io.DynamicCombo.Input(
                    "codec",
                    options=[
                        io.DynamicCombo.Option("auto", []),
                        io.DynamicCombo.Option(
                            "h264",
                            [
                                io.DynamicCombo.Input(
                                    "encoding",
                                    display_name="encoding mode",
                                    options=[
                                        io.DynamicCombo.Option("auto", []),
                                        io.DynamicCombo.Option(
                                            "re-encode",
                                            [io.Float.Input("crf", default=23.0, min=0.0, max=51.0, step=1.0)],
                                        ),
                                    ],
                                    optional=True,
                                ),
                            ],
                        ),
                    ],
                ),
                io.String.Input("latent_path", default="", optional=True),
            ],
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo],
            is_output_node=True,
            outputs=[io.Video.Output("video"), io.String.Output("segment_manifest")],
        )

    @classmethod
    def execute(cls, video: Input.Video, filename_prefix, format: str, codec: io.DynamicCombo.Type, latent_path=""):
        codec_name = codec["codec"]
        encoding = codec.get("encoding") or {}
        width, height = video.get_dimensions()
        full_output_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            filename_prefix, folder_paths.get_output_directory(), width, height
        )

        metadata = None
        if not args.disable_metadata:
            metadata = {}
            if cls.hidden.extra_pnginfo is not None:
                metadata.update(cls.hidden.extra_pnginfo)
            if cls.hidden.prompt is not None:
                metadata["prompt"] = cls.hidden.prompt
            if not metadata:
                metadata = None

        file = f"{filename}_{counter:05}_.{Types.VideoContainer.get_extension(format)}"
        path = os.path.join(full_output_folder, file)
        video.save_to(
            path,
            format=Types.VideoContainer(format),
            codec=codec_name,
            metadata=metadata,
            crf=encoding.get("crf"),
        )
        _normalize_saved_video_audio(path)

        manifest = cls._segment_manifest(latent_path, width, height)

        manifest_json = json.dumps(manifest, ensure_ascii=False) if manifest else ""
        preview_ui = ui.PreviewVideo(
            [ui.SavedResult(file, subfolder, io.FolderType.output)]
        ).as_dict()
        # ComfyUI history/websocket events only retain values explicitly
        # exposed through UI data. CineTimeline needs the manifest alongside
        # the saved video event to register the exact latent for continuation.
        preview_ui.update(ui.PreviewText(manifest_json).as_dict())
        return io.NodeOutput(video, manifest_json, ui=preview_ui)

    @classmethod
    def _segment_manifest(cls, latent_path, width, height):
        latent_path = os.path.abspath(str(latent_path or "").strip())
        if not latent_path or not os.path.isfile(latent_path):
            return None
        prompt = cls.hidden.prompt if isinstance(cls.hidden.prompt, dict) else {}
        plan = next((node for node in prompt.values() if node.get("class_type") == "CineTimelinePlan"), None)
        if not plan:
            return None
        inputs = plan.get("inputs") or {}
        shot_id = str(inputs.get("render_target_shot_id") or "").strip()
        run_id = str(inputs.get("render_run_id") or "").strip()
        transition = "cut"
        source_shot_id = ""
        source_version_id = ""
        source_latent_sha256 = ""
        try:
            timeline = json.loads(inputs.get("timeline_state") or inputs.get("timeline_json") or "{}")
            shots = timeline.get("shots", [])
            shot = next((item for item in shots if str(item.get("shot_id")) == shot_id), {})
            transition = str(shot.get("transition") or "cut")
            shot_index = shots.index(shot)
            if transition == "motion_context" and shot_index > 0:
                previous = shots[shot_index - 1]
                previous_render = previous.get("metadata", {}).get("render", {})
                active_version = str(previous_render.get("active_version", "") or "")
                source_version = next(
                    (item for item in previous_render.get("versions", [])
                     if str(item.get("version_id", "")) == active_version),
                    {},
                )
                source_shot_id = str(previous.get("shot_id", "") or "")
                source_version_id = str(source_version.get("version_id", "") or "")
                source_latent_sha256 = str(source_version.get("latent_sha256", "") or "").lower()
        except Exception:
            pass
        if not shot_id or not run_id:
            return None
        digest = hashlib.sha256()
        with open(latent_path, "rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        checksum = digest.hexdigest()
        return {
            "schema": "cine_segment_manifest",
            "version": "1.0",
            "shot_id": shot_id,
            "render_run_id": run_id,
            "latent_path": latent_path,
            "latent_sha256": checksum,
            "boundary_latent_path": latent_path,
            "boundary_latent_sha256": checksum,
            "transition": transition,
            "source_shot_id": source_shot_id,
            "source_version_id": source_version_id,
            "source_latent_sha256": source_latent_sha256,
            "width": int(width),
            "height": int(height),
        }


NODE_CLASS_MAPPINGS = {"CineSaveNormalizedVideo": CineSaveNormalizedVideo}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CineSaveNormalizedVideo": "CineTimeline 保存视频（统一响度）",
}
