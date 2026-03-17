/**
 * Our Secret Diary 💖 — Full Featured
 * Firebase Auth + Firestore + All Features
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, setDoc, getDoc,
  updateDoc, query, orderBy, onSnapshot, serverTimestamp, where,
  arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase Config ──────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDxOUi53zfnq1YbfZxQbHKURfizZpsbc5A",
  authDomain:        "our-secret-diary.firebaseapp.com",
  projectId:         "our-secret-diary",
  storageBucket:     "our-secret-diary.firebasestorage.app",
  messagingSenderId: "834741276150",
  appId:             "1:834741276150:web:05063d4b78fefb9d7f4bd7"
};

// ── Allowed Emails (null = open, set to restrict) ──
const ALLOWED_EMAILS = null;

// ── Init ─────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
setPersistence(auth, browserLocalPersistence);

// ── State ────────────────────────────────────────
let currentUser   = null;
let allEntries    = [];
let activeFilter  = 'all';
let searchQuery   = '';
let selectedMood  = '';
let selectedPhoto = null; // base64 string
let unsubEntries  = null;
let unsubPings    = null;
let calDate       = new Date();
let entryDates    = new Set();
let fontSizeIdx   = 1; // 0=small,1=medium,2=large
const FONT_SIZES  = ['0.88rem','1rem','1.1rem'];
const FONT_LABELS = ['Small','Medium','Large'];
const AVATAR_COLORS = ['#e8789a','#7bb8d4','#a08ec2','#7ec48a','#e8936a'];
const REACT_EMOJIS  = ['❤️','😂','😮','😢','🔥','👏'];

// ── Petals ───────────────────────────────────────
(function spawnPetals(){
  const c = document.getElementById('petals');
  const s = ['🌸','🌺','💮','🌷','💖','💗','🩷','✿'];
  for(let i=0;i<16;i++){
    const p = document.createElement('span');
    p.className = 'petal';
    p.textContent = s[Math.floor(Math.random()*s.length)];
    p.style.left = `${Math.random()*100}%`;
    p.style.fontSize = `${0.6+Math.random()*0.7}rem`;
    p.style.animationDuration = `${7+Math.random()*10}s`;
    p.style.animationDelay = `${Math.random()*12}s`;
    c.appendChild(p);
  }
})();

// ── Load saved prefs ─────────────────────────────
(function loadPrefs(){
  const dark  = localStorage.getItem('sd_dark') === '1';
  const theme = localStorage.getItem('sd_theme') || 'pink';
  const fs    = parseInt(localStorage.getItem('sd_font') || '1');
  if(dark) document.body.classList.add('dark'), document.getElementById('dark-toggle').textContent='☀️';
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active', s.dataset.theme===theme));
  fontSizeIdx = fs;
  document.documentElement.style.setProperty('--font-size', FONT_SIZES[fs]);
  document.getElementById('font-size-label').textContent = FONT_LABELS[fs];
})();

// ══════════════════════════════════════
//  AUTH STATE
// ══════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if(user){
    const email = user.email.toLowerCase();
    const allowed = !ALLOWED_EMAILS || ALLOWED_EMAILS.some(e=>e.toLowerCase()===email);
    if(allowed){
      currentUser = user;
      showScreen('diary-screen');
      await initDiary(user);
    } else {
      showScreen('blocked-screen');
    }
  } else {
    currentUser = null;
    if(unsubEntries){ unsubEntries(); unsubEntries=null; }
    if(unsubPings)  { unsubPings();   unsubPings=null;   }
    showScreen('auth-screen');
  }
});

// ══════════════════════════════════════
//  AUTH HANDLER
// ══════════════════════════════════════
window.handleAuth = async function(){
  const name  = document.getElementById('auth-name').value.trim();
  const email = document.getElementById('auth-email').value.trim().toLowerCase();
  const pass  = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const infEl = document.getElementById('auth-info');
  hideEl(errEl); hideEl(infEl);

  if(!email||!pass){ showEl(errEl,'Please fill in email and password 💌'); return; }
  if(pass.length<6){ showEl(errEl,'Password needs at least 6 characters'); return; }
  setAuthLoading(true);

  // Step 1: Try login
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if(name) await saveUserProfile(cred.user.uid, email, name);
    return; // success
  } catch(loginErr){
    // Wrong password — don't try signup
    if(loginErr.code === 'auth/wrong-password'){
      showEl(errEl, 'Wrong password 🔐');
      setAuthLoading(false);
      return;
    }
  }

  // Step 2: Login failed — try creating account
  try {
    showEl(infEl, 'Creating your account ✨');
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await saveUserProfile(cred.user.uid, email, name||email.split('@')[0]);
    // onAuthStateChanged handles navigation
  } catch(signupErr){
    hideEl(infEl);
    // If email already exists, the password was just wrong
    if(signupErr.code === 'auth/email-already-in-use'){
      showEl(errEl, 'Wrong password 🔐');
    } else {
      showEl(errEl, friendlyErr(signupErr.code));
    }
    setAuthLoading(false);
  }
};

document.getElementById('auth-password').addEventListener('keydown', e => {
  if(e.key==='Enter') window.handleAuth();
});

async function saveUserProfile(uid, email, name){
  await setDoc(doc(db,'users',uid),{name,email},{merge:true});
}
async function getUserName(uid, email){
  try {
    const snap = await getDoc(doc(db,'users',uid));
    if(snap.exists()&&snap.data().name) return snap.data().name;
  } catch(e){}
  return email.split('@')[0];
}

// ══════════════════════════════════════
//  LOGOUT
// ══════════════════════════════════════
window.handleLogout = async function(){
  if(unsubEntries){ unsubEntries(); unsubEntries=null; }
  if(unsubPings)  { unsubPings();   unsubPings=null;   }
  await signOut(auth);
};

// ══════════════════════════════════════
//  INIT DIARY
// ══════════════════════════════════════
async function initDiary(user){
  const name = await getUserName(user.uid, user.email);
  window._myName = name;
  document.getElementById('user-badge').textContent = `💌 ${name}`;
  document.getElementById('write-date').textContent = formatDateFull(new Date());

  const textarea = document.getElementById('entry-text');
  textarea.addEventListener('input',()=>{
    document.getElementById('char-count').textContent = `${textarea.value.length} / 2000`;
  });

  listenToEntries(user);
  listenToPings(user);
  loadLoveMeter();
}

// ══════════════════════════════════════
//  SAVE ENTRY
// ══════════════════════════════════════
window.saveEntry = async function(){
  const user    = auth.currentUser;
  const text    = document.getElementById('entry-text').value.trim();
  if(!text && !selectedPhoto){ showToast('Write something first 📝'); return; }
  setSaveLoading(true);

  try {
    await addDoc(collection(db,'entries'),{
      text,
      email:     user.email,
      uid:       user.uid,
      name:      window._myName || user.email.split('@')[0],
      mood:      selectedMood || '',
      photo:     selectedPhoto || '',
      pinned:    false,
      reactions: {},
      createdAt: serverTimestamp()
    });

    // Reset UI
    document.getElementById('entry-text').value = '';
    document.getElementById('char-count').textContent = '0 / 2000';
    selectedMood = '';
    document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
    clearPhoto();
    showToast('Saved to our diary 💖');

    // Update love meter daily streak
    await updateStreak(user.uid);

    // Send browser notification to partner
    notifyPartner(window._myName);

  } catch(e){
    console.error(e);
    showToast('Failed to save 😢');
  } finally {
    setSaveLoading(false);
  }
};

// ══════════════════════════════════════
//  REAL-TIME LISTENER
// ══════════════════════════════════════
function listenToEntries(user){
  const container = document.getElementById('entries-container');
  const loadingEl = document.getElementById('loading-state');

  const q = ALLOWED_EMAILS
    ? query(collection(db,'entries'), where('email','in',ALLOWED_EMAILS.map(e=>e.toLowerCase())), orderBy('createdAt','desc'))
    : query(collection(db,'entries'), orderBy('createdAt','desc'));

  unsubEntries = onSnapshot(q, snapshot => {
    hideEl(loadingEl);
    allEntries = [];
    entryDates = new Set();

    snapshot.forEach(d => {
      const data = { id: d.id, ...d.data() };
      allEntries.push(data);
      if(data.createdAt){
        const dt = data.createdAt.toDate();
        entryDates.add(`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`);
      }
    });

    renderEntries(user);
    renderCalendar();
  }, err => {
    console.error(err);
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">😢</span><p>Couldn't load entries.</p></div>`;
  });
}

function renderEntries(user){
  const u = user || currentUser;
  const container = document.getElementById('entries-container');
  let list = [...allEntries];

  // Filter
  if(activeFilter==='mine')   list = list.filter(e=>e.email?.toLowerCase()===u.email.toLowerCase());
  if(activeFilter==='theirs') list = list.filter(e=>e.email?.toLowerCase()!==u.email.toLowerCase());
  if(activeFilter==='pinned') list = list.filter(e=>e.pinned);

  // Search
  if(searchQuery){
    const q = searchQuery.toLowerCase();
    list = list.filter(e=>(e.text||'').toLowerCase().includes(q)||(e.name||'').toLowerCase().includes(q));
  }

  if(!list.length){
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">🌸</span><p>${searchQuery||activeFilter!=='all'?'No matching entries found':'Your diary is waiting for its first story…'}</p></div>`;
    return;
  }

  container.innerHTML = '';
  list.forEach((data,idx) => {
    const isMine = data.email?.toLowerCase()===u.email.toLowerCase();
    const card = buildEntryCard(data, isMine, idx);
    container.appendChild(card);
  });
}

// ══════════════════════════════════════
//  BUILD ENTRY CARD
// ══════════════════════════════════════
function buildEntryCard(data, isMine, idx){
  const card = document.createElement('div');
  card.className = `entry-card ${isMine?'mine':'theirs'} ${data.pinned?'pinned-card':''}`;
  card.style.animationDelay = `${idx*0.05}s`;
  card.dataset.id = data.id;

  const displayName = data.name || (data.email||'someone').split('@')[0];
  const initials    = displayName[0].toUpperCase();
  const colorIdx    = simpleHash(data.email||'') % AVATAR_COLORS.length;
  const timeStr     = data.createdAt ? formatDate(data.createdAt.toDate()) : 'Just now';
  const tag         = isMine ? `<span class="mine-tag">You</span>` : `<span class="theirs-tag">💌 ${escHtml(displayName)}</span>`;
  const moodEl      = data.mood ? `<span class="mood-tag">${data.mood}</span>` : '';
  const pinEl       = data.pinned ? `<span class="pin-badge" title="Pinned">📌</span>` : '';
  const pinBtn      = isMine ? `<button class="btn-pin" title="${data.pinned?'Unpin':'Pin'}" onclick="togglePin('${data.id}',${data.pinned})">📌</button>` : '';
  const delBtn      = isMine ? `<button class="btn-delete" title="Delete" onclick="confirmDelete('${data.id}',this)">🗑️</button>` : '';
  const photoEl     = data.photo ? `<img class="entry-photo" src="${data.photo}" alt="Photo" loading="lazy"/>` : '';

  // Reactions
  const reactions = data.reactions || {};
  const reactionHTML = buildReactionsHTML(reactions, data.id);

  card.innerHTML = `
    <div class="entry-meta">
      <div class="entry-author">
        <div class="author-avatar" style="background:${AVATAR_COLORS[colorIdx]}">${initials}</div>
        <span class="author-name">${escHtml(displayName)}</span>
        ${tag} ${moodEl} ${pinEl}
      </div>
      <div class="entry-meta-right">
        <span class="entry-time">${timeStr}</span>
        ${pinBtn} ${delBtn}
      </div>
    </div>
    <div class="entry-body">${escHtml(data.text)}</div>
    ${photoEl}
    <div class="reactions-row" id="react-row-${data.id}">${reactionHTML}</div>
  `;

  return card;
}

function buildReactionsHTML(reactions, docId){
  const uid = currentUser?.uid || '';
  let html = '';
  REACT_EMOJIS.forEach(emoji => {
    const users = reactions[emojiKey(emoji)] || [];
    if(users.length>0){
      const reacted = users.includes(uid);
      html += `<button class="react-btn ${reacted?'reacted':''}" onclick="toggleReaction('${docId}','${emoji}')">
        ${emoji} <span class="react-count">${users.length}</span>
      </button>`;
    }
  });
  html += `<button class="add-react-btn" onclick="openEmojiPicker('${docId}',this)">＋</button>`;
  return html;
}

// ══════════════════════════════════════
//  REACTIONS
// ══════════════════════════════════════
window.toggleReaction = async function(docId, emoji){
  const uid = currentUser?.uid;
  if(!uid) return;
  const key = emojiKey(emoji);
  const ref = doc(db,'entries',docId);
  const snap = await getDoc(ref);
  if(!snap.exists()) return;
  const users = (snap.data().reactions||{})[key] || [];
  if(users.includes(uid)){
    await updateDoc(ref, { [`reactions.${key}`]: arrayRemove(uid) });
  } else {
    await updateDoc(ref, { [`reactions.${key}`]: arrayUnion(uid) });
  }
};

window.openEmojiPicker = function(docId, btn){
  // Remove any existing picker
  document.querySelectorAll('.emoji-picker-popup').forEach(p=>p.remove());
  const picker = document.createElement('div');
  picker.className = 'emoji-picker-popup';
  REACT_EMOJIS.forEach(e=>{
    const opt = document.createElement('span');
    opt.className = 'emoji-opt';
    opt.textContent = e;
    opt.onclick = () => { toggleReaction(docId,e); picker.remove(); };
    picker.appendChild(opt);
  });
  btn.parentElement.style.position='relative';
  btn.parentElement.appendChild(picker);
  setTimeout(()=>document.addEventListener('click',()=>picker.remove(),{once:true}),50);
};

function emojiKey(emoji){ return [...emoji].map(c=>c.codePointAt(0).toString(16)).join('_'); }

// ══════════════════════════════════════
//  DELETE & PIN
// ══════════════════════════════════════
window.confirmDelete = async function(docId, btn){
  const card = btn.closest('.entry-card');
  card.classList.add('deleting');
  if(!confirm('Delete this entry? 💔')){ card.classList.remove('deleting'); return; }
  try {
    await deleteDoc(doc(db,'entries',docId));
    showToast('Entry deleted 🗑️');
  } catch(e){
    card.classList.remove('deleting');
    showToast('Could not delete 😢');
  }
};

window.togglePin = async function(docId, currentlyPinned){
  try {
    await updateDoc(doc(db,'entries',docId),{ pinned: !currentlyPinned });
    showToast(currentlyPinned ? 'Unpinned' : 'Pinned 📌');
  } catch(e){ showToast('Could not pin 😢'); }
};

// ══════════════════════════════════════
//  MOOD
// ══════════════════════════════════════
window.selectMood = function(btn){
  selectedMood = btn.dataset.mood;
  document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
};

// ══════════════════════════════════════
//  PHOTO
// ══════════════════════════════════════
window.handlePhotoSelect = function(e){
  const file = e.target.files[0];
  if(!file) return;
  if(file.size > 2*1024*1024){ showToast('Image must be under 2MB 📸'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    selectedPhoto = ev.target.result;
    const preview = document.getElementById('photo-preview');
    preview.classList.remove('hidden');
    preview.innerHTML = `<img src="${selectedPhoto}" alt="preview"/>
      <button class="remove-photo" onclick="clearPhoto()">✕</button>`;
  };
  reader.readAsDataURL(file);
};

window.clearPhoto = function(){
  selectedPhoto = null;
  const preview = document.getElementById('photo-preview');
  preview.classList.add('hidden');
  preview.innerHTML = '';
  document.getElementById('photo-input').value = '';
};

// ══════════════════════════════════════
//  SEARCH & FILTER
// ══════════════════════════════════════
window.filterEntries = function(){
  searchQuery = document.getElementById('search-input').value;
  renderEntries();
};

window.setFilter = function(filter, btn){
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderEntries();
};

// ══════════════════════════════════════
//  CALENDAR
// ══════════════════════════════════════
window.toggleCalendar = function(){
  document.getElementById('calendar-panel').classList.toggle('hidden');
  renderCalendar();
};
window.calPrev = function(){ calDate.setMonth(calDate.getMonth()-1); renderCalendar(); };
window.calNext = function(){ calDate.setMonth(calDate.getMonth()+1); renderCalendar(); };

function renderCalendar(){
  const grid  = document.getElementById('calendar-grid');
  const label = document.getElementById('cal-month-label');
  if(!grid||document.getElementById('calendar-panel').classList.contains('hidden')) return;

  const year  = calDate.getFullYear();
  const month = calDate.getMonth();
  label.textContent = new Date(year,month,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});

  const days = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html = days.map(d=>`<div class="cal-day-name">${d}</div>`).join('');

  const firstDay = new Date(year,month,1).getDay();
  const daysInMonth = new Date(year,month+1,0).getDate();
  const today = new Date();

  // Blank cells
  for(let i=0;i<firstDay;i++) html+=`<div class="cal-day other-month"></div>`;

  for(let d=1;d<=daysInMonth;d++){
    const key = `${year}-${month}-${d}`;
    const hasEntry = entryDates.has(key);
    const isToday  = d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
    html+=`<div class="cal-day ${hasEntry?'has-entry':''} ${isToday?'today':''}"
      onclick="calDayClick(${year},${month},${d})" title="${hasEntry?'Has entries':''}">${d}</div>`;
  }

  grid.innerHTML = html;
}

window.calDayClick = function(year, month, day){
  // Filter entries for that date
  const start = new Date(year,month,day);
  const end   = new Date(year,month,day+1);
  const u = currentUser;
  const container = document.getElementById('entries-container');
  const filtered = allEntries.filter(e=>{
    if(!e.createdAt) return false;
    const d = e.createdAt.toDate();
    return d>=start && d<end;
  });
  container.innerHTML='';
  if(!filtered.length){ container.innerHTML=`<div class="empty-state"><span class="empty-icon">📅</span><p>No entries on this day</p></div>`; return; }
  filtered.forEach((data,idx)=>{
    const isMine = data.email?.toLowerCase()===u.email.toLowerCase();
    container.appendChild(buildEntryCard(data,isMine,idx));
  });
  // Reset filter shows all button
  document.getElementById('calendar-panel').classList.add('hidden');
  showToast(`Showing ${new Date(year,month,day).toLocaleDateString('en-US',{month:'short',day:'numeric'})} 📅`);
};

// ══════════════════════════════════════
//  LOVE METER (streak)
// ══════════════════════════════════════
async function updateStreak(uid){
  const ref = doc(db,'streaks',uid);
  const today = new Date().toDateString();
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref,{ lastDate:today, streak:1 });
  } else {
    const { lastDate, streak } = snap.data();
    const yesterday = new Date(Date.now()-86400000).toDateString();
    if(lastDate===today) return;
    const newStreak = lastDate===yesterday ? (streak||0)+1 : 1;
    await setDoc(ref,{ lastDate:today, streak:newStreak });
  }
