/**
 * Our Secret Diary 💖 — Final Version
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, setDoc, getDoc,
  updateDoc, query, orderBy, onSnapshot, serverTimestamp, where,
  arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ── Firebase ── */
const firebaseConfig = {
  apiKey:            "AIzaSyDxOUi53zfnq1YbfZxQbHKURfizZpsbc5A",
  authDomain:        "our-secret-diary.firebaseapp.com",
  projectId:         "our-secret-diary",
  storageBucket:     "our-secret-diary.firebasestorage.app",
  messagingSenderId: "834741276150",
  appId:             "1:834741276150:web:05063d4b78fefb9d7f4bd7"
};
const ALLOWED_EMAILS = null; // null = anyone can log in

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});

/* ── State ── */
let currentUser  = null;
let allEntries   = [];
let activeFilter = 'all';
let searchQuery  = '';
let selectedMood = '';
let selectedPhoto= null;
let unsubEntries = null;
let unsubPings   = null;
let calDate      = new Date();
let entryDates   = new Set();
let fontSizeIdx  = 1;
const FSIZES  = ['0.88rem','1rem','1.1rem'];
const FLABELS = ['Small','Medium','Large'];
const ACOLORS = ['#e8789a','#7bb8d4','#a08ec2','#7ec48a','#e8936a'];
const REACTS  = ['❤️','😂','😮','😢','🔥','👏'];

/* ── Helpers ── */
const $  = id => document.getElementById(id);
const sv = (id,v) => { const e=$('id'); if(e) e.style.display=v; };
function showEl(e,msg){ if(e){e.textContent=msg;e.style.display='block'} }
function hideEl(e){ if(e) e.style.display='none' }
function showToast(msg){
  const t=$('toast');
  if(!t) return;
  t.textContent=msg; t.style.display='block';
  void t.offsetWidth; // reflow
  t.classList.add('show');
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.style.display='none',350); },2800);
}
function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function fmt(d){ return new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d) }
function fmtFull(d){ return new Intl.DateTimeFormat('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).format(d) }
function hash(s){ let h=0; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))&0xffffffff; return Math.abs(h) }
function ekey(e){ return [...e].map(c=>c.codePointAt(0).toString(16)).join('_') }

/* ── Petals ── */
(function(){
  const c=$('petals'); if(!c) return;
  const s=['🌸','🌺','💮','🌷','💖','💗','🩷'];
  for(let i=0;i<14;i++){
    const p=document.createElement('span');
    p.className='petal';
    p.textContent=s[i%s.length];
    p.style.cssText=`left:${Math.random()*100}%;font-size:${0.6+Math.random()*0.7}rem;animation-duration:${7+Math.random()*10}s;animation-delay:${Math.random()*12}s`;
    c.appendChild(p);
  }
})();

/* ── Load prefs on startup ── */
(function(){
  try{
    const theme=localStorage.getItem('sd_theme')||'pink';
    document.documentElement.setAttribute('data-theme',theme);
    if(localStorage.getItem('sd_dark')==='1') document.body.classList.add('dark');
    fontSizeIdx=parseInt(localStorage.getItem('sd_font')||'1');
    document.documentElement.style.setProperty('--font-size',FSIZES[fontSizeIdx]);
  }catch(e){}
})();

/* ── Screen management ── */
function showScreen(id){
  ['auth-screen','diary-screen','blocked-screen'].forEach(sid=>{
    const el=document.getElementById(sid);
    if(!el) return;
    if(sid===id){
      el.style.display='flex';
      el.classList.add('active');
    } else {
      el.style.display='none';
      el.classList.remove('active');
    }
  });
}

/* ══════════════════════════════════════════
   AUTH STATE
══════════════════════════════════════════ */
onAuthStateChanged(auth, async user=>{
  if(user){
    const ok = !ALLOWED_EMAILS || ALLOWED_EMAILS.some(e=>e.toLowerCase()===user.email.toLowerCase());
    if(ok){
      currentUser=user;
      showScreen('diary-screen');
      await initDiary(user);
    } else {
      showScreen('blocked-screen');
    }
  } else {
    currentUser=null;
    if(unsubEntries){unsubEntries();unsubEntries=null}
    if(unsubPings){unsubPings();unsubPings=null}
    showScreen('auth-screen');
  }
});

