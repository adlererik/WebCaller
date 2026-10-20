// Bounded, foreground RTP probes, using the browser's congestion controller.
// Never changes voice parameters or generates competing HTTP probe traffic.
export const VIDEO_PROBE_INTERVAL=15000,VIDEO_PROBE_WINDOW=3000;
export const healthyAudio=s=>s.audioFlow===true&&s.connected===true&&s.loss<.03&&s.rtt<.5&&s.jitter<.04;
export function fitVideo(p){
  if(p.video>0&&p.video<15000){p.width=160;p.height=90;p.fps=Math.min(p.fps,2);}
  else if(p.video>0&&p.video<45000){p.width=160;p.height=90;p.fps=Math.min(p.fps,4);}
  else if(p.video>0&&p.video<90000){p.width=Math.min(p.width,240);p.height=Math.min(p.height,135);p.fps=Math.min(p.fps,6);}
  else if(p.video>0&&p.video<300000){p.width=Math.min(p.width,320);p.height=Math.min(p.height,180);p.fps=Math.min(p.fps,12);}
  return p;
}
export function videoRecovery(){
  let rate=0,until=0,next=0;
  const reset=()=>{rate=until=next=0;};
  return {reset,
    budget(base,ceiling,stats,{now=Date.now(),stable=0,wanted=false,sharing=false}={}){
      const p={...base};
      if(!wanted||sharing||!healthyAudio(stats)){
        if(rate)next=now+VIDEO_PROBE_INTERVAL;rate=0;until=0;
        if(wanted&&(stats.loss>.03||stats.rtt>.5||stats.jitter>.04))p.video=Math.min(p.video,45000);
        return fitVideo(p);
      }
      if(base.video>=ceiling.video){reset();return p;}
      // Do not add even a tiny probe when the estimate cannot cover voice.
      const room=!Number.isFinite(stats.bandwidth)||stats.bandwidth>=base.audio*1.5+6000;
      if(stable<5||!room)return fitVideo(p);
      if(rate&&now>=until){
        const progress=Number.isFinite(stats.videoUploadKbps)&&stats.videoUploadKbps>=Math.min(6,rate/4000);
        if(!progress){rate=0;next=now+VIDEO_PROBE_INTERVAL;return fitVideo(p);}
        rate=Math.min(ceiling.video,Math.max(base.video,rate+Math.min(25000,Math.max(6000,rate*.5))));until=now+VIDEO_PROBE_WINDOW;
      }
      if(!rate&&now>=next){rate=Math.min(ceiling.video,Math.max(6000,base.video+Math.min(15000,base.video*.25)));until=now+VIDEO_PROBE_WINDOW;}
      if(rate){p.video=Math.min(ceiling.video,Math.max(base.video,Math.round(rate)));p.width=ceiling.width;p.height=ceiling.height;p.fps=ceiling.fps;p.videoProbing=true;}
      return fitVideo(p);
    }
  };
}
