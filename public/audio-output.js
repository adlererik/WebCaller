// Use only output devices the browser actually exposes; default is not an earpiece.
export class AudioOutput {
  constructor(element,devices=globalThis.navigator?.mediaDevices,changed=()=>{}){this.element=element;this.devices=devices;this.changed=changed;this.items=[];this.sink='';this.epoch=0;this.video=false;this.voiceSink='';this.tail=Promise.resolve();this.deviceChanged=()=>void this.refresh().catch(()=>{});}
  get supported(){return typeof this.element.setSinkId==='function'&&typeof this.devices?.enumerateDevices==='function';}
  get speaker(){return this.items.find(d=>d.deviceId!=='default'&&/speaker|högtalare|haut.parleur|altavoz/i.test(d.label));}
  get receiver(){return this.items.find(d=>d.deviceId!=='default'&&/earpiece|receiver|handset|hörlur|écouteur/i.test(d.label))||this.items.find(d=>d.deviceId!=='default'&&/headset|headphone|bluetooth|airpods/i.test(d.label));}
  get isSpeaker(){return !!this.speaker&&this.sink===this.speaker.deviceId;}
  async start(video=false){this.video=false;this.initializing=true;this.desiredVideo=video;this.active=true;const epoch=++this.epoch;this.sink=this.element.sinkId||'';this.voiceSink='';this.devices?.addEventListener?.('devicechange',this.deviceChanged);await this.refresh();if(!this.active||this.epoch!==epoch)return;await this.route(this.receiver?.deviceId||'');if(!this.active||this.epoch!==epoch)return;this.initializing=false;await this.setVideo(this.desiredVideo);}
  async refresh(){if(!this.active||!this.supported)return;const epoch=this.epoch,items=(await this.devices.enumerateDevices()).filter(d=>d.kind==='audiooutput');if(!this.active||epoch!==this.epoch)return;this.items=items;if(this.sink&&!items.some(d=>d.deviceId===this.sink))await this.route('');this.changed(this);}
  route(id){
    const epoch=this.epoch;
    const task=this.tail.catch(()=>{}).then(async()=>{if(!this.active||epoch!==this.epoch||!this.supported)return false;if(id===this.sink){this.changed(this);return true;}await this.element.setSinkId(id);if(!this.active||epoch!==this.epoch)return false;this.sink=id;if(!this.video)this.voiceSink=id;this.changed(this);return true;});this.tail=task;return task;
  }
  async choose(){if(!this.active||!this.supported||!this.devices.selectAudioOutput)return false;const epoch=this.epoch;const chosen=await this.devices.selectAudioOutput();if(!this.active||epoch!==this.epoch)return false;await this.refresh();if(!this.active||epoch!==this.epoch)return false;return this.route(chosen.deviceId);}
  async setVideo(video){this.desiredVideo=video;if(!this.active||this.initializing||this.video===video)return;this.video=video;if(video){this.voiceSink=this.sink;if(this.speaker)await this.route(this.speaker.deviceId);}else await this.route(this.voiceSink&&this.items.some(d=>d.deviceId===this.voiceSink)?this.voiceSink:'');this.changed(this);}
  async toggle(){if(this.isSpeaker)return this.route(this.receiver?.deviceId||'');if(this.speaker)return this.route(this.speaker.deviceId);return this.choose();}
  stop(){this.active=false;this.initializing=false;this.desiredVideo=false;this.epoch++;this.devices?.removeEventListener?.('devicechange',this.deviceChanged);this.items=[];this.video=false;this.voiceSink='';this.sink='';this.tail=this.tail.catch(()=>{}).then(()=>this.element.setSinkId?.('')).catch(()=>{});}
}
