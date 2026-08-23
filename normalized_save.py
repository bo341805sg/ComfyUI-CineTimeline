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
            ],
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo],
            is_output_node=True,
            outputs=[io.Video.Output("video")],
        )

    @classmethod
    def execute(cls, video: Input.Video, filename_prefix, format: str, codec: io.DynamicCombo.Type):
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

        return io.NodeOutput(
            video,
            ui=ui.PreviewVideo([ui.SavedResult(file, subfolder, io.FolderType.output)]),
        )


NODE_CLASS_MAPPINGS = {"CineSaveNormalizedVideo": CineSaveNormalizedVideo}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CineSaveNormalizedVideo": "CineTimeline 保存视频（统一响度）",
}
