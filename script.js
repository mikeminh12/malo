import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, addDoc, query, orderBy, onSnapshot, serverTimestamp,
    doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc, limit, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let myName = "";
let currentChat = null;
let unsubMsg = null;
let currentTab = "chats";

const toast = (t) => Toastify({ text: t, gravity: "top", position: "right", style: { background: "#0068ff" } }).showToast();

/* --- 1. KHỞI TẠO HỆ THỐNG --- */
function listenNotifications() {
    // 1. Lắng nghe yêu cầu kết bạn (Khám phá)
    onSnapshot(collection(db, "users", myName, "requests"), (snap) => {
        const count = snap.size; // Lấy số lượng document trong collection requests
        updateBadge("badgeDiscover", count);
        updateBadge("badgeDiscoverPC", count);
    });

    // 2. Lắng nghe tin nhắn chưa đọc (Nếu bạn có trường 'unread' trong rooms)
    // Phần này tùy thuộc vào cấu trúc database tin nhắn của bạn
}

function updateBadge(id, count) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (count > 0) {
        el.innerText = count > 9 ? "9+" : count;
        el.style.display = "flex";
    } else {
        el.style.display = "none";
    }
}
onAuthStateChanged(auth, async user => {
    if (!user) return location.href = "index.html";
    myName = user.email.split("@")[0];
    
    // Đảm bảo thông tin user luôn cập nhật
    await setDoc(doc(db, "users", myName), { username: myName }, { merge: true });
    
    loadMyAvatar();
    switchView('chats');
    listenNotifications();
});

/* --- 2. ĐIỀU HƯỚNG GIAO DIỆN --- */
window.switchView = (view) => {
    currentTab = view;
    const mainList = document.getElementById("mainList");
    const accountView = document.getElementById("accountView");

    mainList.style.display = "none";
    accountView.style.display = "none";

    document.querySelectorAll('.tab, .nav-item, .side-btn').forEach(el => el.classList.remove('active'));

    if (view === 'account') {
        accountView.style.display = "flex";
        document.getElementById("displayMyName").innerText = myName;
        loadMyAvatar();
        document.getElementById('navAccount')?.classList.add('active');
        document.getElementById('btnAccountPC')?.classList.add('active');
    } else if (view === 'chats') {
        mainList.style.display = "block";
        loadFriends();
        document.getElementById('tabChats')?.classList.add('active');
        document.getElementById('navChat')?.classList.add('active');
    } else if (view === 'discover') {
        mainList.style.display = "block";
        loadDiscover();
        document.getElementById('tabDiscover')?.classList.add('active');
        document.getElementById('navDiscover')?.classList.add('active');
    }
};

// Gán sự kiện Click cho Nav
['navChat', 'tabChats'].forEach(id => document.getElementById(id).onclick = () => switchView('chats'));
['navDiscover', 'tabDiscover'].forEach(id => document.getElementById(id).onclick = () => switchView('discover'));
['navAccount', 'btnAccountPC'].forEach(id => document.getElementById(id).onclick = () => switchView('account'));

/* --- 3. QUẢN LÝ TÀI KHOẢN --- */
async function loadMyAvatar() {
    const myDoc = await getDoc(doc(db, "users", myName));
    const url = myDoc.data()?.photoURL;
    const avatarBox = document.getElementById('avatarBox');
    const navAvatar = document.getElementById('navAvatar');

    if (url) {
        const img = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        avatarBox.innerHTML = img;
        if (navAvatar) navAvatar.innerHTML = img;
    } else {
        avatarBox.innerHTML = myName[0].toUpperCase();
    }
}

document.getElementById('avatarBox').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "malo_preset");

    try {
        const res = await fetch("https://api.cloudinary.com/v1_1/dmxz0m1x3/image/upload", { method: "POST", body: formData });
        const data = await res.json();
        await updateDoc(doc(db, "users", myName), { photoURL: data.secure_url });
        loadMyAvatar();
        toast("Đã cập nhật ảnh!");
    } catch (err) { toast("Lỗi tải ảnh"); }
};

