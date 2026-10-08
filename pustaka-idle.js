/* Keluar setelah 30 menit tanpa aktivitas manusia, untuk ketiga peran.
   Polling, notifikasi, fokus jendela, dan refresh token bukan aktivitas manusia. */
(()=>{'use strict';
 const cfg=window.PUSTAKA_CONFIG||{};
 if(cfg.mode!=='supabase')return;
 const LIMIT=30*60*1000,WARNING=60*1000;
 const prefix='pustaka-last-activity:'+String(cfg.url||'').replace(/\/$/,'')+':';
 let user='',key='',last=0,timer=0,locked=false,warned=false,lastWrite=0;
 function read(){try{const n=Number(localStorage.getItem(key));return Number.isFinite(n)&&n>0&&n<=Date.now()?n:0;}catch{return 0;}}
 function write(){try{localStorage.setItem(key,String(last));}catch{}lastWrite=Date.now();}
 function removeWarning(){document.querySelector('#idle-warning')?.remove();warned=false;}
 function stop(){clearTimeout(timer);timer=0;user='';key='';last=0;locked=false;removeWarning();}
 function expire(){
  if(locked||!user)return;
  locked=true;clearTimeout(timer);removeWarning();
  const message='Anda keluar otomatis karena tidak ada aktivitas selama 30 menit. Silakan masuk kembali.';
  const revoke=window.PUSTAKA_CLOUD?.logout();
  loginMessage=message;memberAuthMode='login';pendingMember=null;render();
  Promise.resolve(revoke).catch(()=>{});
 }
 function guard(){
  if(!user)return !locked;
  const shared=read();if(shared>last)last=shared;
  if(locked||Date.now()-last>=LIMIT){expire();return false;}
  return true;
 }
 function warning(){
  if(warned||document.hidden)return;
  warned=true;
  const box=document.createElement('div');box.id='idle-warning';box.setAttribute('role','status');
  box.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);width:min(92vw,460px);z-index:10000;background:#edf4ff;border:1px solid #9eb8db;border-radius:16px;padding:16px;color:#233954;box-shadow:0 8px 24px #23395422;line-height:1.5';
  box.textContent='Sesi akan berakhir dalam kurang dari 1 menit karena tidak ada aktivitas. ';
  const button=document.createElement('button');button.type='button';button.className='btn secondary';button.textContent='Tetap masuk';
  button.addEventListener('click',e=>activity(e));box.append(button);document.body.append(box);
 }
 function tick(){
  clearTimeout(timer);if(!user||!guard())return;
  if(Date.now()-last>=LIMIT-WARNING)warning();else removeWarning();
  timer=setTimeout(tick,Math.min(1000,Math.max(1,LIMIT-(Date.now()-last))));
 }
 function activity(e){
  if(!user||!e.isTrusted||document.hidden||!guard())return;
  last=Date.now();if(last-lastWrite>=1000)write();removeWarning();
 }
 function start(id,fresh=false){
  if(!id)return;
  if(user===id&&!fresh){guard();return;}
  stop();user=id;key=prefix+id;last=fresh?Date.now():read()||Date.now();
  write();tick();
 }
 // wheel/touchmove berasal dari interaksi pengguna; scroll programatis oleh
 // antarmuka tidak boleh memperpanjang sesi.
 for(const name of ['pointerdown','keydown','input','wheel','touchmove'])document.addEventListener(name,activity,{capture:true,passive:true});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
 window.addEventListener('focus',()=>tick());
 window.addEventListener('storage',e=>{if(user&&e.key===key)tick();});
 window.PUSTAKA_IDLE={start,stop,guard};
})();