/* ══════════════════════════════════════════
   LOGIN / SIGNUP
══════════════════════════════════════════ */
window.handleAuth = async function(){
  const errEl = $('auth-error');
  const infEl = $('auth-info');
  const btn   = $('auth-btn');
  const btnTxt= $('auth-btn-text');
  const spin  = $('auth-spinner');

  hideEl(errEl); hideEl(infEl);

  let name='', email='', pass='';
  try{
    name  = ($('auth-name').value||'').trim();
    email = ($('auth-email').value||'').trim().toLowerCase();
    pass  = ($('auth-password').value||'');
  }catch(e){ showEl(errEl,'Page error, please refresh'); return; }

  if(!email){ showEl(errEl,'Please enter your email 💌'); return; }
  if(!pass) { showEl(errEl,'Please enter your password 🔐'); return; }
  if(pass.length<6){ showEl(errEl,'Password needs 6+ characters'); return; }

  // Show loading
  btn.disabled=true;
  btnTxt.style.display='none';
  spin.style.display='inline-block';
  showEl(infEl,'Signing in…');

  try{
    // Attempt login
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if(name) await saveProfile(cred.user.uid, email, name);
    // onAuthStateChanged handles the rest
    return;
  } catch(e1){
    // If not wrong-password, try creating account
    if(e1.code==='auth/wrong-password'){
      hideEl(infEl);
      showEl(errEl,'Wrong password 🔐');
      btn.disabled=false; btnTxt.style.display=''; spin.style.display='none';
      return;
    }
    // Fall through to signup
  }

  // Try create account
  hideEl(infEl);
  showEl(infEl,'Creating your account ✨');
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await saveProfile(cred.user.uid, email, name||email.split('@')[0]);
    // onAuthStateChanged navigates automatically
  } catch(e2){
    hideEl(infEl);
    if(e2.code==='auth/email-already-in-use'){
      showEl(errEl,'Wrong password 🔐');
    } else if(e2.code==='auth/invalid-email'){
      showEl(errEl,'Invalid email address');
    } else {
      showEl(errEl,'Error: '+e2.message);
    }
    btn.disabled=false; btnTxt.style.display=''; spin.style.display='none';
  }
};

// Enter key
try{
  $('auth-password').addEventListener('keydown',e=>{ if(e.key==='Enter') window.handleAuth(); });
}catch(e){}

async function saveProfile(uid,email,name){
  try{ await setDoc(doc(db,'users',uid),{name,email},{merge:true}); }catch(e){}
}
async function getProfile(uid,email){
  try{
    const s=await getDoc(doc(db,'users',uid));
    if(s.exists()&&s.data().name) return s.data().name;
  }catch(e){}
  return email.split('@')[0];
}

/* ══════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════ */
window.handleLogout = async function(){
  try{
    if(unsubEntries){unsubEntries();unsubEntries=null}
    if(unsubPings){unsubPings();unsubPings=null}
    await signOut(auth);
  }catch(e){}
};

/* ══════════════════════════════════════════
   INIT DIARY
══════════════════════════════════════════ */
async function initDiary(user){
  try{
    const name = await getProfile(user.uid, user.email);
    window._myName = name;

    const badge=$('user-badge'); if(badge) badge.textContent='💌 '+name;
    const wd=$('write-date'); if(wd) wd.textContent=fmtFull(new Date());

    // Update prefs UI
    const theme=localStorage.getItem('sd_theme')||'pink';
    document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.theme===theme));
    const fsl=$('font-size-label'); if(fsl) fsl.textContent=FLABELS[fontSizeIdx];
    const dt=$('dark-toggle');
    if(dt) dt.textContent=localStorage.getItem('sd_dark')==='1'?'☀️':'🌙';

    // Char counter
    const ta=$('entry-text');
    if(ta) ta.addEventListener('input',()=>{
      const cc=$('char-count'); if(cc) cc.textContent=ta.value.length+' / 2000';
    });

    startListening(user);
    listenPings(user);
    loadStreak();
  }catch(e){ console.error('initDiary error:',e); }
}

