from __future__ import annotations

import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from aiohttp import web
import folder_paths
from server import PromptServer


def _safe_output_asset(asset_id: str) -> Path:
    output_root = Path(folder_paths.get_output_directory()).resolve()
    relative = str(asset_id or "").replace("\\", "/").lstrip("/")
    candidate = (output_root / relative).resolve()
    if output_root != candidate and output_root not in candidate.parents:
        raise ValueError("片段路径超出 ComfyUI 输出目录")
    if not candidate.is_file():
        raise ValueError(f"片段文件不存在：{relative}")
    if candidate.suffix.lower() not in {".mp4", ".mov", ".mkv", ".webm", ".avi"}:
        raise ValueError(f"不支持的视频格式：{candidate.suffix}")
    return candidate


def _video_signature(path: Path) -> tuple[int, int, float]:
    import cv2

    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            raise ValueError(f"无法读取视频：{path.name}")
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = round(float(capture.get(cv2.CAP_PROP_FPS)), 3)
    finally:
        capture.release()
    if width < 1 or height < 1 or fps <= 0:
        raise ValueError(f"视频参数无效：{path.name}")
    return width, height, fps


def _ffmpeg_executable() -> str:
    from imageio_ffmpeg import get_ffmpeg_exe

    executable = get_ffmpeg_exe()
    if not executable or not os.path.isfile(executable):
        raise RuntimeError("未找到 FFmpeg")
    return executable


def _normalize_saved_video_audio(path: Path) -> Path:
    """Create a normalized companion file without touching SaveVideo's locked output."""
    destination = path.with_name(f"{path.stem}_normalized_{uuid.uuid4().hex[:8]}{path.suffix}")
    process = subprocess.run(
        [
            _ffmpeg_executable(), "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(path),
            "-map", "0:v:0", "-map", "0:a:0?",
            "-c:v", "copy",
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart", str(destination),
        ],
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    if process.returncode != 0 or not destination.is_file():
        destination.unlink(missing_ok=True)
        detail = (process.stderr or process.stdout or "FFmpeg 响度归一化失败").strip()
        raise RuntimeError(detail[-1000:])
    return destination


@PromptServer.instance.routes.post("/cine_timeline/normalize_audio")
async def normalize_saved_video_audio(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        path = _safe_output_asset(payload.get("asset_id", ""))
        normalized = _normalize_saved_video_audio(path)
        output_root = Path(folder_paths.get_output_directory()).resolve()
        relative = normalized.relative_to(output_root).as_posix()
        return web.json_response({
            "ok": True,
            "asset_id": relative,
            "saved": {
                "filename": normalized.name,
                "subfolder": normalized.parent.relative_to(output_root).as_posix(),
                "type": "output",
            },
        })
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)


@PromptServer.instance.routes.post("/cine_timeline/assemble")
async def assemble_saved_segments(request: web.Request) -> web.Response:
    try:
        payload = await request.json()
        assets = payload.get("assets") or []
        if not isinstance(assets, list) or not assets:
            raise ValueError("没有可串联的片段")
        paths = [_safe_output_asset(item.get("asset_id", "")) for item in assets]
        signatures = [_video_signature(path) for path in paths]
        expected = signatures[0]
        mismatches = [
            f"{paths[index].name}={signature[0]}x{signature[1]}@{signature[2]}fps"
            for index, signature in enumerate(signatures)
            if signature != expected
        ]
        if mismatches:
            raise ValueError(
                f"片段尺寸或帧率不一致；基准为 {expected[0]}x{expected[1]}@{expected[2]}fps；"
                + "，".join(mismatches)
            )

        output_root = Path(folder_paths.get_output_directory()).resolve()
        final_dir = output_root / "H3-CineTimeline" / "final"
        final_dir.mkdir(parents=True, exist_ok=True)
        filename = f"complete_{uuid.uuid4().hex[:12]}.mp4"
        destination = final_dir / filename
        with tempfile.NamedTemporaryFile("w", suffix=".txt", encoding="utf-8", delete=False, dir=final_dir) as handle:
            list_path = Path(handle.name)
            for path in paths:
                escaped = path.as_posix().replace("'", "'\\''")
                handle.write(f"file '{escaped}'\n")
        try:
            process = subprocess.run(
                [
                    _ffmpeg_executable(), "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "concat", "-safe", "0", "-i", str(list_path),
                    "-map", "0", "-c", "copy", "-movflags", "+faststart", str(destination),
                ],
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )
        finally:
            list_path.unlink(missing_ok=True)
        if process.returncode != 0 or not destination.is_file():
            destination.unlink(missing_ok=True)
            detail = (process.stderr or process.stdout or "FFmpeg 串联失败").strip()
            raise RuntimeError(detail[-1000:])
        relative = destination.relative_to(output_root).as_posix()
        return web.json_response({
            "ok": True,
            "saved": {"filename": filename, "subfolder": "H3-CineTimeline/final", "type": "output"},
            "asset_id": relative,
            "width": expected[0],
            "height": expected[1],
            "fps": expected[2],
            "segments": len(paths),
        })
    except (ValueError, RuntimeError, subprocess.SubprocessError) as error:
        return web.json_response({"ok": False, "error": str(error)}, status=400)
