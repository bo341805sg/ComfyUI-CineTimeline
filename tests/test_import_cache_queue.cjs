const fs=require('fs'),vm=require('vm'),assert=require('assert');
const s=fs.readFileSync(__dirname+'/../web_v90/lib/cine_timeline_099.mjs','utf8');
const method=s.slice(s.indexOf('  async buildImportedCache('),s.indexOf('  async importSegmentVideo('));
const version={version_id:'v',asset_id:'clip.mp4',clip_duration_seconds:15};
const shot={shot_id:'s',metadata:{render:{versions:[version]}}};let sent;
const output={e:{class_type:'CineExactSegment',inputs:{video_vae:['v',0],audio_vae:['a',0]}},
 c:{class_type:'CineTimelineH3ReferenceConditioning',inputs:{width:['r',0],height:['r',1]}},
 v:{class_type:'SelectVAEDevice',inputs:{vae:['load',0]}},load:{class_type:'VAELoader',inputs:{}},
 a:{class_type:'VAELoader',inputs:{}},r:{class_type:'CineNativeResolution',inputs:{}},
 forbidden:{class_type:'SamplerCustomAdvanced',inputs:{}}};
const box={app:{graphToPrompt:async()=>({output})},api:{queuePrompt:async(_,p)=>{sent=p.output;return {prompt_id:'p'}},
 fetchApi:async()=>({ok:true,json:async()=>({p:{outputs:{cine_import_cache:{text:[JSON.stringify({asset_id:'clip.mp4',version_id:'v',latent_path:'tail',latent_sha256:'a'.repeat(64),width:1152,height:640})]}}}})})},setTimeout};
vm.createContext(box);vm.runInContext('this.obj={'+method+'};',box);
Object.assign(box.obj,{node:{graph:{}},state:{shots:[shot]},sync(){},ensureShotRenderMetadata(s){return s.metadata.render}});
box.obj.buildImportedCache(shot,version).then(()=>{assert(!sent.forbidden);assert(!sent.c);assert(!sent.e);assert(sent.load);assert.equal(version.cache_status,'ready');assert.equal(version.latent_path,'tail');console.log('PASS isolated VAE queue and version-bound cache registration')}).catch(e=>{console.error(e);process.exitCode=1});
