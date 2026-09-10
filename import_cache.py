"""Queue-executed VAE-only reconstruction of the visible imported AV tail."""
import hashlib,json,sys,uuid,subprocess
from pathlib import Path
from collections import deque

class CineImportAVCache:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'video_vae':('VAE',), 'audio_vae':('VAE',),
            'asset_id':('STRING',), 'version_id':('STRING',),
            'width':('INT',{'min':32,'max':4096}), 'height':('INT',{'min':32,'max':4096}),
            'duration':('FLOAT',{'min':1.625,'max':15})}}
    RETURN_TYPES=()
    FUNCTION='build'
    OUTPUT_NODE=True
    CATEGORY='CineTimeline/internal'
    @classmethod
    def IS_CHANGED(cls, **kwargs):return float('nan')
    def build(self,video_vae,audio_vae,asset_id,version_id,width,height,duration):
        import av,numpy as np,torch,nodes,folder_paths
        from .routes import _safe_output_asset,_ffmpeg_executable
        source=_safe_output_asset(asset_id)
        wanted=round(duration*24)
        tail=deque(maxlen=39)
        with av.open(str(source)) as container:
            stream=container.streams.video[0]
            if abs(float(stream.average_rate or 0)-24)>.01:raise ValueError('续接缓存要求24fps视频')
            count=0
            for frame in container.decode(stream):
                if count>=wanted:break
                # A bounded 39-frame window; match the native generation resolution.
                tail.append(frame.reformat(width=int(width),height=int(height),format='rgb24').to_ndarray())
                count+=1
        if count!=wanted or len(tail)!=39:raise ValueError('导入片段有效范围不足，未建立缓存')
        sr=int(getattr(audio_vae,'audio_sample_rate',32000))
        audio_process=subprocess.run([_ffmpeg_executable(),'-v','error','-nostdin','-i',str(source),
            '-ss',str((wanted-39)/24),'-t',str(39/24),'-vn','-ac','2','-ar',str(sr),
            '-f','f32le','pipe:1'],capture_output=True,timeout=60)
        if audio_process.returncode:raise ValueError('无法读取尾部音轨；没有音轨的视频不能自动建立音视频续接缓存')
        pcm=np.frombuffer(audio_process.stdout,dtype=np.float32).copy()
        need=round(39/24*sr)
        if pcm.size<2*need:pcm=np.pad(pcm,(0,2*need-pcm.size))
        waveform=torch.from_numpy(pcm[:need*2].reshape(-1,2).T.copy()).unsqueeze(0)
        images=torch.from_numpy(np.stack(tail)).float()/255
        video=video_vae.encode(images)
        if int(video.shape[2])!=12:raise ValueError('视频VAE尾部帧网格不匹配')
        saver=nodes.NODE_CLASS_MAPPINGS['MiniMaxH3MotionContextSaveLatent']
        helper=sys.modules[saver.__module__]
        audio,_=helper._encode_tail_audio(audio_vae,{'waveform':waveform,'sample_rate':sr},39/24)
        saved=saver().save({'samples':[video,audio]},'CineTimeline/Latents/imported/'+uuid.uuid4().hex,0)[0]
        path=Path(saved).resolve();root=Path(folder_paths.get_output_directory()).resolve()
        result={'asset_id':asset_id,'version_id':version_id,'width':width,'height':height,
                'latent_path':path.relative_to(root).as_posix(),'latent_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        return {'ui':{'text':[json.dumps(result)]},'result':()}

NODE_CLASS_MAPPINGS={'CineImportAVCache':CineImportAVCache}
NODE_DISPLAY_NAME_MAPPINGS={'CineImportAVCache':'CineTimeline｜导入视频续接缓存'}