/* ══════════════════════════════════════════
   SAVE ENTRY
══════════════════════════════════════════ */
window.saveEntry = async function(){
  const ta=$('entry-text');
  const text=(ta?ta.value:'').trim();
  if(!text&&!selectedPhoto){ showToast('Write something first 📝'); return; }

  const btn=$('save-btn'), btnTxt=$('save-btn-text'), spin=$('save-spinner');
  if(btn) btn.disabled=true;
  if(btnTxt) btnTxt.style.display='none';
  if(spin) spin.style.display='inline-block';

  try{
    await addDoc(collection(db,'entries'),{
      text:    text,
      email:   currentUser.email,
      uid:     currentUser.uid,
      name:    window._myName||currentUser.email.split('@')[0],
      mood:    selectedMood||'',
      photo:   selectedPhoto||'',
      pinned:  false,
      reactions: {},
      createdAt: serverTimestamp()
    });

    if(ta) ta.value='';
    const cc=$('char-count'); if(cc) cc.textContent='0 / 2000';
    selectedMood='';
    document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
    clearPhotoState();
    showToast('Saved to our diary 💖');
    updateStreak();
    notifyNew(window._myName);
  }catch(e){
    console.error('Save error:',e);
    showToast('Failed to save: '+e.message);
  }finally{
    if(btn) btn.disabled=false;
    if(btnTxt) btnTxt.style.display='';
    if(spin) spin.style.display='none';
  }
};

/* ══════════════════════════════════════════
   REALTIME ENTRIES
══════════════════════════════════════════ */
function startListening(user){
  const container=$('entries-container');
  const loadingEl=$('loading-state');

  const q = ALLOWED_EMAILS
    ? query(collection(db,'entries'),where('email','in',ALLOWED_EMAILS.map(e=>e.toLowerCase())),orderBy('createdAt','desc'))
    : query(collection(db,'entries'),orderBy('createdAt','desc'));

  unsubEntries = onSnapshot(q, snap=>{
    if(loadingEl) loadingEl.style.display='none';
    allEntries=[]; entryDates=new Set();
    snap.forEach(d=>{
      const data={id:d.id,...d.data()};
      allEntries.push(data);
      if(data.createdAt){
        const dt=data.createdAt.toDate();
        entryDates.add(dt.getFullYear()+'-'+dt.getMonth()+'-'+dt.getDate());
      }
    });
    renderEntries(user);
    renderCal();
  }, err=>{
    console.error('Firestore error:',err);
    if(container) container.innerHTML=`<div class="empty-state"><span class="empty-icon">😢</span><p>Error loading entries: ${err.message}</p></div>`;
  });
}

function renderEntries(user){
  const u=user||currentUser;
  if(!u) return;
  const container=$('entries-container');
  if(!container) return;

  let list=[...allEntries];
  if(activeFilter==='mine')   list=list.filter(e=>e.email?.toLowerCase()===u.email.toLowerCase());
  if(activeFilter==='theirs') list=list.filter(e=>e.email?.toLowerCase()!==u.email.toLowerCase());
  if(activeFilter==='pinned') list=list.filter(e=>e.pinned);
  if(searchQuery){
    const q=searchQuery.toLowerCase();
    list=list.filter(e=>(e.text||'').toLowerCase().includes(q)||(e.name||'').toLowerCase().includes(q));
  }

  if(!list.length){
    container.innerHTML=`<div class="empty-state"><span class="empty-icon">🌸</span><p>${
      searchQuery||activeFilter!=='all'?'No entries found…':'Your diary is waiting for its first story…'
    }</p></div>`;
    return;
  }
  container.innerHTML='';
  list.forEach((data,i)=>{
    const isMine=data.email?.toLowerCase()===u.email.toLowerCase();
    container.appendChild(buildCard(data,isMine,i));
  });
}