window.handleLogout = () => signOut(auth).then(() => location.href = "index.html");

/* --- 4. KHÁM PHÁ & KẾT BẠN --- */
window.sendRequest = async (targetUser) => {
    const btn = document.getElementById(`btn-add-${targetUser}`);
    btn.disabled = true;
    btn.innerText = "...";
    try {
        await setDoc(doc(db, "users", targetUser, "requests", myName), { from: myName, time: serverTimestamp() });
        btn.innerText = "Đã gửi";
        btn.className = "btn-add btn-sent";
        toast("Đã gửi lời mời!");
    } catch (e) { btn.disabled = false; btn.innerText = "Kết bạn"; }
};

window.acceptFriend = async (who) => {
    try {
        // 1. Thêm vào danh sách bạn bè của cả hai
        await setDoc(doc(db, "users", myName, "friends", who), { time: serverTimestamp() });
        await setDoc(doc(db, "users", who, "friends", myName), { time: serverTimestamp() });
        // 2. Xóa lời mời
        await deleteDoc(doc(db, "users", myName, "requests", who));
        toast("Đã trở thành bạn bè!");
        loadDiscover(); // Refresh lại danh sách
    } catch (e) { toast("Lỗi xử lý"); }
};

async function renderUserCard(userId) {
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.data();
    const avatarHTML = userData?.photoURL ? `<img src="${userData.photoURL}" class="avatar">` : `<div class="avatar">${userId[0].toUpperCase()}</div>`;

    const div = document.createElement("div");
    div.className = "card";
    div.style.justifyContent = "space-between";
    div.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px">
            ${avatarHTML} <b>${userId}</b>
        </div>
        <button onclick="acceptFriend('${userId}')" class="btn-add btn-accept" style="background:#4caf50">Đồng ý</button>
    `;
    document.getElementById("mainList").appendChild(div);
}

async function loadDiscover() {
    if (currentTab !== "discover") return;
    const mainList = document.getElementById("mainList");
    mainList.innerHTML = "";

    try {
        const [reqSnap, friendsSnap, allUsersSnap] = await Promise.all([
            getDocs(collection(db, "users", myName, "requests")),
            getDocs(collection(db, "users", myName, "friends")),
            getDocs(collection(db, "users"))
        ]);

        const friendList = friendsSnap.docs.map(doc => doc.id);
        const incomingReqs = reqSnap.docs.map(doc => doc.id);

        mainList.innerHTML += "<div style='padding:15px; font-weight:bold; color:var(--blue)'>Lời mời kết bạn</div>";
        if (reqSnap.empty) mainList.innerHTML += "<p style='padding:0 15px; color:#999; font-size:13px'>Không có lời mời</p>";
        else {
            for (const d of reqSnap.docs) await renderUserCard(d.id);
        }

        mainList.innerHTML += "<div style='padding:15px; font-weight:bold; color:gray; margin-top:10px'>Gợi ý kết bạn</div>";
        allUsersSnap.forEach(d => {
            const userId = d.id;
            const userData = d.data();
            if (userId !== myName && !friendList.includes(userId) && !incomingReqs.includes(userId)) {
                const div = document.createElement("div");
                div.className = "card";
                div.style.justifyContent = "space-between";
                const avatar = userData.photoURL ? `<img src="${userData.photoURL}" class="avatar">` : `<div class="avatar">${userId[0].toUpperCase()}</div>`;
                div.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px">${avatar} <b>${userId}</b></div>
                    <button id="btn-add-${userId}" onclick="sendRequest('${userId}')" class="btn-add">Kết bạn</button>
                `;
                mainList.appendChild(div);
            }
        });
    } catch (e) { toast("Lỗi tải khám phá"); }
}

