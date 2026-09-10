"""Strict format adapter for the installed Larry H3 curve-aware loader.

Do not silently drop incompatible AdaLN weights through ordinary LoRA loading.
No model files are rewritten; alpha/rank scaling is folded into B in memory.
"""
import math
import sys


def normalize_h3_lora(weights):
    groups = {}
    suffixes = {'.lora_down.weight': 'a', '.lora_up.weight': 'b',
                '.lora_A.weight': 'a', '.lora_B.weight': 'b', '.alpha': 'alpha'}
    for key, tensor in weights.items():
        name = key.removeprefix('diffusion_model.')
        for suffix, part in suffixes.items():
            if name.endswith(suffix):
                module = name[:-len(suffix)]
                group = groups.setdefault(module, {})
                if part in group:
                    raise ValueError(f'Duplicate H3 LoRA tensor: {module}/{part}')
                group[part] = tensor
                break
        else:
            raise ValueError(f'Unsupported H3 LoRA tensor: {key}')
    if not groups:
        raise ValueError('Empty H3 LoRA')
    normalized = {}
    for module, group in groups.items():
        if 'a' not in group or 'b' not in group:
            raise ValueError(f'Incomplete H3 LoRA pair: {module}')
        a, b = group['a'], group['b']
        if a.ndim != 2 or b.ndim != 2 or a.shape[0] < 1 or a.shape[0] != b.shape[1]:
            raise ValueError(f'Invalid H3 LoRA dimensions: {module}')
        alpha = float(group['alpha'].item()) if 'alpha' in group else float(a.shape[0])
        if not math.isfinite(alpha):
            raise ValueError(f'Invalid H3 LoRA alpha: {module}')
        normalized[module + '.lora_A.weight'] = a
        normalized[module + '.lora_B.weight'] = b * (alpha / a.shape[0])
    return normalized, sorted(groups)


def preserve_bypass_stack(result, previous):
    """Compose one lifecycle group; nested hooks must eject in reverse order.

    The Larry helper replaces the shared bypass_lora slot. Appending separate
    injection groups is not enough: ModelPatcher ejects groups in forward order.
    Never mutate a parent's injection list, since MODEL branches share entries.
    """
    from comfy.patcher_extension import PatcherInjection
    current = result.injections.get('bypass_lora', [])
    if not previous or current is previous or not current:
        return
    chain = tuple(previous) + tuple(current)

    def inject(patcher):
        installed = []
        try:
            for item in chain:
                item.inject(patcher)
                installed.append(item)
        except Exception:
            for item in reversed(installed):
                item.eject(patcher)
            raise

    def eject(patcher):
        for item in reversed(chain):
            item.eject(patcher)

    result.set_injections('bypass_lora', [PatcherInjection(inject=inject, eject=eject)])


class CineH3TurboLoRA:
    @classmethod
    def INPUT_TYPES(cls):
        import folder_paths
        return {'required': {'model': ('MODEL',),
                'lora_name': (folder_paths.get_filename_list('loras'),),
                'strength': ('FLOAT', {'default': 0.75, 'min': -10., 'max': 10., 'step': .01}),
                'low_vram': ('BOOLEAN', {'default': False})}}

    RETURN_TYPES = ('MODEL',)
    FUNCTION = 'load'
    CATEGORY = 'CineTimeline/Production'

    def load(self, model, lora_name, strength, low_vram=False):
        import nodes
        import folder_paths
        import comfy.utils
        native = nodes.NODE_CLASS_MAPPINGS.get('MiniMaxH3TurboLoRA')
        if native is None:
            raise RuntimeError('ComfyUI-MiniMax-H3-Turbo is required for curve-aware LoRA loading')
        helper = sys.modules[native.__module__]
        weights = comfy.utils.load_torch_file(folder_paths.get_full_path_or_raise('loras', lora_name), safe_load=True)
        lora, modules = normalize_h3_lora(weights)
        dm = model.model.diffusion_model
        pruned = bool(getattr(dm, 'use_adaln_curves', False))
        adaln = [m for m in modules if pruned and 'adaln_proj' in m]
        backbone = [m for m in modules if m not in adaln]
        # Validate every destination before registering any patch.
        for module in modules:
            target = comfy.utils.get_attr(dm, module)
            a, b = lora[module+'.lora_A.weight'], lora[module+'.lora_B.weight']
            expected = tuple(target.weight.shape)
            if expected[0] != b.shape[0] or (module not in adaln and expected[1] != a.shape[1]):
                raise ValueError(f'H3 LoRA target mismatch: {module}: {expected} versus {(b.shape[0], a.shape[1])}')
        result = model.clone()
        # Curve forward patches also replace the same key. Refuse unsupported
        # overlapping curve adapters instead of silently dropping an earlier one.
        curve_keys = ['diffusion_model.' + m.rsplit('.linear', 1)[0] + '.forward' for m in adaln]
        if any(k in result.object_patches for k in curve_keys):
            raise ValueError('Stacking two curve-AdaLN H3 LoRAs is not supported; use one acceleration LoRA')
        if low_vram:
            applied = helper._apply_merge_lora(result, lora, backbone, strength)
        else:
            fused = set(helper._int8_fused_fc2(dm, backbone))
            previous = result.injections.get('bypass_lora', [])
            applied = helper._apply_bypass_lora(result, lora, [m for m in backbone if m not in fused], strength)
            preserve_bypass_stack(result, previous)
            if fused:
                applied += helper._apply_merge_lora(result, lora, sorted(fused), strength)
        if applied != len(backbone):
            raise RuntimeError(f'Incomplete H3 LoRA loading: {applied}/{len(backbone)} backbone modules')
        if adaln:
            helper._inject_adaln_egrid(result, dm, lora, adaln, strength)
        print(f'[CineH3TurboLoRA] complete: backbone={applied}/{len(backbone)}, '
              f'curve_adaln={len(adaln)}, strength={strength}, low_vram={low_vram}', flush=True)
        return (result,)


NODE_CLASS_MAPPINGS = {'CineH3TurboLoRA': CineH3TurboLoRA}
NODE_DISPLAY_NAME_MAPPINGS = {'CineH3TurboLoRA': 'CineTimeline｜H3 Turbo 完整加载'}
