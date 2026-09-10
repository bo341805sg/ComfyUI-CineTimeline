POSTPROCESS_RTX = "RTXVSR x2"
POSTPROCESS_NATIVE = "原生输出（不放大）"
POSTPROCESS_FLASH = "FlashVSR x2"
POSTPROCESS_H3 = "latent x2 H3精修"
POSTPROCESS_MODES = [POSTPROCESS_NATIVE, POSTPROCESS_FLASH, POSTPROCESS_H3]


class CinePostprocessMode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mode": (POSTPROCESS_MODES, {"default": POSTPROCESS_NATIVE})}}

    @classmethod
    def VALIDATE_INPUTS(cls, mode):
        return True if mode in POSTPROCESS_MODES or mode in ("H3精修", POSTPROCESS_RTX) else "Unknown postprocess mode"

    RETURN_TYPES = ("CINE_POSTPROCESS_MODE",)
    RETURN_NAMES = ("mode",)
    FUNCTION = "select"
    CATEGORY = "CineTimeline/Production"

    def select(self, mode):
        if mode == "H3精修":
            mode = POSTPROCESS_H3
        # Preserve old saved graphs without silently changing their wiring.
        if mode == POSTPROCESS_RTX:
            return (mode,)
        if mode not in POSTPROCESS_MODES:
            raise ValueError(f"Unknown postprocess mode: {mode}")
        return (mode,)


class CinePostprocessSelector:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "mode": ("CINE_POSTPROCESS_MODE",),
            **{f"{route}_{kind}": (typ, {"lazy": True})
               for route in ("rtx", "flash", "h3")
               for kind, typ in (("frames", "IMAGE"), ("audio", "AUDIO"))},
        }}

    RETURN_TYPES = ("IMAGE", "AUDIO")
    RETURN_NAMES = ("frames", "audio")
    FUNCTION = "select"
    CATEGORY = "CineTimeline/Production"

    @staticmethod
    def _selected_inputs(mode):
        # The first pair keeps its serialized socket names for existing graphs.
        # New production graphs connect these directly to the first-pass decode.
        route = {POSTPROCESS_NATIVE: "rtx", POSTPROCESS_RTX: "rtx", POSTPROCESS_FLASH: "flash",
                 POSTPROCESS_H3: "h3", "H3精修": "h3"}.get(mode)
        if route is None:
            raise ValueError(f"Unknown postprocess mode: {mode}")
        return f"{route}_frames", f"{route}_audio"

    def check_lazy_status(self, mode, **kwargs):
        return [name for name in self._selected_inputs(mode) if kwargs.get(name) is None]

    def select(self, mode, **kwargs):
        frames, audio = self._selected_inputs(mode)
        return kwargs[frames], kwargs[audio]


class CineNativeResolution:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"width": ("INT", {"default": 1296, "min": 16, "max": 16384, "step": 16}),
                             "height": ("INT", {"default": 720, "min": 16, "max": 16384, "step": 16})}}

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "resolve"
    CATEGORY = "CineTimeline/Production"

    def resolve(self, width, height):
        if width <= 0 or height <= 0 or width % 16 or height % 16:
            raise ValueError("H3 dimensions must be positive multiples of 16")
        return width, height


class CineH3ConditioningGrid:
    """Match stock H3's input padding for odd-sized keyframe condition latents."""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"conditioning": ("CONDITIONING",)}}

    RETURN_TYPES = ("CONDITIONING",)
    FUNCTION = "align"
    CATEGORY = "CineTimeline/internal"

    def align(self, conditioning):
        import torch.nn.functional as F
        result=[]
        for embedding, metadata in conditioning:
            updated=dict(metadata)
            if metadata.get('minimax_keyframes'):
                frames=[]
                for item in metadata['minimax_keyframes']:
                    frame=dict(item)
                    z=frame.get('latent')
                    if z is not None and (z.shape[-2]%2 or z.shape[-1]%2):
                        frame['latent']=F.pad(z,(0,z.shape[-1]%2,0,z.shape[-2]%2,0,0),mode='circular')
                    frames.append(frame)
                updated['minimax_keyframes']=frames
            result.append([embedding,updated])
        return (result,)


NODE_CLASS_MAPPINGS = {"CineH3ConditioningGrid": CineH3ConditioningGrid,
                       "CineNativeResolution": CineNativeResolution,
                       "CinePostprocessMode": CinePostprocessMode,
                       "CinePostprocessSelector": CinePostprocessSelector}
NODE_DISPLAY_NAME_MAPPINGS = {"CineH3ConditioningGrid": "CineTimeline｜H3参考网格对齐",
                              "CineNativeResolution": "CineTimeline｜原生尺寸",
                              "CinePostprocessMode": "CineTimeline｜后处理模式",
                              "CinePostprocessSelector": "CineTimeline｜后处理分支"}
