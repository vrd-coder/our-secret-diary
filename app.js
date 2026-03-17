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
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// 🔥 YOUR FIREBASE CONFIG (already set)
const firebaseConfig = {
  apiKey: "AIzaSyDxOUi53zfnq1YbfZxQbHKURfizZpsbc5A",
  authDomain: "our-secret-diary.firebaseapp.com",
  projectId: "our-secret-diary",
  storageBucket: "our-secret-diary.firebasestorage.app",
  messagingSenderId: "834741276150",
  appId: "1:834741276150:web:05063d4b78fefb9d7f4bd7"
};

// 🟡 Abhi empty (baad me emails daalna)
const ALLOWED_EMAILS = [];

// INIT
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

setPersistence(auth, browserLocalPersistence);


// 🌸 PETALS
function spawnPetals() {
  const container = document.getElementById("petals");
  if (!container) return;

  const symbols = ["🌸","🌺","💮","💗","🩷"];
  for (let i = 0; i < 15; i++) {
    const el = document.createElement("span");
    el.className = "petal";
    el.textContent = symbols[Math.floor(Math.random()*symbols.length)];
    el.style.left = Math.random()*100+"%";
    el.style.animationDuration = (6+Math.random()*10)+"s";
    el.style.animationDelay = Math.random()*10+"s";
    container.appendChild(el);
  }
}
spawnPetals();


// AUTH STATE
let unsubscribeEntries = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    showScreen("diary-screen");
    initDiary(user);
  } else {
    if (unsubscribeEntries) unsubscribeEntries();
    showScreen("auth-screen");
  }
});


// LOGIN
window.handleAuth = async function () {
  const email = document.getElementById("auth-email").value.trim().toLowerCase();
  const password = document.getElementById("auth-password").value;

  if (!email || !password) {
    alert("Enter email & password");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    await createUserWithEmailAndPassword(auth, email, password);
  }
};


// LOGOUT
window.handleLogout = async function () {
  if (unsubscribeEntries) unsubscribeEntries();
  await signOut(auth);
};


// INIT DIARY
function initDiary(user) {
  document.getElementById("user-badge").textContent = user.email;

  const textarea = document.getElementById("entry-text");
  textarea.addEventListener("input", () => {
    document.getElementById("char-count").textContent =
      textarea.value.length + " / 2000";
  });

  listenEntries(user);
}


// SAVE ENTRY
window.saveEntry = async function () {
  const user = auth.currentUser;
  const textarea = document.getElementById("entry-text");
  const text = textarea.value.trim();

  if (!text) return;

  await addDoc(collection(db, "entries"), {
    text,
    email: user.email,
    createdAt: serverTimestamp()
  });

  textarea.value = "";
};


// REALTIME LISTENER
function listenEntries(user) {
  const container = document.getElementById("entries-container");

  const q = query(
    collection(db, "entries"),
    orderBy("createdAt","desc")
  );

  unsubscribeEntries = onSnapshot(q, (snapshot) => {
    container.innerHTML = "";

    snapshot.forEach(doc => {
      const data = doc.data();

      const div = document.createElement("div");
      div.className = "entry-card";

      div.innerHTML = `
        <b>${data.email}</b><br>
        <small>${data.createdAt?.toDate()?.toLocaleString() || ""}</small>
        <p>${data.text}</p>
      `;

      container.appendChild(div);
    });
  });
}


// UI
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
    }
