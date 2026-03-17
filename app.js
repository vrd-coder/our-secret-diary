/**
 * Our Secret Diary 💖
 * Clean simple version — Login + Save + Realtime
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  onAuthStateChanged, signOut, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  setDoc, getDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ── Firebase Config ── */
const firebaseConfig = {
  apiKey:            "AIzaSyDxOUi53zfnq1YbfZxQbHKURfizZpsbc5A",
  authDomain:        "our-secret-diary.firebaseapp.com",
  projectId:         "our-secret-diary",
  storageBucket:     "our-secret-diary.firebasestorage.app",
  messagingSenderId: "834741276150",
  appId:             "1:834741276150:web:05063d4b78fefb9d7f4bd7"
};

const ALLOWED_EMAILS = null; // null = anyone can login

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(() => {});

let currentUser  = null;
let unsubEntries = null;

const AVATAR_COLORS = ['#e8789a', '#7bb8d4', '#a08ec2', '#7ec48a', '#e8936a'];

/* ── Petals ── */
(function () {
  const container = document.getElementById('petals');
  if (!container) return;
  const symbols = ['🌸', '🌺', '💮', '🌷', '💖', '💗', '🩷'];
  for (let i = 0; i < 14; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.textContent = symbols[i % symbols.length];
    p.style.left = Math.random() * 100 + '%';
    p.style.fontSize = (0.6 + Math.random() * 0.7) + 'rem';
    p.style.animationDuration = (7 + Math.random() * 10) + 's';
    p.style.animationDelay    = (Math.random() * 12) + 's';
    container.appendChild(p);
  }
})();

/* ── Screen manager ── */
function showScreen(id) {
  const screens = ['auth-screen', 'diary-screen', 'blocked-screen'];
  screens.forEach(sid => {
    const el = document.getElementById(sid);
    if (!el) return;
    if (sid === id) {
      el.style.display = sid === 'diary-screen' ? 'flex' : 'flex';
      el.style.flexDirection = sid === 'diary-screen' ? 'column' : '';
    } else {
      el.style.display = 'none';
    }
  });
}

/* ── Toast ── */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.style.display = 'none'; }, 350);
  }, 2800);
}

/* ── Auth State ── */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const allowed = !ALLOWED_EMAILS ||
      ALLOWED_EMAILS.some(e => e.toLowerCase() === user.email.toLowerCase());
    if (allowed) {
      currentUser = user;
      showScreen('diary-screen');
      await initDiary(user);
    } else {
      showScreen('blocked-screen');
    }
  } else {
    currentUser = null;
    if (unsubEntries) { unsubEntries(); unsubEntries = null; }
    showScreen('auth-screen');
  }
});

/* ── LOGIN / SIGNUP ── */
window.handleAuth = async function () {
  const errEl  = document.getElementById('auth-error');
  const infEl  = document.getElementById('auth-info');
  const btn    = document.getElementById('auth-btn');
  const btnTxt = document.getElementById('auth-btn-text');
  const spin   = document.getElementById('auth-spinner');

  errEl.style.display = 'none';
  infEl.style.display = 'none';

  const name  = (document.getElementById('auth-name').value  || '').trim();
  const email = (document.getElementById('auth-email').value || '').trim().toLowerCase();
  const pass  = (document.getElementById('auth-password').value || '');

  if (!email) { errEl.textContent = 'Please enter email 💌'; errEl.style.display = 'block'; return; }
  if (!pass)  { errEl.textContent = 'Please enter password 🔐'; errEl.style.display = 'block'; return; }
  if (pass.length < 6) { errEl.textContent = 'Password needs 6+ characters'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btnTxt.style.display = 'none';
  spin.style.display = 'inline-block';
  infEl.textContent = 'Signing in…';
  infEl.style.display = 'block';

  /* Step 1: try login */
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (name) {
      await setDoc(doc(db, 'users', cred.user.uid), { name, email }, { merge: true });
    }
    return; /* onAuthStateChanged handles the rest */
  } catch (e1) {
    if (e1.code === 'auth/wrong-password') {
      infEl.style.display = 'none';
      errEl.textContent = 'Wrong password 🔐';
      errEl.style.display = 'block';
      btn.disabled = false; btnTxt.style.display = ''; spin.style.display = 'none';
      return;
    }
    /* any other error → try signup */
  }

  /* Step 2: try create account */
  infEl.textContent = 'Creating your account ✨';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name: name || email.split('@')[0], email
    }, { merge: true });
    /* onAuthStateChanged navigates */
  } catch (e2) {
    infEl.style.display = 'none';
    if (e2.code === 'auth/email-already-in-use') {
      errEl.textContent = 'Wrong password 🔐';
    } else {
      errEl.textContent = 'Error: ' + e2.message;
    }
    errEl.style.display = 'block';
    btn.disabled = false; btnTxt.style.display = ''; spin.style.display = 'none';
  }
};

