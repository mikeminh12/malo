/* ===============================
   Malo Messenger – script.js
   =============================== */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, doc, setDoc, getDocs,
  deleteDoc, getDoc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   Helpers
   =============================== */
const $ = (id) => document.getElementById(id);
const toast = (t) =>
  Toastify({
    text: t,
    gravity: "top",
    position: "right",
    style: { background: "#3b82f6" }
  }).showToast();

/* ===============================
   State
   =============================== */
let myName = "";
let currentChat = null;
let unsubMsg = null;
let currentTab = "chats";

/* ===============================
   AUTH
   =============================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "index.html");

  myName = user.email.split("@")[0];

  await setDoc(
    doc(db, "users", myName),
    { username: myName },
    { merge: true }
  );

  loadMyAvatar();
  switchView("chats");
});

/* ===============================
   VIEW SWITCH
   =============================== */
window.switchView = (view) => {
  currentTab = view;

  const mainList = $("mainList");
  const tabChats = $("tabChats");
  const tabDiscover = $("tabDiscover");

  // Update Tab Styles
  if (view === "chats") {
    tabChats.className = "pb-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-colors";
    tabDiscover.className = "pb-3 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors";
    loadFriends();
  } else if (view === "discover") {
    tabDiscover.className = "pb-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-colors";
    tabChats.className = "pb-3 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors";
    loadDiscover();
  }
};

/* ===============================
   NAV EVENTS (SAFE)
   =============================== */
[
  ["navChat", "chats"],
  ["tabChats", "chats"],
  ["navDiscover", "discover"],
  ["tabDiscover", "discover"]
].forEach(([id, view]) => {
  const el = $(id);
  if (el) el.onclick = () => switchView(view);
});

/* ===============================
   AVATAR
   =============================== */
async function loadMyAvatar() {
  const snap = await getDoc(doc(db, "users", myName));
  const url = snap.data()?.photoURL;

  const avatarBox = $("avatarBox");
  const navAvatar = $("navAvatar");

  if (url) {
    const img = `<img src="${url}" class="w-full h-full object-cover rounded-full">`;
    avatarBox && (avatarBox.innerHTML = img);
    if (navAvatar) {
      navAvatar.innerHTML = img;
      navAvatar.style.cursor = "pointer";
      navAvatar.onclick = () => location.href = "account.html";
    }
  } else {
    avatarBox && (avatarBox.innerText = myName[0].toUpperCase());
    if (navAvatar) {
      navAvatar.innerText = myName[0].toUpperCase();
      navAvatar.style.cursor = "pointer";
      navAvatar.onclick = () => location.href = "account.html";
    }
  }
}

$("avatarBox")?.addEventListener("click", () => {
  $("fileInput")?.click();
});

$("fileInput")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "malo_preset");

  try {
    const res = await fetch(
      "https://api.cloudinary.com/v1_1/dmxz0m1x3/image/upload",
      { method: "POST", body: formData }
    );
    const data = await res.json();
    await updateDoc(doc(db, "users", myName), {
      photoURL: data.secure_url
    });
    loadMyAvatar();
    toast("Đã cập nhật ảnh");
  } catch {
    toast("Lỗi upload ảnh");
  }
});

window.handleLogout = () =>
  signOut(auth).then(() => (location.href = "index.html"));

/* ===============================
   DISCOVER
   =============================== */
window.sendRequest = async (target) => {
  await setDoc(
    doc(db, "users", target, "requests", myName),
    { from: myName, time: serverTimestamp() }
  );
  toast("Đã gửi lời mời");
  loadDiscover();
};

window.acceptFriend = async (who) => {
  await setDoc(doc(db, "users", myName, "friends", who), {
    time: serverTimestamp()
  });
  await setDoc(doc(db, "users", who, "friends", myName), {
    time: serverTimestamp()
  });
  await deleteDoc(doc(db, "users", myName, "requests", who));
  toast("Đã trở thành bạn bè");
  loadDiscover();
};

async function loadDiscover() {
  if (currentTab !== "discover") return;
  const mainList = $("mainList");
  if (!mainList) return;

  mainList.innerHTML = "";

  const reqSnap = await getDocs(collection(db, "users", myName, "requests"));
  const friendsSnap = await getDocs(collection(db, "users", myName, "friends"));
  const usersSnap = await getDocs(collection(db, "users"));

  const friends = friendsSnap.docs.map((d) => d.id);
  const incoming = reqSnap.docs.map((d) => d.id);

  reqSnap.forEach((d) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <b>${d.id}</b>
      <button onclick="acceptFriend('${d.id}')">Đồng ý</button>
    `;
    mainList.appendChild(div);
  });

  usersSnap.forEach((d) => {
    const id = d.id;
    if (id === myName || friends.includes(id) || incoming.includes(id)) return;

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <b>${id}</b>
      <button onclick="sendRequest('${id}')">Kết bạn</button>
    `;
    mainList.appendChild(div);
  });
}

/* ===============================
   FRIENDS + CHAT
   =============================== */
function loadFriends() {
  onSnapshot(collection(db, "users", myName, "friends"), async (snap) => {
    if (currentTab !== "chats") return;
    const mainList = $("mainList");
    if (!mainList) return;

    mainList.innerHTML = "";

    for (const d of snap.docs) {
      const id = d.id;
      const div = document.createElement("div");
      div.className = "card";
      div.innerHTML = `<b>${id}</b>`;
      div.onclick = () => startChat(id);
      mainList.appendChild(div);
    }
  });
}

async function startChat(target) {
  currentChat = target;
  $("chatTitle") && ($("chatTitle").innerText = target);

  const roomID = [myName, target].sort().join("_");

  unsubMsg && unsubMsg();

  const q = query(
    collection(db, "rooms", roomID, "messages"),
    orderBy("time")
  );

  unsubMsg = onSnapshot(q, (snap) => {
    const box = $("msgBox");
    if (!box) return;

    box.innerHTML = "";
    snap.forEach((d) => {
      const data = d.data();
      const isMe = data.uid === auth.currentUser.uid;

      const div = document.createElement("div");
      div.className = `msg ${isMe ? "me" : "them"}`;
      div.innerText = data.text;
      box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;
  });
}

$("btnSend")?.addEventListener("click", async () => {
  const txt = $("txtMsg");
  if (!txt || !txt.value || !currentChat) return;

  const roomID = [myName, currentChat].sort().join("_");

  await addDoc(collection(db, "rooms", roomID, "messages"), {
    text: txt.value,
    uid: auth.currentUser.uid,
    time: serverTimestamp()
  });

  txt.value = "";
});
