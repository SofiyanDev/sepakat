// =====================================================================
// SEPAKAT - versi tersambung database (HTML/CSS/JS + PHP + MySQL)
// Semua data diambil dari folder api/ (PHP), tidak lagi dari localStorage
// =====================================================================
const USERS={dosen:{label:"Dosen"},mahasiswa:{label:"Mahasiswa"},admin:{label:"Fakultas/Admin"}};
const PERAN={dosen:"dosen",mahasiswa:"mahasiswa",fakultas_admin:"admin"};
const JAM=["07.30-10.00","10.00-12.30","12.30-15.00","15.00-17.30"];
let MK=[],RUANG=[],TERISI={};
const terisi=(h,r,j)=>TERISI[h]?.[r]?.[j]||null;
let TODAY=(()=>{const d=new Date();d.setHours(0,0,0,0);return d})();
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const tglPlus=n=>{const d=new Date(TODAY);d.setDate(d.getDate()+n);return ymd(d)};
const fmtTgl=t=>{const [y,m,d]=t.split("-");return `${d}-${m}-${y}`};
const HARI=["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const hariDari=t=>HARI[new Date(t+"T00:00:00").getDay()];
let state={user:null,view:null,sesi:null,pengajuan:[],notif:[],siap:false};

// ===== Panggil API PHP =====
async function api(file,data){
  const opt=data?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{};
  let res;
  try{res=await fetch("api/"+file,{credentials:"same-origin",...opt});}
  catch(e){return {ok:false,pesan:"Server tidak bisa dihubungi. Buka lewat http://localhost/sepakat dan pastikan Apache menyala."}}
  let j;try{j=await res.json()}catch(e){return {ok:false,pesan:"Respon server tidak valid (cek error PHP)."}}
  if(res.status===401&&file!=="login.php"){state.sesi=null;go(null)}
  return j;
}
// Ambil semua data dari database sesuai peran yang login
async function muat(){
  const d=await api("data.php");
  if(!d.ok){state.sesi=null;state.siap=true;return false}
  state.sesi=d.user;MK=d.mk;RUANG=d.ruang;TERISI=d.terisi||{};state.pengajuan=d.pengajuan;state.notif=d.notif;
  TODAY=new Date(d.hariIni+"T00:00:00");
  const r=PERAN[d.user.peran];USERS[r].name=d.user.nama;if(d.user.kelas)USERS[r].kelas=d.user.kelas;
  state.siap=true;return true;
}
// Cek notifikasi baru tiap 20 detik -> pop-up di layar HP/laptop (FR-01)
async function cekNotif(){
  if(!state.sesi)return;
  const d=await api("notifikasi.php");if(!d.ok||!d.baru.length)return;
  d.baru.forEach(n=>{notifHP("SEPAKAT",n.isi);toast(n.isi)});
  await api("notifikasi.php",{ids:d.baru.map(n=>n.id)});
  await muat();render();
}
setInterval(cekNotif,20000);
const MAKS=3;
const pct=p=>p.pemilih?Math.round(p.setuju/p.pemilih*100):0;
const lolos=p=>pct(p)>50;
const hariKe=t=>Math.round((new Date(t+"T00:00:00")-TODAY)/864e5);
const batasVoting=p=>{const d=new Date(p.tgl+"T00:00:00");d.setDate(d.getDate()-7);return ymd(d)};
const sisaHari=p=>hariKe(batasVoting(p));
const hitungMundur=p=>{const n=sisaHari(p);return n<0?`Voting ditutup ${fmtTgl(batasVoting(p))}`:n===0?`Voting ditutup hari ini (${fmtTgl(batasVoting(p))})`:`Sisa ${n} hari · tutup ${fmtTgl(batasVoting(p))}`};

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const mk=k=>MK.find(m=>m.kode===k)||{};
const pill=st=>({menunggu:'<span class="pill p-wait">Menunggu keputusan</span>',voting:'<span class="pill p-vote">Voting berjalan</span>',disetujui:'<span class="pill p-ok">Disetujui</span>',ditolak:'<span class="pill p-bad">Ditolak</span>'}[st]);
const fr=(...ids)=>`<div class="row">${ids.map(i=>`<span class="frtag">${i}</span>`).join("")}</div>`;
// ===== Notifikasi pop-up di layar HP/laptop (FR-01) =====
const notifOK=()=>{try{return "Notification" in window}catch(e){return false}};
const notifIzin=()=>notifOK()?Notification.permission:"tidak-didukung";
function notifHP(judul,isi){
  if(notifIzin()!=="granted")return;
  const opt={body:isi,icon:"icon-192.png",badge:"icon-192.png",tag:"sepakat-"+Date.now(),vibrate:[200,100,200]};
  try{
    if(navigator.serviceWorker&&navigator.serviceWorker.controller){navigator.serviceWorker.ready.then(r=>r.showNotification(judul,opt));}
    else{new Notification(judul,opt);}
  }catch(e){}
}
async function aktifkanNotif(){
  if(!notifOK()){toast("Browser ini belum mendukung notifikasi");return}
  try{const r=await Notification.requestPermission();
    if(r==="granted"){toast("Notifikasi HP aktif");notifHP("SEPAKAT","Notifikasi aktif. Usulan perubahan jadwal akan muncul di layar.")}
    else toast("Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.");
  }catch(e){toast("Notifikasi tidak bisa diaktifkan di halaman ini")}
  render();
}
function toast(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(t._t);t._t=setTimeout(()=>t.hidden=true,2400)}

const NAV={
  dosen:[["dashboard","Beranda"],["ajukan","Ajukan Perubahan"],["riwayat","Status Pengajuan"],["jadwal","Jadwal Saya"]],
  mahasiswa:[["dashboard","Beranda"],["voting","Voting Perubahan"],["keberatan","Ajukan Keberatan"],["jadwal","Jadwal Final"]],
  admin:[["dashboard","Beranda"],["keputusan","Keputusan Perubahan"],["rekap","Rekap Voting"],["jadwal","Jadwal Final"]]
};

// ===== Router (#dosen-ajukan dst. untuk screenshot) =====
function go(role,view){location.hash=role?`${role}-${view}`:"login"}
function route(){
  const h=location.hash.slice(1);
  const [r,...v]=h.split("-");
  const milik=state.sesi?PERAN[state.sesi.peran]:null;
  if(milik&&r!==milik){go(milik,"dashboard");return}
  if(milik){state.user=r;state.view=v.join("-")||"dashboard";if(!NAV[r].some(n=>n[0]===state.view))state.view="dashboard"}
  else state.user=null;
  render();
}
addEventListener("hashchange",route);

function render(){
  const app=$("#app");
  if(!state.siap){app.innerHTML='<div class="login"><p class="note">Memuat data...</p></div>';return}
  if(!state.user){app.innerHTML=loginView();bindLogin();return}
  const u=USERS[state.user];
  const badge=k=>{const n=countFor(k);return n?`<span class="count">${n}</span>`:""};
  app.innerHTML=`
  <header class="top">
    <div class="logo"><i>S</i><div>SEPAKAT<small>Sistem Penyesuaian Jadwal Kuliah Terpadu</small></div></div>
    <div class="who">${state.user==="mahasiswa"?`<a class="bell" href="#mahasiswa-dashboard" aria-label="Notifikasi">🔔<span>${countFor("notif")||countFor("voting")}</span></a>`:""}<span><b>${esc(u.name)}</b> · ${u.label}${state.user==="mahasiswa"?" "+USERS.mahasiswa.kelas:""}</span><button class="btn-ghost" id="out">Keluar</button></div>
  </header>
  <div class="shell">
    <nav class="side"><div class="role">Menu ${u.label}</div>
      ${NAV[state.user].map(([k,l])=>`<button data-v="${k}" class="${k===state.view?"on":""}">${l}${badge(k)}</button>`).join("")}
    </nav>
    <main>${VIEWS[state.user][state.view]()}</main>
  </div>`;
  $("#out").onclick=async()=>{await api("logout.php",{});state.sesi=null;go(null);toast("Berhasil keluar")};
  document.querySelectorAll("nav.side button").forEach(b=>b.onclick=()=>go(state.user,b.dataset.v));
  (BIND[state.user]?.[state.view]||(()=>{}))();
}
function countFor(k){
  if(state.user==="mahasiswa"&&k==="notif")return state.notif.filter(n=>!n.dibaca).length;
  if(state.user==="mahasiswa"&&k==="voting")return state.pengajuan.filter(p=>p.status==="voting"&&p.kelas===USERS.mahasiswa.kelas&&!p.myVote).length;
  if(state.user==="admin"&&k==="keputusan")return state.pengajuan.filter(p=>p.status==="menunggu"||p.status==="voting").length;
  return 0;
}

// ===== Login =====
let pickRole="dosen";
function loginView(){return `
  <div class="login">
    <div class="brandbig"><h1>SEPAKAT</h1><p>Sistem Penyesuaian Jadwal Kuliah Terpadu</p></div>
    <form class="panel" id="lf" novalidate>
      <h2 style="font-size:17px">Masuk ke sistem</h2>
      <div class="roles">${["dosen","mahasiswa","admin"].map(r=>`<button type="button" data-r="${r}" class="${r===pickRole?"on":""}">${USERS[r].label}</button>`).join("")}</div>
      <label for="lu">Username / NIDN / NPM<input id="lu" required placeholder="contoh: ${pickRole==="mahasiswa"?"2510631250013":pickRole==="dosen"?"0412038801":"admin"}" autocomplete="username"></label>
      <label for="lp">Password<input id="lp" type="password" required placeholder="••••••••" autocomplete="current-password"></label>
      <p class="note" id="lerr" hidden style="color:var(--bad)">Username dan password wajib diisi.</p>
      <button class="btn" type="submit">Masuk</button>
      <p class="note">Akun contoh: password semua <b>sepakat123</b>. Dosen 0412038801 · Mahasiswa 2510631250013 · Fakultas admin</p>
    </form>
  </div>`}
function bindLogin(){
  document.querySelectorAll(".roles button").forEach(b=>b.onclick=()=>{pickRole=b.dataset.r;render()});
  $("#lf").addEventListener("submit",async e=>{e.preventDefault();
    const err=$("#lerr");
    if(!$("#lu").value.trim()||!$("#lp").value.trim()){err.textContent="Username dan password wajib diisi.";err.hidden=false;return}
    const peran=pickRole==="admin"?"fakultas_admin":pickRole;
    const r=await api("login.php",{username:$("#lu").value.trim(),password:$("#lp").value,peran});
    if(!r.ok){err.textContent=r.pesan;err.hidden=false;return}
    await muat();go(pickRole,"dashboard");toast(`Masuk sebagai ${r.user.nama}${r.user.kelas?" · "+r.user.kelas:""}`)});
}

// ===== Komponen =====
function shiftBox(p){return `<div class="shift"><div class="slot"><small>Jadwal lama</small>${esc(p.lama)}</div><div class="arrow" aria-hidden="true">→</div><div class="slot new"><small>Usulan baru · ${esc(p.tgl)}</small>${esc(p.baru)} · ${esc(p.ruang)}</div></div>`}
function voteBar(p){const v=pct(p);return `<div><div class="row" style="justify-content:space-between;font-size:12px"><span><b style="color:var(--ok)">${p.setuju} setuju</b> · <b style="color:var(--bad)">${p.tolak} tidak setuju</b> · ${p.pemilih-p.setuju-p.tolak} belum memilih</span><span class="code">${v}% (batas >50%)</span></div><div class="bar" title="${v}% setuju"><i style="width:${v}%"></i></div></div>`}
function tablePengajuan(list,actions){
  if(!list.length)return `<div class="empty">Belum ada pengajuan.</div>`;
  return `<div class="tbl"><table><thead><tr><th>ID</th><th>Mata kuliah</th><th>Kelas</th><th>Perubahan</th><th>Voting</th><th>Status</th>${actions?"<th></th>":""}</tr></thead><tbody>
  ${list.map(p=>`<tr><td class="code">${p.id}</td><td>${esc(mk(p.kode).nama)}</td><td>${p.kelas}</td><td>${esc(p.lama)}<br><b>→ ${esc(p.baru)}</b></td><td class="code">${pct(p)}%</td><td>${pill(p.status)}</td>${actions?`<td>${actions(p)}</td>`:""}</tr>`).join("")}
  </tbody></table></div>`}
function calendar(kelasFilter){
  const days=["Senin","Selasa","Rabu","Kamis","Jumat"];
  const items=MK.filter(m=>(!kelasFilter||m.kelas===kelasFilter)&&(state.user!=="dosen"||m.milikSaya)).map(m=>{
    const ch=state.pengajuan.find(p=>p.kode===m.kode&&p.status==="disetujui"&&hariKe(p.tgl)>=-7);
    if(ch){const [h,j]=ch.baru.split(" ");return {...m,hari:h,jam:j,chg:true}}return m});
  return `<div class="tbl"><div class="cal">${days.map(d=>`<div class="d">${d}</div>`).join("")}
  ${days.map(d=>`<div style="display:grid;gap:8px;align-content:start">${items.filter(i=>i.hari===d).map(i=>`<div class="c ${i.chg?"chg":""}"><b>${esc(i.nama)}</b>${i.jam} · ${i.ruang}<br><span class="code">${i.kelas}${i.chg?" · berubah":""}</span></div>`).join("")||'<div class="note">-</div>'}</div>`).join("")}
  </div></div><p class="note">Kotak oranye = jadwal yang sudah diubah dan disahkan.</p>`}

// ===== VIEWS =====
const VIEWS={
 dosen:{
  dashboard(){const mine=state.pengajuan;return `
   <div class="head"><div><h1>Halo, ${esc(USERS.dosen.name.split(",")[0])}</h1><p>Ringkasan pengajuan perubahan jadwal Anda.</p></div><button class="btn" onclick="go('dosen','ajukan')">+ Ajukan Perubahan</button></div>
   <div class="stats"><div class="stat"><span>Total pengajuan</span><b>${mine.length}</b></div><div class="stat"><span>Voting berjalan</span><b>${mine.filter(p=>p.status==="voting").length}</b></div><div class="stat"><span>Menunggu keputusan</span><b>${mine.filter(p=>p.status==="menunggu").length}</b></div><div class="stat"><span>Disetujui</span><b>${mine.filter(p=>p.status==="disetujui").length}</b></div></div>
   <div class="panel"><h2 style="font-size:16px;margin-bottom:10px">Pengajuan terbaru</h2>${tablePengajuan(mine.slice(0,3))}</div>`},
  ajukan(){return `
   <div class="head"><div><h1>Ajukan Perubahan Jadwal</h1><p>Usulan akan dikirim ke mahasiswa kelas terkait untuk voting.</p></div>${fr("FR-03","FR-04","FR-07","FR-08")}</div>
   <div class="rule"><span>ℹ</span><span>Batas pengajuan paling lambat <b>H-7</b> sebelum tanggal kuliah pengganti. Jika voting tidak lolos, pengajuan ulang maksimal <b>${MAKS}x</b>.</span></div>
   <form class="panel grid" id="fa" novalidate>
     <label class="full" for="fmk">Mata kuliah & kelas<select id="fmk">${MK.filter(m=>m.milikSaya).map(m=>`<option value="${m.kode}">${esc(m.nama)} · ${m.kelas}</option>`).join("")}</select></label>
     <label for="flama">Jadwal saat ini<input id="flama" readonly></label>
     <label for="ftgl">Tanggal kuliah pengganti<input id="ftgl" type="date" value="${tglPlus(14)}"></label>
     <label for="fhari">Hari baru (otomatis dari tanggal)<input id="fhari" readonly></label>
     <label for="fke">Pengajuan ke-<input id="fke" readonly></label>
     <div class="full" style="display:grid;gap:8px"><b style="font-size:12px;color:var(--muted)">Pilih ruang & slot waktu yang kosong</b>
       <div class="tbl"><div class="avail" id="grid"></div></div>
       <div class="legend"><span><i style="background:var(--ok-soft);border:1px solid var(--ok)"></i>Kosong (bisa dipilih)</span><span><i style="background:var(--bad-soft)"></i>Terisi (dikunci)</span><span id="pilihan">Belum memilih slot</span></div></div>
     <label class="full" for="falasan">Alasan perubahan<textarea id="falasan" placeholder="contoh: Dosen mengikuti seminar nasional."></textarea></label>
     <p class="note full" id="ferr" hidden style="color:var(--bad)"></p>
     <div class="row full"><button class="btn" type="submit">Kirim Pengajuan</button><button class="btn sec" type="reset">Batal</button></div>
   </form>`},
  riwayat(){return `
   <div class="head"><div><h1>Status Pengajuan</h1><p>Pantau hasil voting, keberatan, dan keputusan fakultas.</p></div>${fr("FR-06","FR-09","FR-10")}</div>
   <div class="card-list">${state.pengajuan.map(p=>`<div class="vcard"><div class="meta"><div><span class="code">${p.id} · pengajuan ke-${p.ke} · ${p.status==="voting"?hitungMundur(p):p.status==="menunggu"?"menunggu fakultas membuka voting":"hasil voting "+pct(p)+"%"}</span><h3>${esc(mk(p.kode).nama)} · ${p.kelas}</h3></div>${pill(p.status)}</div>${shiftBox(p)}${voteBar(p)}${p.keberatan.length?`<p class="note"><b>${p.keberatan.length} keberatan</b>: ${p.keberatan.map(k=>esc(k.isi)).join(" | ")}</p>`:""}</div>`).join("")}</div>`},
  jadwal(){return `<div class="head"><div><h1>Jadwal Saya</h1><p>Jadwal mengajar minggu ini.</p></div></div><div class="panel">${calendar()}</div>`}
 },
 mahasiswa:{
  dashboard(){const k=USERS.mahasiswa.kelas;const open=state.pengajuan.filter(p=>p.kelas===k&&p.status==="voting");return `
   <div class="head"><div><h1>Halo, ${esc(USERS.mahasiswa.name)}</h1><p>Kelas ${k} · ada ${open.filter(p=>!p.myVote).length} usulan perubahan yang butuh suara Anda.</p></div>${fr("FR-01","FR-02")}</div>
   <div class="panel" style="display:grid;gap:8px"><div class="row" style="justify-content:space-between"><h2 style="font-size:16px">Notifikasi terbaru</h2>${notifIzin()==="granted"?'<span class="pill p-ok">Notifikasi HP aktif</span>':notifIzin()==="tidak-didukung"?'<span class="note">Notifikasi HP: buka lewat website/HP</span>':'<button class="btn" type="button" id="btnNotif">Aktifkan notifikasi HP</button>'}</div>
   ${state.notif.map(n=>`<div class="rule" style="background:${n.dibaca?"var(--info-soft)":"var(--accent-soft)"}"><span>🔔</span><span>${esc(n.isi)} <span class="note">· ${esc(n.waktu.slice(0,16))}</span>${/Silakan beri suara/.test(n.isi)?' <a href="#mahasiswa-voting">Beri suara</a>':""}</span></div>`).join("")||'<div class="empty">Belum ada notifikasi.</div>'}</div>
   <div class="panel"><h2 style="font-size:16px;margin-bottom:10px">Riwayat perubahan jadwal</h2>${tablePengajuan(state.pengajuan.filter(p=>p.kelas===k),p=>`<span class="note">${esc(p.alasan)}</span>`)}</div>
   <div class="panel"><h2 style="font-size:16px;margin-bottom:10px">Jadwal kelas ${k}</h2>${calendar(k)}</div>`},
  voting(){const k=USERS.mahasiswa.kelas;const list=state.pengajuan.filter(p=>p.kelas===k&&p.status==="voting");return `
   <div class="head"><div><h1>Voting Perubahan Jadwal</h1><p>Hanya usulan untuk kelas <b>${USERS.mahasiswa.kelas}</b>. Lolos jika suara setuju <b>lebih dari 50%</b> dari seluruh kelas. Voting ditutup otomatis pada <b>H-7</b>.</p></div>${fr("FR-05","FR-06","FR-10")}</div>
   <div class="card-list">${list.length?list.map(p=>`<div class="vcard"><div class="meta"><div><span class="code">${p.id} · ${hitungMundur(p)}</span><h3>${esc(mk(p.kode).nama)}</h3></div>${pill(p.status)}</div>${shiftBox(p)}<p class="note">Alasan dosen: ${esc(p.alasan)}</p>${voteBar(p)}
     <div class="row">${p.myVote?`<span class="pill ${p.myVote==="setuju"?"p-ok":"p-bad"}">Suara Anda: ${p.myVote==="setuju"?"Setuju":"Tidak setuju"}</span>`:`<button class="btn ok" data-vote="setuju" data-id="${p.id}">Setuju</button><button class="btn bad" data-tolak="${p.id}">Tidak setuju</button>`}<a class="btn sec" style="text-decoration:none" href="#mahasiswa-keberatan">Ajukan keberatan</a></div>
     <div class="tolakbox" id="tb-${p.id}" hidden style="display:grid;gap:8px"><label for="ta-${p.id}">Alasan tidak setuju (wajib)<textarea id="ta-${p.id}" placeholder="contoh: Selasa sore ada jadwal kerja part-time."></textarea></label><p class="note" id="te-${p.id}" hidden style="color:var(--bad)">Alasan tidak setuju wajib diisi.</p><div class="row"><button class="btn bad" data-vote="tolak" data-id="${p.id}">Kirim suara tidak setuju</button></div></div>
     ${p.myVote==="tolak"&&p.alasanSaya?`<p class="note">Alasan Anda: ${esc(p.alasanSaya)}</p>`:""}</div>`).join(""):`<div class="panel empty">Tidak ada voting yang berjalan.</div>`}</div>`},
  keberatan(){const k=USERS.mahasiswa.kelas;const list=state.pengajuan.filter(p=>p.kelas===k&&p.status==="voting");return `
   <div class="head"><div><h1>Ajukan Keberatan</h1><p>Sampaikan alasan kendala dan opsi jadwal alternatif sebelum jadwal baru dikunci. Keberatan dihitung sebagai suara <b>tidak setuju</b>.</p></div>${fr("FR-09")}</div>
   <form class="panel grid" id="fk" novalidate>
     <label class="full" for="kp">Usulan perubahan<select id="kp">${list.map(p=>`<option value="${p.id}">${p.id} · ${esc(mk(p.kode).nama)} → ${esc(p.baru)}</option>`).join("")||"<option value=''>Tidak ada usulan aktif</option>"}</select></label>
     <label for="kj">Jenis keberatan<select id="kj"><option>Bentrok dengan jadwal kuliah lain</option><option>Bentrok dengan kegiatan akademik</option><option>Kendala transportasi/waktu</option><option>Lainnya</option></select></label>
     <label for="kn">Nama<input id="kn" value="${esc(USERS.mahasiswa.name)}" readonly></label>
     <label class="full" for="kalt">Opsi jadwal alternatif (opsional)<select id="kalt"><option value="">Tidak ada</option>${["Senin","Selasa","Rabu","Kamis","Jumat"].flatMap(h=>JAM.map(j=>`<option>${h} ${j}</option>`)).join("")}</select></label>
     <label class="full" for="ki">Alasan keberatan<textarea id="ki" placeholder="contoh: Rabu 10.00 bentrok dengan Sistem Informasi Akuntansi dan Keuangan."></textarea></label>
     <p class="note full" id="kerr" hidden style="color:var(--bad)">Alasan keberatan wajib diisi.</p>
     <div class="row full"><button class="btn" type="submit">Kirim Keberatan</button></div>
   </form>`},
  jadwal(){return `<div class="head"><div><h1>Jadwal Final</h1><p>Jadwal kelas ${USERS.mahasiswa.kelas} setelah perubahan disahkan fakultas.</p></div></div><div class="panel">${calendar(USERS.mahasiswa.kelas)}</div>`}
 },
 admin:{
  dashboard(){const P=state.pengajuan;return `
   <div class="head"><div><h1>Dashboard Fakultas</h1><p>Pantau seluruh pengajuan perubahan jadwal.</p></div></div>
   <div class="stats"><div class="stat"><span>Masuk</span><b>${P.length}</b></div><div class="stat"><span>Voting berjalan</span><b>${P.filter(p=>p.status==="voting").length}</b></div><div class="stat"><span>Perlu keputusan</span><b>${P.filter(p=>p.status==="menunggu").length}</b></div><div class="stat"><span>Disahkan</span><b>${P.filter(p=>p.status==="disetujui").length}</b></div></div>
   <div class="panel"><h2 style="font-size:16px;margin-bottom:10px">Semua pengajuan</h2>${tablePengajuan(P)}</div>`},
  keputusan(){const list=state.pengajuan.filter(p=>p.status==="menunggu"||p.status==="voting");return `
   <div class="head"><div><h1>Keputusan Perubahan</h1><p>Fakultas membuka voting. Hasil akhir ditentukan otomatis oleh voting mahasiswa saat ditutup H-7.</p></div>${fr("FR-06","FR-08")}</div>
   <div class="card-list">${list.length?list.map(p=>`<div class="vcard"><div class="meta"><div><span class="code">${p.id} · pengajuan ke-${p.ke} dari ${MAKS} · ${p.status==="voting"?hitungMundur(p):"belum dibuka"}</span><h3>${esc(mk(p.kode).nama)} · ${p.kelas}</h3></div>${pill(p.status)}</div>${shiftBox(p)}${p.status==="voting"?voteBar(p):""}
     ${p.status==="voting"?`<p class="note">Perkiraan hasil saat ini: <b style="color:${lolos(p)?"var(--ok)":"var(--bad)"}">${lolos(p)?"LOLOS (>50%)":"TIDAK LOLOS"}</b> · Keberatan: ${p.keberatan.length}</p>`:""}${p.keberatan.map(k=>`<p class="note">• ${esc(k.nama)}: ${esc(k.isi)}</p>`).join("")}
     <div class="row">${p.status==="menunggu"?`<button class="btn ok" data-dec="voting" data-id="${p.id}">Buka voting</button><button class="btn bad" data-dec="ditolak" data-id="${p.id}">Tolak pengajuan</button>`:`<button class="btn sec" data-dec="tutup" data-id="${p.id}">Tutup voting sekarang (simulasi H-7)</button>`}</div></div>`).join(""):`<div class="panel empty">Semua pengajuan sudah diputuskan.</div>`}</div>`},
  rekap(){return `
   <div class="head"><div><h1>Rekap Voting</h1><p>Persentase suara setuju per pengajuan, dihitung otomatis.</p></div>${fr("FR-06")}</div>
   <div class="panel"><div class="tbl"><table><thead><tr><th>ID</th><th>Mata kuliah</th><th>Setuju</th><th>Tidak</th><th>Belum</th><th>%</th><th>Hasil</th></tr></thead><tbody>
   ${state.pengajuan.map(p=>`<tr><td class="code">${p.id}</td><td>${esc(mk(p.kode).nama)}</td><td>${p.setuju}</td><td>${p.tolak}</td><td>${p.pemilih-p.setuju-p.tolak}</td><td class="code">${pct(p)}%</td><td>${lolos(p)?'<span class="pill p-ok">Lolos</span>':'<span class="pill p-bad">Tidak lolos</span>'}</td></tr>`).join("")}
   </tbody></table></div></div>`},
  jadwal(){return `<div class="head"><div><h1>Jadwal Final</h1><p>Jadwal seluruh kelas yang sudah disahkan.</p></div></div><div class="panel">${calendar()}</div>`}
 }
};

// ===== Interaksi =====
const BIND={
 dosen:{ajukan(){
  let pick=null;
  const grid=()=>{const h=$("#fhari").value;
    $("#grid").innerHTML=`<div class="h">Ruang</div>${JAM.map(j=>`<div class="h">${j}</div>`).join("")}`+RUANG.map(r=>`<div class="h" style="align-self:center">${r}</div>`+JAM.map(j=>{const t=terisi(h,r,j);const on=pick&&pick.r===r&&pick.j===j;return `<button type="button" data-r="${r}" data-j="${j}" ${t?"disabled":""} class="${on?"sel":""}">${t?"Terisi: "+t:on?"✓ Dipilih":"Kosong"}</button>`}).join("")).join("");
    document.querySelectorAll("#grid button:not(:disabled)").forEach(b=>b.onclick=()=>{pick={r:b.dataset.r,j:b.dataset.j};$("#pilihan").innerHTML=`Dipilih: <b>${h} ${pick.j} · ${pick.r}</b>`;grid()})};
  const upd=()=>{const m=mk(+$("#fmk").value);$("#flama").value=`${m.hari} ${m.jam}`;
    const n=state.pengajuan.filter(p=>p.kode===m.kode&&p.kelas===m.kelas).length;$("#fke").value=n>=MAKS?`Batas ${MAKS}x tercapai`:`${n+1} dari ${MAKS}`};
  const setHari=()=>{$("#fhari").value=hariDari($("#ftgl").value)};
  $("#fmk").onchange=upd;$("#ftgl").onchange=()=>{setHari();pick=null;$("#pilihan").textContent="Belum memilih slot";grid()};setHari();upd();grid();
  $("#fa").addEventListener("reset",()=>{pick=null;setTimeout(()=>{upd();grid();$("#pilihan").textContent="Belum memilih slot";$("#ferr").hidden=true})});
  $("#fa").addEventListener("submit",async e=>{e.preventDefault();const err=$("#ferr");const m=mk(+$("#fmk").value);
    const n=state.pengajuan.filter(p=>p.kode===m.kode&&p.kelas===m.kelas).length;
    const msg=!pick?"Pilih ruang dan slot waktu yang kosong terlebih dahulu.":!$("#falasan").value.trim()?"Alasan perubahan wajib diisi.":hariKe($("#ftgl").value)<=7?"Pengajuan ditolak: harus diajukan sebelum H-7 agar mahasiswa sempat voting.":n>=MAKS?`Pengajuan ditolak: sudah mencapai batas ${MAKS}x pengajuan ulang.`:"";
    if(msg){err.textContent=msg;err.hidden=false;return}
    const r=await api("pengajuan.php",{id_jadwal:m.kode,tanggal:$("#ftgl").value,jam:pick.j,ruang:pick.r,alasan:$("#falasan").value.trim()});
    if(!r.ok){err.textContent=r.pesan;err.hidden=false;return}
    await muat();go("dosen","riwayat");toast(`${r.id} terkirim ke Fakultas/Admin. Voting dibuka setelah diperiksa.`)});
 }},
 mahasiswa:{dashboard(){const b=$("#btnNotif");if(b)b.onclick=aktifkanNotif;
    const belum=state.notif.filter(n=>!n.dibaca).map(n=>n.id);if(belum.length)api("notifikasi.php",{ids:belum}).then(()=>state.notif.forEach(n=>n.dibaca=true))},voting(){document.querySelectorAll("[data-tolak]").forEach(b=>b.onclick=()=>{$("#tb-"+b.dataset.tolak).hidden=false;$("#ta-"+b.dataset.tolak).focus()});
  document.querySelectorAll("[data-vote]").forEach(b=>b.onclick=async()=>{const p=state.pengajuan.find(x=>x.id===b.dataset.id);
    let alasan="";
    if(b.dataset.vote==="tolak"){alasan=$("#ta-"+p.id).value.trim();if(!alasan){$("#te-"+p.id).hidden=false;return}}
    b.disabled=true;
    const r=await api("voting.php",{id:p.idn,pilihan:b.dataset.vote==="setuju"?"setuju":"tidak_setuju",alasan});
    if(!r.ok){toast(r.pesan);b.disabled=false;return}
    await muat();render();toast("Suara Anda tersimpan di database")})},
  keberatan(){$("#fk").addEventListener("submit",async e=>{e.preventDefault();const p=state.pengajuan.find(x=>x.id===$("#kp").value);
    if(!$("#ki").value.trim()||!p){$("#kerr").textContent="Alasan keberatan wajib diisi.";$("#kerr").hidden=false;return}
    // keberatan disimpan sebagai suara "tidak setuju" + alasan + opsi jadwal alternatif (tabel voting)
    const r=await api("voting.php",{id:p.idn,pilihan:"tidak_setuju",alasan:`${$("#kj").value}: ${$("#ki").value.trim()}`,alternatif:$("#kalt").value});
    if(!r.ok){$("#kerr").textContent=r.pesan;$("#kerr").hidden=false;return}
    await muat();go("mahasiswa","voting");toast("Keberatan terkirim ke dosen dan fakultas")})}},
 admin:{keputusan(){document.querySelectorAll("[data-dec]").forEach(b=>b.onclick=async()=>{const p=state.pengajuan.find(x=>x.id===b.dataset.id);
    const aksi={voting:"buka",tutup:"tutup",ditolak:"tolak"}[b.dataset.dec];
    b.disabled=true;
    const r=await api("keputusan.php",{id:p.idn,aksi});
    if(!r.ok){toast(r.pesan);b.disabled=false;return}
    await muat();render();
    toast(aksi==="buka"?`${p.id}: voting dibuka, notifikasi dikirim ke kelas ${p.kelas}`:aksi==="tutup"?`${p.id}: voting ditutup. Hasil ${r.status==="disetujui"?"LOLOS, jadwal resmi pindah":"TIDAK LOLOS, jadwal tetap"}.`:`${p.id} ditolak.`)})}}
};

// ===== Mulai: cek sesi login di server =====
(async()=>{await muat();route();cekNotif();})();