/* ══════════════════════════════════════════
   BUILD ENTRY CARD
══════════════════════════════════════════ */
function buildCard(data,isMine,idx){
  const card=document.createElement('div');
  card.className=`entry-card ${isMine?'mine':'theirs'} ${data.pinned?'pinned-card':''}`;
  card.style.animationDelay=idx*0.05+'s';

  const name=data.name||(data.email||'someone').split('@')[0];
  const ci=hash(data.email||'')%ACOLORS.length;
  const time=data.createdAt?fmt(data.createdAt.toDate()):'Just now';
  const tag=isMine?`<span class="mine-tag">You</span>`:`<span class="theirs-tag">💌 ${esc(name)}</span>`;
  const mood=data.mood?`<span class="mood-tag">${data.mood}</span>`:'';
  const pin=data.pinned?'📌':'';
  const delBtn=isMine?`<button class="btn-delete" onclick="window.delEntry('${data.id}',this)">🗑️</button>`:'';
  const pinBtn=isMine?`<button class="btn-pin" onclick="window.togglePin('${data.id}',${!!data.pinned})">${data.pinned?'📌':'📍'}</button>`:'';
  const photo=data.photo?`<img class="entry-photo" src="${data.photo}" loading="lazy"/>`:'';
  const reacts=buildReacts(data.reactions||{},data.id);

  card.innerHTML=`
    <div class="entry-meta">
      <div class="entry-author">
        <div class="author-avatar" style="background:${ACOLORS[ci]}">${name[0].toUpperCase()}</div>
        <span class="author-name">${esc(name)}</span>${tag}${mood}
        <span>${pin}</span>
      </div>
      <div class="entry-meta-right">
        <span class="entry-time">${time}</span>${pinBtn}${delBtn}
      </div>
    </div>
    <div class="entry-body">${esc(data.text)}</div>
    ${photo}
    <div class="reactions-row" id="rr-${data.id}" style="position:relative">${reacts}</div>`;
  return card;
}

function buildReacts(reactions,docId){
  let html='';
  const uid=currentUser?.uid||'';
  REACTS.forEach(e=>{
    const users=reactions[ekey(e)]||[];
    if(users.length>0){
      const reacted=users.includes(uid);
      html+=`<button class="react-btn ${reacted?'reacted':''}" onclick="window.toggleReact('${docId}','${e}')">${e} <span>${users.length}</span></button>`;
    }
  });
  html+=`<button class="add-react-btn" onclick="window.openPicker('${docId}',this)">＋</button>`;
  return html;
}

window.toggleReact=async function(docId,emoji){
  if(!currentUser) return;
  const key=ekey(emoji);
  try{
    const ref=doc(db,'entries',docId);
    const snap=await getDoc(ref);
    if(!snap.exists()) return;
    const users=(snap.data().reactions||{})[key]||[];
    await updateDoc(ref,{[`reactions.${key}`]:users.includes(currentUser.uid)?arrayRemove(currentUser.uid):arrayUnion(currentUser.uid)});
  }catch(e){}
};

window.openPicker=function(docId,btn){
  document.querySelectorAll('.emoji-picker-popup').forEach(p=>p.remove());
  const picker=document.createElement('div');
  picker.className='emoji-picker-popup';
  REACTS.forEach(e=>{
    const s=document.createElement('span');
    s.className='emoji-opt'; s.textContent=e;
    s.onclick=()=>{window.toggleReact(docId,e);picker.remove()};
    picker.appendChild(s);
  });
  btn.parentElement.appendChild(picker);
  setTimeout(()=>document.addEventListener('click',()=>picker.remove(),{once:true}),50);
};

window.delEntry=async function(docId,btn){
  const card=btn.closest('.entry-card');
  if(card) card.style.opacity='0.4';
  if(!confirm('Delete this entry? 💔')){ if(card) card.style.opacity=''; return; }
  try{ await deleteDoc(doc(db,'entries',docId)); showToast('Deleted 🗑️'); }
  catch(e){ if(card) card.style.opacity=''; showToast('Could not delete'); }
};

window.togglePin=async function(docId,pinned){
  try{
    await updateDoc(doc(db,'entries',docId),{pinned:!pinned});
    showToast(pinned?'Unpinned':'Pinned 📌');
  }catch(e){ showToast('Could not pin'); }
};

