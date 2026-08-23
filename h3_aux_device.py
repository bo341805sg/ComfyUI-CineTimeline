from __future__ import annotations

import copy
import gc
import logging

import comfy.model_management as mm


class H3PinnedVAEDevice:
    """Pin a VAE to one GPU without AIMDO per-weight dynamic streaming."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vae": ("VAE",),
                "device": (mm.get_gpu_device_options_no_cpu(), {"default": "gpu:0"}),
            }
        }

    RETURN_TYPES = ("VAE",)
    RETURN_NAMES = ("vae",)
    FUNCTION = "pin"
    CATEGORY = "CineTimeline/H3"

    def pin(self, vae, device="gpu:0"):
        resolved = mm.resolve_gpu_device_option(device)
        if resolved is None or resolved.type == "cpu":
            raise ValueError(f"H3 VAE 固定设备不可用：{device}")

        pinned = copy.copy(vae)
        pinned.patcher = vae.patcher.clone(disable_dynamic=True)
        pinned.patcher.load_device = resolved
        pinned.patcher.offload_device = mm.vae_offload_device()
        if hasattr(pinned.patcher, "register_load_device"):
            pinned.patcher.register_load_device(resolved)
        pinned.first_stage_model = pinned.patcher.model
        pinned.device = resolved
        logging.info(
            "H3 pinned VAE prepared on %s with dynamic streaming disabled", resolved
        )
        return (pinned,)


class H3LatentPhaseBarrier:
    """Pass an AV latent through after proactively unloading resident models."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"av_latent": ("LATENT",)}}

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("av_latent",)
    FUNCTION = "release"
    CATEGORY = "CineTimeline/H3"

    def release(self, av_latent):
        mm.unload_all_models()
        mm.soft_empty_cache()
        gc.collect()
        logging.info("H3 phase barrier released resident models before VAE decode")
        return (av_latent,)


NODE_CLASS_MAPPINGS = {
    "H3PinnedVAEDevice": H3PinnedVAEDevice,
    "H3LatentPhaseBarrier": H3LatentPhaseBarrier,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "H3PinnedVAEDevice": "H3 VAE 固定显卡（稳定解码）",
    "H3LatentPhaseBarrier": "H3 阶段释放（保留 AV Latent）",
}