/* Enter key on password */
document.getElementById('auth-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') window.handleAuth();
});

/* ── LOGOUT ── */
window.handleLogout = async function () {
  if (unsubEntries) { unsubEntries(); unsubEntries = null; }
  await signOut(auth);
};

/* ── INIT DIARY ── */
async function initDiary(user) {
  /* Get display name */
  let displayName = user.email.split('@')[0];
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists() && snap.data().name) displayName = snap.data().name;
  } catch (e) {}

  window._myName = displayName;
  document.getElementById('user-badge').textContent = '💌 ' + displayName;
  document.getElementById('write-date').textContent  = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(new Date());

  /* Char counter */
  const ta = document.getElementById('entry-text');
  ta.addEventListener('input', () => {
    document.getElementById('char-count').textContent = ta.value.length + ' / 2000';
  });

  /* Start listening */
  listenToEntries(user);
}

/* ── SAVE ENTRY ── */
window.saveEntry = async function () {
  const ta   = document.getElementById('entry-text');
  const text = ta.value.trim();

  if (!text) { showToast('Write something first 📝'); return; }

  const btn    = document.getElementById('save-btn');
  const btnTxt = document.getElementById('save-btn-text');
  const spin   = document.getElementById('save-spinner');

  btn.disabled = true;
  btnTxt.style.display = 'none';
  spin.style.display = 'inline-block';

  try {
    await addDoc(collection(db, 'entries'), {
      text:      text,
      email:     currentUser.email,
      uid:       currentUser.uid,
      name:      window._myName || currentUser.email.split('@')[0],
      createdAt: serverTimestamp()
    });

    ta.value = '';
    document.getElementById('char-count').textContent = '0 / 2000';
    showToast('Saved to our diary 💖');
  } catch (e) {
    showToast('Failed to save: ' + e.message);
  } finally {
    btn.disabled = false;
    btnTxt.style.display = '';
    spin.style.display = 'none';
  }
};

/* ── REALTIME LISTENER ── */
function listenToEntries(user) {
  const container = document.getElementById('entries-container');
  const loadingEl = document.getElementById('loading-state');

  const q = query(collection(db, 'entries'), orderBy('createdAt', 'desc'));

  unsubEntries = onSnapshot(q, (snapshot) => {
    if (loadingEl) loadingEl.style.display = 'none';

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🌸</span>
          <p>Your diary is waiting for its first story…</p>
        </div>`;
      return;
    }

    container.innerHTML = '';
    let idx = 0;
    snapshot.forEach(d => {
      const data = { id: d.id, ...d.data() };
      const isMine = data.email?.toLowerCase() === user.email.toLowerCase();
      container.appendChild(buildCard(data, isMine, idx++));
    });

  }, (err) => {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">😢</span>
        <p>Could not load entries: ${err.message}</p>
      </div>`;
  });
}

/* ── BUILD ENTRY CARD ── */
function buildCard(data, isMine, idx) {
  const card = document.createElement('div');
  card.className = `entry-card ${isMine ? 'mine' : 'theirs'}`;
  card.style.animationDelay = (idx * 0.06) + 's';

  const name    = data.name || (data.email || 'someone').split('@')[0];
  const ci      = simpleHash(data.email || '') % AVATAR_COLORS.length;
  const timeStr = data.createdAt
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(data.createdAt.toDate())
    : 'Just now';

  const tag = isMine
    ? `<span class="mine-tag">You</span>`
    : `<span class="theirs-tag">💌 ${esc(name)}</span>`;

  const delBtn = isMine
    ? `<button class="btn-delete" onclick="window.delEntry('${data.id}', this)" title="Delete">🗑️</button>`
    : '';

  card.innerHTML = `
    <div class="entry-meta">
      <div class="entry-author">
        <div class="author-avatar" style="background:${AVATAR_COLORS[ci]}">${name[0].toUpperCase()}</div>
        <span class="author-name">${esc(name)}</span>
        ${tag}
      </div>
      <div class="entry-meta-right">
        <span class="entry-time">${timeStr}</span>
        ${delBtn}
      </div>
    </div>
    <div class="entry-body">${esc(data.text)}</div>`;

  return card;
}

/* ── DELETE ── */
window.delEntry = async function (docId, btn) {
  const card = btn.closest('.entry-card');
  if (card) card.style.opacity = '0.4';
  if (!confirm('Delete this entry? 💔')) {
    if (card) card.style.opacity = '';
    return;
  }
  try {
    await deleteDoc(doc(db, 'entries', docId));
    showToast('Entry deleted 🗑️');
  } catch (e) {
    if (card) card.style.opacity = '';
    showToast('Could not delete');
  }
};

/* ── Utils ── */
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}
  