/* ══════════════════════════════════════════
   MOOD & PHOTO
══════════════════════════════════════════ */
window.selectMood=function(btn){
  selectedMood=btn.dataset.mood;
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
};
window.handlePhotoSelect=function(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.size>2*1024*1024){ showToast('Max 2MB please 📸'); return; }
  const r=new FileReader();
  r.onload=ev=>{
    selectedPhoto=ev.target.result;
    const p=$('photo-preview');
    if(p){
      p.style.display='flex';
      p.innerHTML=`<img src="${selectedPhoto}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;"/>
        <button onclick="window.clearPhoto()" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--accent-dark);padding:0 0.3rem">✕</button>`;
    }
  };
  r.readAsDataURL(file);
};
function clearPhotoState(){
  selectedPhoto=null;
  const p=$('photo-preview'); if(p){ p.style.display='none'; p.innerHTML=''; }
  const pi=$('photo-input'); if(pi) pi.value='';
}
window.clearPhoto=clearPhotoState;

/* ══════════════════════════════════════════
   SEARCH / FILTER
══════════════════════════════════════════ */
window.filterEntries=function(){
  const si=$('search-input'); searchQuery=si?si.value:''; renderEntries();
};
window.setFilter=function(f,btn){
  activeFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderEntries();
};

/* ══════════════════════════════════════════
   CALENDAR
══════════════════════════════════════════ */
window.toggleCalendar=function(){
  const p=$('calendar-panel'); if(!p) return;
  p.style.display=p.style.display==='none'||!p.style.display?'block':'none';
  renderCal();
};
window.calPrev=function(){ calDate.setMonth(calDate.getMonth()-1); renderCal(); };
window.calNext=function(){ calDate.setMonth(calDate.getMonth()+1); renderCal(); };
function renderCal(){
  const p=$('calendar-panel'); if(!p||p.style.display==='none') return;
  const yr=calDate.getFullYear(),mo=calDate.getMonth();
  const ml=$('cal-month-label');
  if(ml) ml.textContent=new Date(yr,mo,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html=days.map(d=>`<div class="cal-day-name">${d}</div>`).join('');
  const first=new Date(yr,mo,1).getDay();
  const dim=new Date(yr,mo+1,0).getDate();
  const today=new Date();
  for(let i=0;i<first;i++) html+=`<div class="cal-day other-month"></div>`;
  for(let d=1;d<=dim;d++){
    const key=yr+'-'+mo+'-'+d;
    const has=entryDates.has(key);
    const isT=d===today.getDate()&&mo===today.getMonth()&&yr===today.getFullYear();
    html+=`<div class="cal-day ${has?'has-entry':''} ${isT?'today':''}" onclick="window.calDay(${yr},${mo},${d})">${d}</div>`;
  }
  const cg=$('calendar-grid'); if(cg) cg.innerHTML=html;
}
window.calDay=function(yr,mo,d){
  const start=new Date(yr,mo,d),end=new Date(yr,mo,d+1);
  const list=allEntries.filter(e=>e.createdAt&&e.createdAt.toDate()>=start&&e.createdAt.toDate()<end);
  const container=$('entries-container'); if(!container) return;
  container.innerHTML='';
  if(!list.length){ container.innerHTML=`<div class="empty-state"><span class="empty-icon">📅</span><p>No entries on this day</p></div>`; }
  else list.forEach((d2,i)=>container.appendChild(buildCard(d2,d2.email?.toLowerCase()===currentUser?.email?.toLowerCase(),i)));
  const cp=$('calendar-panel'); if(cp) cp.style.display='none';
  showToast('Showing '+new Date(yr,mo,d).toLocaleDateString('en-US',{month:'short',day:'numeric'}))+' 📅';
};

/* ══════════════════════════════════════════
   LOVE METER (streak)
══════════════════════════════════════════ */
async function updateStreak(){
  if(!currentUser) return;
  try{
    const ref=doc(db,'streaks',currentUser.uid);
    const today=new Date().toDateString();
    const snap=await getDoc(ref);
    if(!snap.exists()){ await setDoc(ref,{lastDate:today,streak:1}); }
    else{
      const{lastDate,streak}=snap.data();
      if(lastDate===today) return;
      const yesterday=new D
