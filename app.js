/**
 * Our Secret Diary 💖
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

// ── Config ──
const firebaseConfig = {
  apiKey:            "AIzaSyDxOUi53zfnq1YbfZxQbHKURfizZpsbc5A",
  authDomain:        "our-secret-diary.firebaseapp.com",
  projectId:         "our-secret-diary",
  storageBucket:     "our-secret-diary.firebasestorage.app",
  messagingSenderId: "834741276150",
  appId:             "1:834741276150:web:05063d4b78fefb9d7f4bd7"
};
const ALLOWED_EMAILS = null;

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(()=>{});

// ── State ──
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
const FONT_SIZES  = ['0.88rem','1rem','1.1rem'];
const FONT_LABELS = ['Small','Medium','Large'];
const AVATAR_COLORS = ['#e8789a','#7bb8d4','#a08ec2','#7ec48a','#e8936a'];
const REACT_EMOJIS  = ['❤️','😂','😮','😢','🔥','👏'];

// ── Helpers: show/hide using style.display ──
function el(id){ return document.getElementById(id); }
function show(id){ el(id).style.display=''; }
function hide(id){ el(id).style.display='none'; }
function showEl(elem, msg){ elem.textContent=msg; elem.style.display=''; }
function hideEl(elem){ elem.style.display='none'; }

// ── Petals ──
(function(){
  const c=el('petals'), s=['🌸','🌺','💮','🌷','💖','💗','🩷'];
  for(let i=0;i<14;i++){
    const p=document.createElement('span');
    p.className='petal';
    p.textContent=s[Math.floor(Math.random()*s.length)];
    p.style.cssText=`left:${Math.random()*100}%;font-size:${0.6+Math.random()*0.7}rem;animation-duration:${7+Math.random()*10}s;animation-delay:${Math.random()*12}s`;
    c.appendChild(p);
  }
})();

// ── Load prefs ──
(function(){
  try{
    const t=localStorage.getItem('sd_theme')||'pink';
    document.documentElement.setAttribute('data-theme',t);
    if(localStorage.getItem('sd_dark')==='1') document.body.classList.add('dark');
    fontSizeIdx=parseInt(localStorage.getItem('sd_font')||'1');
    document.documentElement.style.setProperty('--font-size',FONT_SIZES[fontSizeIdx]);
  }catch(e){}
})();

// ── Screens ──
function showScreen(id){
  ['auth-screen','diary-screen','blocked-screen'].forEach(s=>{
    el(s).style.display = s===id ? 'flex' : 'none';
  });
}

// ══════════════════════════════════
//  AUTH STATE
// ══════════════════════════════════
onAuthStateChanged(auth, async(user)=>{
  if(user){
    const allowed = !ALLOWED_EMAILS || ALLOWED_EMAILS.some(e=>e.toLowerCase()===user.email.toLowerCase());
    if(allowed){
      currentUser=user;
      showScreen('diary-screen');
      await initDiary(user);
    } else {
      showScreen('blocked-screen');
    }
  } else {
    currentUser=null;
    if(unsubEntries){unsubEntries();unsubEntries=null;}
    if(unsubPings){unsubPings();unsubPings=null;}
    showScreen('auth-screen');
  }
});

// ══════════════════════════════════
//  LOGIN / SIGNUP
// ══════════════════════════════════
window.handleAuth = async function(){
  const errEl = el('auth-error');
  const infEl = el('auth-info');
  hideEl(errEl); hideEl(infEl);

  try {
    const name  = (el('auth-name').value||'').trim();
    const email = (el('auth-email').value||'').trim().toLowerCase();
    const pass  = (el('auth-password').value||'');

    if(!email){ showEl(errEl,'Please enter your email 💌'); return; }
    if(!pass) { showEl(errEl,'Please enter your password 🔐'); return; }
    if(pass.length<6){ showEl(errEl,'Password needs 6+ characters'); return; }

    // Disable button
    el('auth-btn').disabled=true;
    el('auth-btn-text').style.display='none';
    el('auth-spinner').style.display='';
    showEl(infEl,'Signing in…');

    // Try login
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      if(name) await saveProfile(cred.user.uid, email, name);
      return;
    } catch(e){
      if(e.code==='auth/wrong-password'||e.code==='auth/invalid-credential'){
        // Could be wrong password OR user doesn't exist — try signup
      } else {
        throw e; // real error
      }
    }

    // Try signup
    hideEl(infEl);
    showEl(infEl,'Creating account ✨');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await saveProfile(cred.user.uid, email, name||email.split('@')[0]);
    } catch(e2){
      hideEl(infEl);
      if(e2.code==='auth/email-already-in-use'){
        showEl(errEl,'Wrong password 🔐');
      } else {
        showEl(errEl,'Error: '+e2.message);
      }
      el('auth-btn').disabled=false;
      el('auth-btn-text').style.display='';
      el('auth-spinner').style.display='none';
    }

  } catch(err){
    showEl(errEl,'Error: '+(err.message||err.code||'unknown'));
    el('auth-btn').disabled=false;
    el('auth-btn-text').style.display='';
    el('auth-spinner').style.display='none';
  }
};

el('auth-password').addEventListener('keydown',e=>{ if(e.key==='Enter') window.handleAuth(); });

async function saveProfile(uid,email,name){
  try{ await setDoc(doc(db,'users',uid),{name,email},{merge:true}); }catch(e){}
}
async function getName(uid,email){
  try{
    const s=await getDoc(doc(db,'users',uid));
    if(s.exists()&&s.data().name) return s.data().name;
  }catch(e){}
  return email.split('@')[0];
}

// ══════════════════════════════════
//  LOGOUT
// ══════════════════════════════════
window.handleLogout = async function(){
  if(unsubEntries){unsubEntries();unsubEntries=null;}
  if(unsubPings){unsubPings();unsubPings=null;}
  await signOut(auth);
};

// ══════════════════════════════════
//  INIT DIARY
// ══════════════════════════════════
async function initDiary(user){
  const name = await getName(user.uid, user.email);
  window._myName = name;
  el('user-badge').textContent = '💌 '+name;
  el('write-date').textContent = fmtFull(new Date());

  // Update UI prefs now that diary screen is visible
  try{
    const t=localStorage.getItem('sd_theme')||'pink';
    document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.theme===t));
    el('font-size-label').textContent=FONT_LABELS[fontSizeIdx];
    if(localStorage.getItem('sd_dark')==='1') el('dark-toggle').textContent='☀️';
  }catch(e){}

  el('entry-text').addEventListener('input',()=>{
    el('char-count').textContent=el('entry-text').value.length+' / 2000';
  });

  listenEntries(user);
  listenPings(user);
  loadStreak();
}

// ══════════════════════════════════
//  SAVE ENTRY
// ══════════════════════════════════
window.saveEntry = async function(){
  const text = el('entry-text').value.trim();
  if(!text&&!selectedPhoto){ showToast('Write something first 📝'); return; }
  el('save-btn').disabled=true;
  el('save-btn-text').style.display='none';
  el('save-spinner').style.display='';
  try{
    await addDoc(collection(db,'entries'),{
      text, email:currentUser.email, uid:currentUser.uid,
      name:window._myName||currentUser.email.split('@')[0],
      mood:selectedMood||'', photo:selectedPhoto||'',
      pinned:false, reactions:{}, createdAt:serverTimestamp()
    });
    el('entry-text').value='';
    el('char-count').textContent='0 / 2000';
    selectedMood='';
    document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
    clearPhoto();
    showToast('Saved 💖');
    updateStreak();
    notifyNew(window._myName);
  }catch(e){ showToast('Failed to save 😢'); }
  finally{
    el('save-btn').disabled=false;
    el('save-btn-text').style.display='';
    el('save-spinner').style.display='none';
  }
};

// ══════════════════════════════════
//  REALTIME LISTENER
// ══════════════════════════════════
function listenEntries(user){
  const q = ALLOWED_EMAILS
    ? query(collection(db,'entries'),where('email','in',ALLOWED_EMAILS.map(e=>e.toLowerCase())),orderBy('createdAt','desc'))
    : query(collection(db,'entries'),orderBy('createdAt','desc'));

  unsubEntries=onSnapshot(q, snap=>{
    el('loading-state').style.display='none';
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
  }, err=>{ console.error(err); });
}

function renderEntries(user){
  const u=user||currentUser;
  const container=el('entries-container');
  let list=[...allEntries];
  if(activeFilter==='mine')   list=list.filter(e=>e.email?.toLowerCase()===u.email.toLowerCase());
  if(activeFilter==='theirs') list=list.filter(e=>e.email?.toLowerCase()!==u.email.toLowerCase());
  if(activeFilter==='pinned') list=list.filter(e=>e.pinned);
  if(searchQuery){
    const q=searchQuery.toLowerCase();
    list=list.filter(e=>(e.text||'').toLowerCase().includes(q)||(e.name||'').toLowerCase().includes(q));
  }
  if(!list.length){
    container.innerHTML=`<div class="empty-state"><span class="empty-icon">🌸</span><p>${searchQuery||activeFilter!=='all'?'No entries found':'Your diary is waiting for its first story…'}</p></div>`;
    return;
  }
  container.innerHTML='';
  list.forEach((data,i)=>{
    const isMine=data.email?.toLowerCase()===u.email.toLowerCase();
    container.appendChild(buildCard(data,isMine,i));
  });
}

// ══════════════════════════════════
//  ENTRY CARD
// ══════════════════════════════════
function buildCard(data,isMine,idx){
  const card=document.createElement('div');
  card.className=`entry-card ${isMine?'mine':'theirs'} ${data.pinned?'pinned-card':''}`;
  card.style.animationDelay=idx*0.05+'s';
  const name=data.name||(data.email||'someone').split('@')[0];
  const ci=simpleHash(data.email||'')%AVATAR_COLORS.length;
  const time=data.createdAt?fmt(data.createdAt.toDate()):'Just now';
  const tag=isMine?`<span class="mine-tag">You</span>`:`<span class="theirs-tag">💌 ${esc(name)}</span>`;
  const mood=data.mood?`<span class="mood-tag">${data.mood}</span>`:'';
  const pin=data.pinned?`<span>📌</span>`:'';
  const delBtn=isMine?`<button class="btn-delete" onclick="window.delEntry('${data.id}',this)">🗑️</button>`:'';
  const pinBtn=isMine?`<button class="btn-pin" onclick="window.togglePin('${data.id}',${!!data.pinned})">${data.pinned?'📌':'📍'}</button>`:'';
  const photo=data.photo?`<img class="entry-photo" src="${data.photo}" loading="lazy"/>`:'';
  const reactions=buildReacts(data.reactions||{},data.id);
  card.innerHTML=`
    <div class="entry-meta">
      <div class="entry-author">
        <div class="author-avatar" style="background:${AVATAR_COLORS[ci]}">${name[0].toUpperCase()}</div>
        <span class="author-name">${esc(name)}</span>${tag}${mood}${pin}
      </div>
      <div class="entry-meta-right">
        <span class="entry-time">${time}</span>${pinBtn}${delBtn}
      </div>
    </div>
    <div class="entry-body">${esc(data.text)}</div>
    ${photo}
    <div class="reactions-row" id="rr-${data.id}">${reactions}</div>`;
  return card;
}

function buildReacts(reactions,docId){
  let html='';
  const uid=currentUser?.uid||'';
  REACT_EMOJIS.forEach(e=>{
    const users=reactions[ekey(e)]||[];
    if(users.length>0){
      const reacted=users.includes(uid);
      html+=`<button class="react-btn ${reacted?'reacted':''}" onclick="window.toggleReact('${docId}','${e}')">${e} <span>${users.length}</span></button>`;
    }
  });
  html+=`<button class="add-react-btn" onclick="window.openPicker('${docId}',this)">＋</button>`;
  return html;
}

window.toggleReact = async function(docId,emoji){
  const uid=currentUser?.uid; if(!uid) return;
  const key=ekey(emoji);
  const ref=doc(db,'entries',docId);
  const snap=await getDoc(ref);
  if(!snap.exists()) return;
  const users=(snap.data().reactions||{})[key]||[];
  await updateDoc(ref,{[`reactions.${key}`]:users.includes(uid)?arrayRemove(uid):arrayUnion(uid)});
};

window.openPicker = function(docId,btn){
  document.querySelectorAll('.emoji-picker-popup').forEach(p=>p.remove());
  const picker=document.createElement('div');
  picker.className='emoji-picker-popup';
  REACT_EMOJIS.forEach(e=>{
    const s=document.createElement('span');
    s.className='emoji-opt'; s.textContent=e;
    s.onclick=()=>{window.toggleReact(docId,e);picker.remove();};
    picker.appendChild(s);
  });
  btn.parentElement.style.position='relative';
  btn.parentElement.appendChild(picker);
  setTimeout(()=>document.addEventListener('click',()=>picker.remove(),{once:true}),50);
};

window.delEntry = async function(docId,btn){
  const card=btn.closest('.entry-card');
  card.style.opacity='0.4';
  if(!confirm('Delete this entry? 💔')){ card.style.opacity=''; return; }
  try{ await deleteDoc(doc(db,'entries',docId)); showToast('Deleted 🗑️'); }
  catch(e){ card.style.opacity=''; showToast('Could not delete'); }
};

window.togglePin = async function(docId,pinned){
  try{ await updateDoc(doc(db,'entries',docId),{pinned:!pinned}); showToast(pinned?'Unpinned':'Pinned 📌'); }
  catch(e){ showToast('Could not pin'); }
};

// ══════════════════════════════════
//  MOOD / PHOTO
// ══════════════════════════════════
window.selectMood = function(btn){
  selectedMood=btn.dataset.mood;
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
};
window.handlePhotoSelect = function(e){
  const file=e.target.files[0]; if(!file) return;
  if(file.size>2*1024*1024){ showToast('Max 2MB please 📸'); return; }
  const r=new FileReader();
  r.onload=ev=>{
    selectedPhoto=ev.target.result;
    const p=el('photo-preview');
    p.style.display='flex';
    p.innerHTML=`<img src="${selectedPhoto}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;"/>
      <button onclick="window.clearPhoto()" style="background:none;border:none;cursor:pointer;font-size:1rem;color:#e8789a">✕</button>`;
  };
  r.readAsDataURL(file);
};
window.clearPhoto=function(){
  selectedPhoto=null;
  el('photo-preview').style.display='none';
  el('photo-preview').innerHTML='';
  el('photo-input').value='';
};

// ══════════════════════════════════
//  SEARCH / FILTER
// ══════════════════════════════════
window.filterEntries=function(){ searchQuery=el('search-input').value; renderEntries(); };
window.setFilter=function(f,btn){
  activeFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderEntries();
};

// ══════════════════════════════════
//  CALENDAR
// ══════════════════════════════════
window.toggleCalendar=function(){
  const p=el('calendar-panel');
  p.style.display=p.style.display==='none'?'block':'none';
  renderCal();
};
window.calPrev=function(){ calDate.setMonth(calDate.getMonth()-1); renderCal(); };
window.calNext=function(){ calDate.setMonth(calDate.getMonth()+1); renderCal(); };
function renderCal(){
  const p=el('calendar-panel');
  if(!p||p.style.display==='none') return;
  const yr=calDate.getFullYear(),mo=calDate.getMonth();
  el('cal-month-label').textContent=new Date(yr,mo,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
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
  el('calendar-grid').innerHTML=html;
}
window.calDay=function(yr,mo,d){
  const start=new Date(yr,mo,d), end=new Date(yr,mo,d+1);
  const list=allEntries.filter(e=>e.createdAt&&e.createdAt.toDate()>=start&&e.createdAt.toDate()<end);
  const container=el('entries-container');
  container.innerHTML='';
  if(!list.length){ container.innerHTML=`<div class="empty-state"><span class="empty-icon">📅</span><p>No entries this day</p></div>`; }
  else list.forEach((d2,i)=>container.appendChild(buildCard(d2,d2.email?.toLowerCase()===currentUser.email.toLowerCase(),i)));
  el('calendar-panel').style.display='none';
  showToast('Showing '+new Date(yr,mo,d).toLocaleDateString('en-US',{month:'short',day:'numeric'}));
};

// ══════════════════════════════════
//  LOVE METER
// ══════════════════════════════════
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
      const yesterday=new Date(Date.now()-86400000).toDateString();
      await setDoc(ref,{lastDate:today,streak:lastDate===yesterday?(streak||0)+1:1});
    }
    loadStreak();
  }catch(e){}
}
async function loadStreak(){
  if(!currentUser) return;
  try{
    const snap=await getDoc(doc(db,'streaks',currentUser.uid));
    el('streak-count').textContent=snap.exists()?(snap.data().streak||0):0;
  }catch(e){}
}

// ══════════════════════════════════
//  PING
// ══════════════════════════════════
window.sendPing=async function(){
  try{
    await addDoc(collection(db,'pings'),{
      from:currentUser.uid, fromName:window._myName||'Someone',
      fromEmail:currentUser.email, createdAt:serverTimestamp()
    });
    showToast('💗 Ping sent!');
  }catch(e){ showToast('Could not send ping'); }
};
function listenPings(user){
  // Firestore limitation: != query needs composite index
  // Simpler: listen to all pings, filter client-side
  const q=query(collection(db,'pings'),orderBy('createdAt','desc'));
  unsubPings=onSnapshot(q,snap=>{
    snap.docChanges().forEach(change=>{
      if(change.type==='added'){
        const data=change.doc.data();
        if(data.from===user.uid) return; // my own ping
        if(data.createdAt){
          const age=Date.now()-data.createdAt.toDate().getTime();
          if(age<30000) showPing(data.fromName||'Your love');
        }
      }
    });
  },()=>{});
}
function showPing(name){
  el('ping-text').textContent=name+' is thinking of you 💗';
  el('ping-overlay').style.display='flex';
  setTimeout(()=>el('ping-overlay').style.display='none',3500);
}

// ══════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════
window.requestNotifications=async function(){
  if(!('Notification' in window)){ showToast('Not supported on this browser'); return; }
  const p=await Notification.requestPermission();
  if(p==='granted'){
    el('notify-btn').textContent='✅ Enabled';
    localStorage.setItem('sd_notify','1');
    showToast('Notifications on 🔔');
  } else { showToast('Permission denied'); }
};
function notifyNew(name){
  if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&localStorage.getItem('sd_notify')==='1'){
    try{ new Notification('Our Secret Diary 💖',{body:name+' wrote a new entry ✨'}); }catch(e){}
  }
}

// ══════════════════════════════════
//  DARK MODE / THEME 