/* --- 5. TIN NHẮN --- */
function loadFriends() {
    onSnapshot(collection(db, "users", myName, "friends"), async (snap) => {
        if (currentTab !== 'chats') return;
        const mainList = document.getElementById("mainList");
        mainList.innerHTML = "";

        for (const d of snap.docs) {
            const friendId = d.id;
            const userSnap = await getDoc(doc(db, "users", friendId));
            const userData = userSnap.data();
            
            const div = document.createElement("div");
            div.className = "card";
            div.style.alignItems = "center"; // Căn giữa theo chiều dọc
            
            const avatar = userData?.photoURL 
                ? `<img src="${userData.photoURL}">` 
                : friendId[0].toUpperCase();

            div.innerHTML = `
                <div class="avatar">${avatar}</div>
                <div style="flex:1; margin-left: 12px;">
                    <b style="font-size: 16px;">${friendId}</b>
                </div>
                <div id="badge-container-${friendId}"></div>
            `;
            
            div.onclick = () => startChat(friendId);
            mainList.appendChild(div);
            
            listenLastMessage(friendId);
        }
    });
}

// Hàm lắng nghe tin nhắn cuối cùng và hiển thị Badge
function listenLastMessage(friendId) {
    const roomID = [myName, friendId].sort().join("_");

    const q = query(
        collection(db, "rooms", roomID, "messages"),
        orderBy("time", "desc")
    );

    onSnapshot(q, (snap) => {
        const badgeCont = document.getElementById(`badge-container-${friendId}`);
        if (!badgeCont) return;

        let unreadCount = 0;

        snap.forEach(doc => {
            const data = doc.data();
            if (
                data.uid !== auth.currentUser.uid &&
                !data.seenBy?.includes(myName)
            ) {
                unreadCount++;
            }
        });

        if (unreadCount > 0) {
            badgeCont.innerHTML =
                `<span class="msg-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>`;
        } else {
            badgeCont.innerHTML = "";
        }
    });
}
// Bắt nút Back trên mobile
window.addEventListener("popstate", () => {
    if (document.body.classList.contains("is-chatting")) {
        closeChat();
    }
});



async function startChat(target) {
    currentChat = target;

    // Push history để back hoạt động
    history.pushState({ chat: true }, "");

    document.getElementById("chatTitle").innerText = target;
    document.body.classList.add("is-chatting");

    // clear badge UI
    const badge = document.getElementById(`badge-container-${target}`);
    if (badge) badge.innerHTML = "";

    const roomID = [myName, target].sort().join("_");

    if (typeof unsubMsg === "function") {
        unsubMsg();
        unsubMsg = null;
    }

    // MARK ALL AS READ
    const qUnread = query(
        collection(db, "rooms", roomID, "messages"),
        where("uid", "!=", auth.currentUser.uid)
    );

    const snap = await getDocs(qUnread);
    for (const docSnap of snap.docs) {
        const data = docSnap.data();
        if (!data.seenBy?.includes(myName)) {
            await updateDoc(docSnap.ref, {
                seenBy: [...(data.seenBy || []), myName]
            });
        }
    }

    const q = query(
        collection(db, "rooms", roomID, "messages"),
        orderBy("time")
    );

    unsubMsg = onSnapshot(q, snap => {
        const box = document.getElementById("msgBox");
        box.innerHTML = "";

        snap.forEach(d => {
            const data = d.data();
            const isMe = data.uid === auth.currentUser.uid;

            const time = data.time
                ? new Date(data.time.toDate()).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                })
                : "";

            const div = document.createElement("div");
            div.className = `msg ${isMe ? "me" : "them"}`;
            div.innerHTML = `
                <div>${data.text}</div>
                <div class="msg-time">${time}</div>
            `;
            box.appendChild(div);
        });

        box.scrollTop = box.scrollHeight;
    });
}



window.closeChat = () => {
    document.body.classList.remove("is-chatting");
    currentChat = null;

    // Quay về state trước (tránh bị kẹt history)
    if (history.state?.chat) {
        history.back();
    }
};


document.getElementById("btnSend").onclick = async () => {
    const msg = document.getElementById("txtMsg").value;
    if (!msg || !currentChat) return;
    const roomID = [myName, currentChat].sort().join("_");
    await addDoc(collection(db, "rooms", roomID, "messages"), {
        text: msg,
        uid: auth.currentUser.uid,
        time: serverTimestamp()
    });
    document.getElementById("txtMsg").value = "";
};
