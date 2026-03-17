/**
 * Our Secret Diary 💖
 * ─────────────────────────────────────────────
 * Firebase Authentication + Firestore Realtime
 *
 * SETUP: Replace the firebaseConfig object below
 * with your own Firebase project credentials.
 * See README.md for full setup instructions.
 * ─────────────────────────────────────────────
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ═══════════════════════════════════════════════
//  🔧 FIREBASE CONFIG — REPLACE WITH YOUR OWN
// ═══════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            "AIzaSyDxOUi53zfnq1YbfZxQbHKURfizZpsbc5A",
  authDomain:        "our-secret-diary.firebaseapp.com",
  projectId:         "our-secret-diary",
  storageBucket:     "our-secret-diary.firebasestorage.app",
  messagingSenderId: "834741276150",
  appId:             "1:834741276150:web:05063d4b78fefb9d7f4bd7"
};

// ═══════════════════════════════════════════════
//  👥 ALLOWED USERS — ADD YOUR 2 EMAILS HERE
// ═══════════════════════════════════════════════
// Set to null = any logged-in user can access.
// Later lock it down: const ALLOWED_EMAILS = ["you@x.com", "her@x.com"];
const ALLOWED_EMAILS = null;

// ─── Init Firebase ───
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// Enable persistent login (stay logged in across refreshes)
setPersistence(auth, browserLocalPersistence);

// ─── Avatar colors for each user ───
const AVATAR_COLORS = ["#e8789a", "#7bb8d4", "#a08ec2", "#7ec48a"];


// ═══════════════════════════════════════════════
//  🌸 PETAL GENERATOR
// ═══════════════════════════════════════════════
function spawnPetals() {
  const container = document.getElementById("petals");
  const symbols   = ["🌸", "🌺", "💮", "✿", "🌷", "💖", "💗", "🩷"];
  for (let i = 0; i < 18; i++) {
    const petal = document.createElement("span");
    petal.className = "petal";
    petal.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    petal.style.left            = `${Math.random() * 100}%`;
    petal.style.fontSize        = `${0.7 + Math.random() * 1}rem`;
    petal.style.animationDuration = `${6 + Math.random() * 10}s`;
    petal.style.animationDelay  = `${Math.random() * 12}s`;
    container.appendChild(petal);
  }
}
spawnPetals();


// ═══════════════════════════════════════════════
//  🔐 AUTH STATE LISTENER
// ═══════════════════════════════════════════════
let unsubscribeEntries = null; // hold Firestore listener so we can detach on logout

onAuthStateChanged(auth, (user) => {
  if (user) {
    const email = user.email.toLowerCase();

    // If ALLOWED_EMAILS is null, anyone can log in.
    // Otherwise check the list (case-insensitive).
    const isAllowed = !ALLOWED_EMAILS ||
      ALLOWED_EMAILS.some(e => e.toLowerCase() === email);

    if (isAllowed) {
      showScreen("diary-screen");
      initDiary(user);
    } else {
      // Authenticated but not in the allowed list
      showScreen("blocked-screen");
    }
  } else {
    // Not logged in
    if (unsubscribeEntries) {
      unsubscribeEntries();
      unsubscribeEntries = null;
    }
    showScreen("auth-screen");
    clearDiaryUI();
  }
});


// ═══════════════════════════════════════════════
//  🔑 AUTH HANDLER — Sign in or auto-create
// ═══════════════════════════════════════════════
window.handleAuth = async function () {
  const email    = document.getElementById("auth-email").value.trim().toLowerCase();
  const name     = document.getElementById("auth-name").value.trim();
  const password = document.getElementById("auth-password").value;
  const errEl    = document.getElementById("auth-error");
  const infoEl   = document.getElementById("auth-info");

  hideEl(errEl); hideEl(infoEl);

  if (!email || !password) {
    showEl(errEl, "Please enter your email and password 💌");
    return;
  }
  if (password.length < 6) {
    showEl(errEl, "Password must be at least 6 characters");
    return;
  }

  setAuthLoading(true);

  try {
    // Try login first
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // If name provided, update it in Firestore
    if (name) await saveUserName(cred.user.uid, email, name);
    // onAuthStateChanged will handle navigation
  } catch (loginErr) {
    if (loginErr.code === "auth/user-not-found" || loginErr.code === "auth/invalid-credential") {
      // Auto-create account
      try {
        showEl(infoEl, "Creating your account… ✨");
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Save name on first signup
        await saveUserName(cred.user.uid, email, name || email.split("@")[0]);
      } catch (signupErr) {
        showEl(errEl, friendlyError(signupErr.code));
        setAuthLoading(false);
      }
    } else {
      showEl(errEl, friendlyError(loginErr.code));
      setAuthLoading(false);
    }
  }
};

// Save display name to Firestore users collection
async function saveUserName(uid, email, name) {
  await setDoc(doc(db, "users", uid), { name, email }, { merge: true });
}

// Fetch display name from Firestore (returns name or falls back to email prefix)
async function getUserName(uid, email) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists() && snap.data().name) return snap.data().name;
  } catch (e) {}
  return email.split("@")[0];
}

// Allow pressing Enter to submit
document.getElementById("auth-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.handleAuth();
});


// ═══════════════════════════════════════════════
//  🚪 LOGOUT
// ═══════════════════════════════════════════════
window.handleLogout = async function () {
  if (unsubscribeEntries) {
    unsubscribeEntries();
    unsubscribeEntries = null;
  }
  await signOut(auth);
};


// ═══════════════════════════════════════════════
//  📔 INIT DIARY — after successful auth
// ═══════════════════════════════════════════════
async function initDiary(user) {
  // Fetch name from Firestore and show in top bar
  const name = await getUserName(user.uid, user.email);
  document.getElementById("user-badge").textContent = `💌 ${name}`;

  // Store name on window so saveEntry can use it
  window._myName = name;

  // Show today's date in the write card
  document.getElementById("write-date").textContent = formatDateFull(new Date());

  // Character counter
  const textarea = document.getElementById("entry-text");
  textarea.addEventListener("input", () => {
    const len = textarea.value.length;
    document.getElementById("char-count").textContent = `${len} / 2000`;
  });

  // Start real-time listener
  listenToEntries(user);
}


// ═══════════════════════════════════════════════
//  💾 SAVE ENTRY
// ═══════════════════════════════════════════════
window.saveEntry = async function () {
  const user    = auth.currentUser;
  const textarea = document.getElementById("entry-text");
  const text     = textarea.value.trim();

  if (!text) {
    showToast("Write something first 📝");
    return;
  }

  setSaveLoading(true);

  try {
    await addDoc(collection(db, "entries"), {
      text,
      email:     user.email,
      uid:       user.uid,
      name:      window._myName || user.email.split("@")[0],
      createdAt: serverTimestamp()
    });

    // Clear textarea and counter
    textarea.value = "";
    document.getElementById("char-count").textContent = "0 / 2000";
    showToast("Saved to our diary 💖");
  } catch (err) {
    console.error("Save error:", err);
    showToast("Failed to save — try again 😢");
  } finally {
    setSaveLoading(false);
  }
};


// ═══════════════════════════════════════════════
//  📡 REAL-TIME LISTENER (onSnapshot)
// ═══════════════════════════════════════════════
function listenToEntries(user) {
  const container   = document.getElementById("entries-container");
  const loadingEl   = document.getElementById("loading-state");

  // If ALLOWED_EMAILS is set, filter to just those users.
  // Otherwise fetch all entries (open mode).
  const q = ALLOWED_EMAILS
    ? query(
        collection(db, "entries"),
        where("email", "in", ALLOWED_EMAILS.map(e => e.toLowerCase())),
        orderBy("createdAt", "desc")
      )
    : query(
        collection(db, "entries"),
        orderBy("createdAt", "desc")
      );

  unsubscribeEntries = onSnapshot(q, (snapshot) => {
    hideEl(loadingEl);

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🌸</span>
          <p>Your diary is waiting for its first story…</p>
        </div>`;
      return;
    }

    // Render entries
    container.innerHTML = "";
    snapshot.forEach((doc, idx) => {
      const data   = doc.data();
      const isMine = data.email?.toLowerCase() === user.email.toLowerCase();
      const card   = buildEntryCard(data, isMine, idx, doc.id);
      container.appendChild(card);
    });

  }, (err) => {
    console.error("Firestore listener error:", err);
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">😢</span>
        <p>Couldn't load entries. Check your connection.</p>
      </div>`;
  });
}


// ═══════════════════════════════════════════════
//  🃏 BUILD ENTRY CARD
// ═══════════════════════════════════════════════
function buildEntryCard(data, isMine, idx, docId) {
  const card = document.createElement("div");
  card.className = `entry-card ${isMine ? "mine" : "theirs"}`;
  card.style.animationDelay = `${idx * 0.06}s`;

  // Use saved name if available, fall back to email prefix
  const displayName = data.name || (data.email || "someone").split("@")[0];
  const initials    = displayName[0].toUpperCase();

  // Determine avatar color based on uid/email hash
  const colorIdx    = simpleHash(data.email || "") % AVATAR_COLORS.length;
  const avatarColor = AVATAR_COLORS[colorIdx];

  const timeStr = data.createdAt
    ? formatDate(data.createdAt.toDate())
    : "Just now";

  const tagEl = isMine
    ? `<span class="mine-tag">You</span>`
    : `<span class="theirs-tag">💌 ${displayName}</span>`;

  // Only show delete button on your own entries
  const deleteBtn = isMine
    ? `<button class="btn-delete" title="Delete entry" data-id="${docId}">🗑️</button>`
    : "";

  card.innerHTML = `
    <div class="entry-meta">
      <div class="entry-author">
        <div class="author-avatar" style="background:${avatarColor}">${initials}</div>
        <span class="author-name">${escapeHtml(displayName)}</span>
        ${tagEl}
      </div>
      <div class="entry-meta-right">
        <span class="entry-time">${timeStr}</span>
        ${deleteBtn}
      </div>
    </div>
    <div class="entry-body">${escapeHtml(data.text)}</div>
  `;

  // Attach delete handler
  if (isMine) {
    card.querySelector(".btn-delete").addEventListener("click", () => {
      confirmDelete(docId, card);
    });
  }

  return card;
}


// ═══════════════════════════════════════════════
//  🗑️ DELETE ENTRY
// ═══════════════════════════════════════════════
async function confirmDelete(docId, cardEl) {
  // Soft confirm — highlight card then ask
  cardEl.classList.add("deleting");

  const confirmed = window.confirm("Delete this entry from our diary? 💔");
  if (!confirmed) {
    cardEl.classList.remove("deleting");
    return;
  }

  try {
    await deleteDoc(doc(db, "entries", docId));
    // Card will disappear automatically via onSnapshot
    showToast("Entry deleted 🗑️");
  } catch (err) {
    console.error("Delete error:", err);
    cardEl.classList.remove("deleting");
    showToast("Couldn't delete — try again 😢");
  }
}


// ═══════════════════════════════════════════════
//  🛠️ HELPERS
// ═══════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function clearDiaryUI() {
  document.getElementById("entries-container").innerHTML =
    '<div class="loading-state" id="loading-state"><div class="loading-heart">💗</div><p>Loading your diary…</p></div>';
  document.getElementById("entry-text").value = "";
  document.getElementById("char-count").textContent = "0 / 2000";
  document.getElementById("auth-error").classList.add("hidden");
  document.getElementById("auth-info").classList.add("hidden");
  setAuthLoading(false);
}

function showEl(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}
function hideEl(el) { el.classList.add("hidden"); }

function setAuthLoading(on) {
  document.getElementById("auth-btn-text").classList.toggle("hidden", on);
  document.getElementById("auth-spinner").classList.toggle("hidden", !on);
  document.getElementById("auth-btn").disabled = on;
}
function setSaveLoading(on) {
  document.getElementById("save-btn-text").classList.toggle("hidden", on);
  document.getElementById("save-spinner").classList.toggle("hidden", !on);
  document.getElementById("save-btn").disabled = on;
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.classList.add("hidden"), 350);
  }, 2800);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
  }).format(date);
}

function formatDateFull(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", year: "numeric",
    month: "long", day: "numeric"
  }).format(date);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function friendlyError(code) {
  const map = {
    "auth/invalid-email":        "That doesn't look like a valid email 💌",
    "auth/wrong-password":       "Wrong password. Try again 🔐",
    "auth/too-many-requests":    "Too many attempts. Wait a moment ⏳",
    "auth/email-already-in-use": "This email already has an account",
    "auth/weak-password":        "Password must be at least 6 characters",
    "auth/network-request-failed": "No internet connection 🌐",
  };
  return map[code] || "Something went wrong. Please try again.";
}
  
