import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDxOUi53zfnq1YbfZxQbHKURfizZpsbc5A",
  authDomain: "our-secret-diary.firebaseapp.com",
  projectId: "our-secret-diary",
  storageBucket: "our-secret-diary.firebasestorage.app",
  messagingSenderId: "834741276150",
  appId: "1:834741276150:web:05063d4b78fefb9d7f4bd7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let unsubscribe = null;

/* 🌸 PETALS */
function spawnPetals(){
  const c = document.getElementById("petals");
  if(!c) return;

  const arr = ["🌸","💗","🩷"];
  for(let i=0;i<15;i++){
    const e = document.createElement("span");
    e.className="petal";
    e.textContent=arr[Math.floor(Math.random()*arr.length)];
    e.style.left=Math.random()*100+"%";
    e.style.animationDuration=(6+Math.random()*10)+"s";
    c.appendChild(e);
  }
}
spawnPetals();

/* AUTH STATE */
onAuthStateChanged(auth,user=>{
  if(user){
    show("diary-screen");

    const name = localStorage.getItem("diaryName");
    document.getElementById("user-badge").innerText = name || user.email;

    loadEntries();
  }else{
    show("auth-screen");
  }
});

/* LOGIN */
window.handleAuth = async function(){
  const name = document.getElementById("auth-name").value.trim();
  const email = document.getElementById("auth-email").value;
  const pass = document.getElementById("auth-password").value;

  const finalName = name || "You 💖";
  localStorage.setItem("diaryName", finalName);

  try{
    await signInWithEmailAndPassword(auth,email,pass);
  }catch{
    await createUserWithEmailAndPassword(auth,email,pass);
  }
};

/* LOGOUT */
window.handleLogout = async function(){
  if(unsubscribe) unsubscribe();
  await signOut(auth);
};

/* SAVE */
window.saveEntry = async function(){
  const text = document.getElementById("entry-text").value.trim();
  if(!text) return;

  await addDoc(collection(db,"entries"),{
    text,
    name: localStorage.getItem("diaryName"),
    email: auth.currentUser.email,
    createdAt: serverTimestamp()
  });

  document.getElementById("entry-text").value="";
};

/* LOAD */
function loadEntries(){
  const container = document.getElementById("entries-container");

  const q = query(collection(db,"entries"), orderBy("createdAt","desc"));

  unsubscribe = onSnapshot(q,snap=>{
    container.innerHTML="";

    snap.forEach(docSnap=>{
      const data = docSnap.data();
      const id = docSnap.id;

      const isMine = data.email === auth.currentUser.email;

      const div = document.createElement("div");
      div.className="entry-card";

      div.innerHTML = `
        <b>${data.name || data.email}</b><br>
        <small>${data.createdAt?.toDate()?.toLocaleString() || ""}</small>
        <p>${data.text}</p>
        ${isMine ? `<button class="delete-btn" onclick="deleteEntry('${id}')">Delete</button>` : ""}
      `;

      container.appendChild(div);
    });
  });
}

/* DELETE */
window.deleteEntry = async function(id){
  await deleteDoc(doc(db,"entries",id));
};

/* UI */
function show(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}     }
