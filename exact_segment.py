"""Exact delivered duration with a matching, separately encoded AV boundary."""
import json
import sys


def crop_segment(images, audio, start, count, fps):
    import torch.nn.functional as F
    if start < 0 or count < 1 or start + count > len(images):
        raise ValueError(f'Insufficient video frames: need {start}+{count}, got {len(images)}')
    rate = int(audio['sample_rate'])
    offset, length = round(start*rate/fps), round(count*rate/fps)
    wave = audio['waveform'][..., offset:offset+length]
    if wave.shape[-1] < length:
        wave = F.pad(wave, (0, length-wave.shape[-1]))
    return images[start:start+count], {**audio, 'waveform':wave}


class CineExactSegment:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'images': ('IMAGE',), 'audio': ('AUDIO',),
            'native_images': ('IMAGE',), 'native_audio': ('AUDIO',),
            'video_vae': ('VAE',), 'audio_vae': ('VAE',),
            'extension_plan': ('STRING', {'forceInput':True}),
            'firstpass_latent_path': ('STRING', {'forceInput':True}),
            'fps': ('FLOAT', {'default':24., 'min':1.}),
        }}
    RETURN_TYPES = ('IMAGE', 'AUDIO', 'STRING', 'STRING')
    RETURN_NAMES = ('images', 'audio', 'boundary_latent_path', 'summary')
    FUNCTION = 'finalize'
    CATEGORY = 'CineTimeline/Production'

    def finalize(self, images, audio, native_images, native_audio, video_vae, audio_vae,
                 extension_plan, firstpass_latent_path, fps):
        import nodes
        plan = json.loads(extension_plan)
        count = int(plan['requested_frame_count'])
        start = int(plan.get('context_length',22)) if plan.get('enabled') else 0
        # Inputs are untrimmed; both processed and native routes share one clock.
        frames, sound = crop_segment(images, audio, start, count, fps)
        native_frames, native_sound = crop_segment(native_images, native_audio, start, count, fps)
        if start+count == len(native_images):
            boundary = firstpass_latent_path
            action = 'reuse aligned first-pass latent'
        else:
            # Only the short visible tail is encoded, never the upscaled video.
            # 39 frames = 12 H3 steps; this also covers the 24-frame audio window.
            window = next((n for n in (39,22,5) if n <= count), None)
            if window is None:
                raise ValueError('Segment too short for an H3 continuation boundary')
            cls = nodes.NODE_CLASS_MAPPINGS['MiniMaxH3MotionContextSaveLatent']
            helper = sys.modules[cls.__module__]
            video = video_vae.encode(native_frames[-window:])
            if int(video.shape[2]) != {39:12,22:7,5:2}[window]:
                raise ValueError('H3 boundary VAE frame grid changed')
            encoded_audio, _ = helper._encode_tail_audio(audio_vae, native_sound, window/fps)
            prefix = str(plan.get('save_prefix') or 'CineTimeline/boundaries/segment') + '_visible_boundary'
            boundary = cls().save({'samples':[video,encoded_audio]},prefix,0)[0]
            action = f'encode visible native tail {window} frames'
        summary = f'trim {start}, deliver {count} frames at {fps} fps; {action}; raw={firstpass_latent_path}'
        print('[CineExactSegment] '+summary,flush=True)
        return frames,sound,boundary,summary


NODE_CLASS_MAPPINGS = {'CineExactSegment':CineExactSegment}
NODE_DISPLAY_NAME_MAPPINGS = {'CineExactSegment':'CineTimeline｜精确时长与续接边界'}
