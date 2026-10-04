/* Penghubung UI PUSTAKA STAN ke Supabase. Seluruh keputusan transaksi divalidasi SQL. */
(()=>{'use strict';
 const cfg=window.PUSTAKA_CONFIG||{};if(cfg.mode!=='supabase')return;
 const base=String(cfg.url||'').replace(/\/$/,''),key=String(cfg.publishableKey||'');
 const ready=/^https:\/\/[\w.-]+$/.test(base)&&key.length>20;
 const sessionKey='pustaka-supabase-session:'+base;
 let tokens=null,revision=-1,busy=false,timer=0,refreshing=null;
 try{tokens=JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{}
 const localLogin=login,localVerify=verifyPaymentForm,localReceipt=receipt;
 const empty={};for(const name of ['accounts','members','books','copies','loans','requests','rooms','reservations','losses','invoices','payments','bank','reversals','reviews','feedback','arrivals','audit','notifications'])empty[name]=[];
 // Akun demonstrasi tidak dijadikan sumber data ketika koneksi server dipakai.
 role=null;currentMember='';db=structuredClone(empty);
 persistExtra=()=>{};save=()=>{};refreshRoomSchedules=()=>{};
 const errText=x=>{
  const raw=x?.message||x?.msg||x?.error_description||x?.error||'Layanan belum dapat dihubungi.';
  if(typeof raw!=='string')return 'Layanan belum dapat dihubungi.';
  if(raw.includes('pustaka_one_active_copy'))return 'Eksemplar sedang dipinjam. Pilih eksemplar yang tersedia.';
  if(raw.includes('pustaka_pending_title'))return 'Pengajuan judul ini masih menunggu petugas.';
  if(raw.includes('pustaka_one_payment'))return 'Tagihan sudah memiliki pembayaran yang menunggu verifikasi atau telah lunas.';
  if(raw.includes('pustaka_reservations_room'))return 'Jadwal ruang bertabrakan. Pilih waktu atau ruang lain.';
  if(raw.includes('duplicate key'))return 'Data atau referensi transaksi sudah digunakan.';
  return raw.slice(0,350);
 };
 const remember=x=>{tokens={access_token:x.access_token,refresh_token:x.refresh_token,expires_at:Date.now()+(x.expires_in||3600)*1000,user:x.user};localStorage.setItem(sessionKey,JSON.stringify(tokens));};
 async function request(path,body,auth=true,method='POST',raw=false){
  if(!ready)throw Error('Isi URL proyek dan public key pada config.js terlebih dahulu.');
  if(auth)await ensureToken();
  const h={apikey:key,Authorization:'Bearer '+(auth?tokens.access_token:key)};
  if(!raw)h['Content-Type']='application/json';else h['Content-Type']=body.type||'application/octet-stream';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
   const r=await fetch(base+path,{method,headers:h,signal:controller.signal,...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});
   const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(errText(x));return x;
  }catch(e){if(e.name==='AbortError')throw Error('Koneksi terlalu lama. Coba kembali; periksa status transaksi sebelum mengirim ulang.');throw e}finally{clearTimeout(timeout)}
 }
 async function ensureToken(){
  if(!tokens?.access_token)throw Error('Sesi berakhir. Silakan masuk kembali.');
  if(tokens.expires_at>Date.now()+60000)return;
  if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{refresh_token:tokens.refresh_token},false).then(remember).finally(()=>{refreshing=null});
  await refreshing;
 }
 const rpc=(name,body={})=>request('/rest/v1/rpc/'+name,body);
 function apply(x,paint=true){
  if(!x?.session||!['member','officer','admin'].includes(x.session.role))throw Error('Akun tidak memiliki peran layanan yang valid.');
  db=Object.assign(structuredClone(empty),x);revision=x.revision;role=x.session.role;currentMember=x.session.member||'';WHO[role]=x.session.name;
  for(const [k,v] of [['role',role],['member',currentMember],['name',x.session.name],['email',x.session.email]])sessionStorage.setItem('pustaka-'+k+'-ios-v3',v);
  if(!selectedMember||!member(selectedMember))selectedMember=currentMember||db.members[0]?.id||'';
  if(!db.books.some(b=>b.id===selectedBook))selectedBook=db.books[0]?.id||'';
  if(paint)render();else{document.querySelectorAll('.notification-button').forEach(b=>{const count=b.querySelector('.notice-count');if(count)count.remove();if(unreadCount())b.insertAdjacentHTML('beforeend',noticeBadge());b.setAttribute('aria-label','Notifikasi, '+unreadCount()+' belum dibaca')});}
  announcePending();
 }
 login=function(){
  let h=localLogin();h=h.replace(/<div class="demo-identity-actions">.*?<\/div>/s,'').replace(/<div class="entry-footnote">.*?<\/details><\/div>/s,`<div class="entry-footnote"><b>${ready?'Akun layanan':'Konfigurasi belum diisi'}</b><p>${ready?'Anggota masuk menggunakan NIM dan kata sandi. Petugas serta admin menggunakan akun yang diberikan pengelola. Pendaftaran anggota memerlukan verifikasi email.':'Isi config.js setelah menyiapkan Supabase. Halaman ini tidak masuk otomatis menggunakan akun contoh.'}</p></div>`).replace('Prototipe lokal · Bahasa Indonesia','Layanan berbasis akun · Bahasa Indonesia');
  h=h.replace(/<div class="verification-demo">.*?<\/div>/s,'').replace('Kode berlaku 10 menit, dengan maksimal 5 percobaan.','Periksa kotak masuk atau folder spam. Masa berlaku dan batas percobaan mengikuti pengaturan autentikasi layanan.');return h;
 };
 receipt=function(title,items){localReceipt(title,items);const p=document.querySelector('#modal .muted.small');if(p)p.textContent='Catatan layanan · '+fmt(new Date());};
 verifyPaymentForm=function(id){localVerify(id);const p=db.payments.find(x=>x.id===id);if(p?.proof)request('/storage/v1/object/sign/pustaka-proofs/'+p.proof.split('/').map(encodeURIComponent).join('/'),{expiresIn:300}).then(x=>{const url=x.signedURL||x.signedUrl;if(!url)return;const a=document.createElement('a');a.href=url.startsWith('http')?url:base+'/storage/v1'+url;a.target='_blank';a.rel='noopener';a.className='btn secondary';a.textContent='Buka bukti pembayaran (tautan 5 menit)';document.querySelector('#modal form')?.prepend(a);}).catch(e=>toast(e.message));};
 const showFormOld=showForm;showForm=function(title,kind,fields,label){
  if(kind==='staff')fields=fields.replace('Kata sandi contoh','Kata sandi awal staf').replace('minlength="8"','minlength="12"').replace(/Akun ini hanya untuk demonstrasi.*?Gunakan kata sandi contoh\./,'Gunakan kata sandi awal minimal 12 karakter. Sampaikan melalui saluran yang disetujui pengelola.');
  if(kind==='payment')fields=fields.replace('Prototipe menyimpan nama berkas dan tidak memindahkan dana.','Bukti disimpan secara privat dan diperiksa petugas. Pengiriman bukti tidak memindahkan dana.');showFormOld(title,kind,fields,label);
 };
 async function refresh(force=false){
  if(!tokens||busy||document.hidden)return;busy=true;
  try{const rev=force?null:await rpc('pustaka_get_revision');if(force||rev!==revision){const x=await rpc('pustaka_snapshot');const focused=document.activeElement?.matches?.('input,textarea,select');apply(x,!document.querySelector('#modal').open&&!focused);}}
  catch(e){if(/Akun belum aktif|akses dihentikan|sesi|JWT|refresh token/i.test(e.message)){await logout();toast('Sesi berakhir atau hak akses berubah. Silakan masuk kembali.');}}
  finally{busy=false;}
 }
 async function logout(){try{if(tokens)await request('/auth/v1/logout',{})}catch{}tokens=null;localStorage.removeItem(sessionKey);role=null;currentMember='';db=structuredClone(empty);revision=-1;clearTimeout(timer);for(const k of ['role','name','member','email'])sessionStorage.removeItem('pustaka-'+k+'-ios-v3');document.querySelector('#transaction-notice')?.remove();noticeSound.pause();if(document.querySelector('#modal').open)document.querySelector('#modal').close();render();}
 async function schedule(){await refresh();timer=setTimeout(schedule,Math.max(5000,Number(cfg.pollInterval)||8000));}
 async function signIn(d){
  let x;if(d.role==='member')x=await request('/functions/v1/'+(cfg.loginFunction||'pustaka-login'),{nim:d.nim,password:d.password},false);
  else x=await request('/auth/v1/token?grant_type=password',{email:d.email?.trim().toLowerCase(),password:d.password},false);
  remember(x);
  try{const data=await rpc('pustaka_snapshot');if(data.session.role!==d.role)throw Error('Jenis pengguna tidak sesuai akun. Pilih peran yang benar.');if(d.role!=='member'&&data.session.name.trim().toLowerCase()!==d.name?.trim().toLowerCase())throw Error('Nama tidak sesuai akun staf.');apply(data,false);loginMessage='';navigate('dashboard');clearTimeout(timer);timer=setTimeout(schedule,Math.max(5000,Number(cfg.pollInterval)||8000));}
  catch(e){await logout();throw e;}
 }
 const forms=new Set(['login','memberregister','memberverify','staff','request','requestcheckout','borrow','requeststate','return','loss','reviewloss','invoice','issueinvoice','payment','verify','reverse','approvereverse','reserve','cancelroom','roomcheckin','roomcheckout','roomextend','bookreview','feedback','feedbackreply','profile','member','memberstate','contact','book','copy','arrival','publisharrival','cancelarrival','accessupdate']);
 document.addEventListener('submit',async e=>{
  const f=e.target.closest('form[data-form]');if(!f||!forms.has(f.dataset.form))return;e.preventDefault();e.stopImmediatePropagation();
  const b=f.querySelector('[type=submit]');if(b?.disabled)return;if(b)b.disabled=true;
  try{
   const kind=f.dataset.form,d=Object.fromEntries(new FormData(f));
   if(kind==='login'){await signIn(d);return;}
   if(kind==='memberregister'){
    if(!/^\d{9,15}$/.test(d.nim||'')||d.name?.trim().length<3||!/^\S+@\S+\.\S+$/.test(d.email||'')||d.password?.length<8||d.password!==d.confirmPassword)throw Error('Lengkapi nama, NIM, email, serta kata sandi dan ulangannya yang sama.');
    const result=await request('/auth/v1/signup',{email:d.email.trim().toLowerCase(),password:d.password,data:{full_name:d.name.trim(),nim:d.nim.trim()}},false);
    if(result.access_token)throw Error('Konfirmasi email wajib diaktifkan pada pengaturan Supabase sebelum pendaftaran digunakan.');
    pendingMember={email:d.email.trim().toLowerCase(),nim:d.nim,lastSent:Date.now()};memberAuthMode='verify';loginMessage='';render();return;
   }
   if(kind==='memberverify'){
    if(!pendingMember||!/^\d{6}$/.test(d.code||''))throw Error('Masukkan kode 6 angka dari email.');
    const x=await request('/auth/v1/verify',{email:pendingMember.email,token:d.code,type:'email'},false);
    if(!x.access_token)throw Error('Kode belum dapat diverifikasi.');
    // Verifikasi diikuti formulir masuk agar alur NIM + kata sandi tetap jelas.
    remember(x);await request('/auth/v1/logout',{});tokens=null;localStorage.removeItem(sessionKey);pendingMember=null;memberAuthMode='login';render();toast('Email berhasil diverifikasi. Silakan masuk dengan NIM dan kata sandi.');return;
   }
   if(kind==='staff'){
    await request('/functions/v1/'+(cfg.loginFunction||'pustaka-login'),{action:'staff',name:d.name,email:d.email,password:d.password,role:d.role==='Admin'?'admin':'officer'});await refresh(true);close();toast('Akun staf berhasil dibuat.');return;
   }
   if(kind==='payment'){
    const file=f.elements.proof.files[0];if(!file||file.size>5*1024*1024||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('Gunakan bukti PDF, JPG, atau PNG maksimal 5 MB.');
    const path=tokens.user.id+'/'+crypto.randomUUID()+({ 'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png'}[file.type]);
    await request('/storage/v1/object/pustaka-proofs/'+path,file,true,'POST',true);d.proof=path;
   }
   if(kind==='profile'){
    const file=f.elements.photo.files[0];d.photo=d.removePhoto==='yes'?'':profileData().photo||'';if(file)d.photo=await imageData(file);delete d.removePhoto;
   }
   if(kind==='arrival'){
    const file=f.elements.cover.files[0];d.image=db.arrivals.find(x=>x.id===d.id)?.image||'';
    if(file){if(file.size>1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Gunakan sampul JPG/PNG/WebP maksimal 1 MB.');d.image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Berkas tidak dapat dibaca.'));r.readAsDataURL(file);});}
   }
   const result=await rpc('pustaka_action',{kind,d});close();apply(result.snapshot);
   if(kind==='request')showRequestPostcard(result.id);
   else if(['requestcheckout','borrow'].includes(kind))showLoanPostcard(result.loanIds);
   else if(kind==='return')showReturnPostcard([result.id]);
   else if(kind==='verify'&&d.decision==='Terverifikasi')showPaymentDocument(result.id);
   else if(kind==='reserve'){const r=db.reservations.find(x=>x.id===result.id);receipt('Konfirmasi pemesanan ruang',[['Referensi',r.id],['Ruang',db.rooms.find(x=>x.id===r.room)?.name],['Tanggal',fmt(r.date)],['Waktu',r.start+'–'+r.end+' WIB'],['Status','Terkonfirmasi · menunggu verifikasi hadir petugas']]);}
   else toast('Perubahan tersimpan. Referensi: '+result.id);
  }catch(err){const box=f.querySelector('.error');if(box){box.textContent=err.message;box.classList.add('show')}else toast(err.message);}
  finally{if(b)b.disabled=false;}
 },true);
 document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action]');if(!el)return;const [a,id]=el.dataset.action.split(':');
  if(!['logout','reset','filldemo','fillmember','authresend','noticesread','noticeopen'].includes(a))return;e.preventDefault();e.stopImmediatePropagation();
  try{
   if(a==='logout'){await logout();return;}
   if(['reset','filldemo','fillmember'].includes(a)){toast('Mode layanan menggunakan akun dan data Supabase. Buka HTML pratinjau untuk mencoba profil contoh.');return;}
   if(a==='authresend'){if(!pendingMember)throw Error('Isi data pendaftaran terlebih dahulu.');if(Date.now()-pendingMember.lastSent<60000)throw Error('Tunggu 60 detik sebelum meminta kode baru.');await request('/auth/v1/resend',{type:'signup',email:pendingMember.email},false);pendingMember.lastSent=Date.now();toast('Permintaan kode baru telah dikirim. Periksa email.');return;}
   const ns=a==='noticesread'?memberNotices():db.notifications.filter(n=>n.id===id);if(!ns.length)return;
   await rpc('pustaka_read_notices',{ids:ns.map(n=>n.id)});ns.forEach(markNoticeRead);
   if(a==='noticesread'){notificationCenter();return;}
   const n=ns[0];document.querySelector('#transaction-notice')?.remove();if(document.querySelector('#modal').open)close();navigate(n.route);if(n.key?.startsWith('Terima pengembalian')&&canReviewLoan(loan(n.ref)))showReturnPostcard([n.ref]);
  }catch(err){toast(err.message);}
 },true);
 window.addEventListener('storage',e=>{if(e.key==='pustaka-ios-v3')e.stopImmediatePropagation();},true);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});window.addEventListener('focus',()=>refresh(true));
 window.PUSTAKA_CLOUD={refresh:()=>refresh(true),connected:ready};
 render();
 if(ready&&tokens)(async()=>{try{await ensureToken();apply(await rpc('pustaka_snapshot'));timer=setTimeout(schedule,Math.max(5000,Number(cfg.pollInterval)||8000));}catch{await logout();}})();
})();
