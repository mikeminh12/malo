/* ===============================
   DB MODULE
   =============================== */
import { db, auth } from "./config.js";
import {
    collection, addDoc, query, orderBy, onSnapshot,
    serverTimestamp, doc, setDoc, getDocs, deleteDoc, getDoc, limit, updateDoc, increment, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { $, toast, clearContainer, appendElement, scrollToBottom, renderTyping, formatTimestamp, renderFriendItem, renderPinnedMessage } from "./ui.js";

let unsubMsg = null;
let unsubTyping = null;
let currentChat = null;
const userCache = new Map(); // Cache user profiles

// HELPERS
export const getUserProfile = async (username) => {
    if (userCache.has(username)) return userCache.get(username);
    try {
        const snap = await getDoc(doc(db, "users", username));
        if (snap.exists()) {
            const data = snap.data();
            userCache.set(username, data);
            return data;
        }
    } catch (e) { console.error("Err fetching user", e); }
    return { displayName: username, photoURL: null };
};

export const setOnlineStatus = async (myName, isOnline) => {
    try {
        await updateDoc(doc(db, "users", myName), {
            isOnline: isOnline,
            lastSeen: serverTimestamp()
        });
    } catch (e) { console.log(e); } // Silent fail ok
};

// FRIENDS & DISCOVER
export const loadFriends = (myName, startChatCallback) => {
    clearContainer("mainList");
    onSnapshot(collection(db, "users", myName, "friends"), async (snap) => {
        const mainList = $("mainList");
        if (!mainList) return;

        // We clear here, but for smoother updates we might want to reconcile. 
        // For now simple clear is fine.
        mainList.innerHTML = "";

        // Convert to array to use Promise.all
        const friendsData = [];
        for (const d of snap.docs) {
            const friendID = d.id;
            const friendshipData = d.data(); // Contains unseenCount

            // Fetch profile
            const profile = await getUserProfile(friendID);

            friendsData.push({
                id: friendID,
                ...profile, // displayName, photoURL
                unseenCount: friendshipData.unseenCount || 0,
                isOnline: profile.isOnline // Note: Cache might be stale for online status. 
                // Better: Listen to users directly? Or just accept stale online status until page refresh? 
                // For true real-time online status we need a listener on the user doc.
                // Let's implement individual listeners for online status in the UI component or here.
                // For ease: We will rely on cache/initial fetch for now in this iteration.
            });
        }

        // Render
        friendsData.forEach(data => {
            const el = renderFriendItem(data);
            el.onclick = () => startChatCallback(data.id);
            mainList.appendChild(el);
        });
    });
};

export const loadDiscover = async (myName, actions) => {
    const mainList = $("mainList");
    if (!mainList) return;
    mainList.innerHTML = "";

    // Header
    const h1 = document.createElement("div");
    h1.className = "mb-4";
    h1.innerHTML = `<h2 class="text-xl font-bold text-slate-800">Khám phá</h2><p class="text-sm text-slate-500">Kết nối với bạn bè mới</p>`;
    mainList.appendChild(h1);

    const reqSnap = await getDocs(collection(db, "users", myName, "requests"));
    const friendsSnap = await getDocs(collection(db, "users", myName, "friends"));
    const usersSnap = await getDocs(collection(db, "users"));

    const friends = friendsSnap.docs.map((d) => d.id);
    const incoming = reqSnap.docs.map((d) => d.id);

    // 1. Friend Requests Section
    if (incoming.length > 0) {
        const reqHeader = document.createElement("div");
        reqHeader.className = "text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 mt-4 px-2";
        reqHeader.innerText = `Lời mời kết bạn (${incoming.length})`;
        mainList.appendChild(reqHeader);

        for (const d of reqSnap.docs) {
            const id = d.id;
            const profile = await getUserProfile(id);
            const div = document.createElement("div");
            div.className = "flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm mb-3 border border-blue-100";

            const avatarHtml = profile.photoURL
                ? `<img src="${profile.photoURL}" class="size-12 rounded-full object-cover">`
                : `<div class="size-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">${id[0].toUpperCase()}</div>`;

            div.innerHTML = `
                <div class="flex-shrink-0 relative">
                    ${avatarHtml}
                    <div class="absolute -bottom-1 -right-1 size-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center text-white">
                        <span class="material-symbols-outlined text-[10px]">person_add</span>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-slate-800 truncate">${profile.displayName || id}</h3>
                    <p class="text-xs text-slate-400">Đã gửi lời mời</p>
                </div>
                <button class="accept-btn bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-blue-600 transition-colors">
                    Đồng ý
                </button>
            `;

            div.querySelector(".accept-btn").onclick = () => actions.acceptFriend(id);
            mainList.appendChild(div);
        }
    }

    // 2. Suggestions Section
    const sugHeader = document.createElement("div");
    sugHeader.className = "text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6 px-2";
    sugHeader.innerText = "Gợi ý kết bạn";
    mainList.appendChild(sugHeader);

    let count = 0;
    for (const d of usersSnap.docs) {
        const id = d.id;
        if (id === myName || friends.includes(id) || incoming.includes(id)) continue;

        // Check if I SENT a request to them? (Optional complexity: check subcollection 'requests' on them... 
        // Firestore rules usually allow reading 'requests' subcollection if you are the sender? 
        // Or we just check local state? For MVP, skip checking outgoing requests)

        const profile = d.data(); // Users collection has profile data
        const displayName = profile.displayName || profile.username || id;

        const div = document.createElement("div");
        div.className = "flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm mb-3 hover:shadow-md transition-shadow group";

        const avatarHtml = profile.photoURL
            ? `<img src="${profile.photoURL}" class="size-12 rounded-full object-cover grayscale group-hover:grayscale-0 transition-all">`
            : `<div class="size-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">${displayName[0].toUpperCase()}</div>`;

        div.innerHTML = `
            <div class="flex-shrink-0">
                ${avatarHtml}
            </div>
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-slate-800 truncate group-hover:text-blue-600 transition-colors">${displayName}</h3>
                <p class="text-xs text-slate-400 truncate">Người dùng mới</p>
            </div>
            <button class="add-btn px-3 py-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-1">
                <span class="material-symbols-outlined text-[18px]">add</span>
                <span class="hidden sm:inline">Kết bạn</span>
            </button>
        `;

        div.querySelector(".add-btn").onclick = (e) => {
            const btn = e.currentTarget;
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span>`;
            actions.sendRequest(id).then(() => {
                btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">check</span> Đã gửi`;
                btn.classList.replace("bg-slate-100", "bg-green-50");
                btn.classList.replace("text-slate-600", "text-green-600");
                btn.disabled = true;
            });
        };
        mainList.appendChild(div);
        count++;
    }

    if (count === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "text-center py-10 text-slate-400";
        emptyDiv.innerHTML = `<p>Không có gợi ý nào mới.</p>`;
        mainList.appendChild(emptyDiv);
    }
};

export const sendRequest = async (myName, target) => {
    await setDoc(doc(db, "users", target, "requests", myName), { from: myName, time: serverTimestamp() });
    toast("Đã gửi lời mời", "success");
};

export const acceptFriend = async (myName, who) => {
    await setDoc(doc(db, "users", myName, "friends", who), { time: serverTimestamp() });
    await setDoc(doc(db, "users", who, "friends", myName), { time: serverTimestamp() });
    await deleteDoc(doc(db, "users", myName, "requests", who));
    toast("Đã trở thành bạn bè", "success");
};

// CHAT & TYPING
export const startChat = (myName, target) => {
    currentChat = target;
    const title = $("chatTitle");
    if (title) title.innerText = target;

    const roomID = [myName, target].sort().join("_");

    if (unsubMsg) unsubMsg();
    if (unsubTyping) unsubTyping();

    // Reset Unseen Count
    updateDoc(doc(db, "users", myName, "friends", target), { unseenCount: 0 });

    // 1. Listen for Typing
    // Logic: Listen to the OTHER person's typing status
    // The collection could be 'typing' inside the room doc, or a top level one. 
    // Let's use `rooms/{roomID}/typing/{userID}`
    unsubTyping = onSnapshot(doc(db, "rooms", roomID, "typing", target), (doc) => {
        const isTyping = doc.exists() && doc.data().isTyping;
        renderTyping(isTyping);
    });

    // 2. Load Messages (and Room Info for Pinned)

    // Listen to Room for Pinned Message
    onSnapshot(doc(db, "rooms", roomID), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            renderPinnedMessage(data.pinnedMessage);
        } else {
            renderPinnedMessage(null);
        }
    });

    const q = query(
        collection(db, "rooms", roomID, "messages"),
        orderBy("time", "asc")
    );

    unsubMsg = onSnapshot(q, async (snap) => {
        const box = $("msgBox");
        if (!box) return;

        const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
        const isFirstLoad = box.childElementCount === 0;

        box.innerHTML = "";

        // --- TIMESTAMP LOGIC ---
        const getSepDateStr = (date) => {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);

            if (date.toDateString() === today.toDateString()) return "Hôm nay";
            if (date.toDateString() === yesterday.toDateString()) return "Hôm qua";
            return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        const getSep = (d1, d2) => {
            if (!d2) return null;
            const date2 = d2.toDate ? d2.toDate() : d2;

            if (!d1) return getSepDateStr(date2); // First message

            const date1 = d1.toDate ? d1.toDate() : d1;

            // Check Different Day
            if (date1.toDateString() !== date2.toDateString()) {
                return getSepDateStr(date2);
            }

            // Check Same Day but > 30 mins gap
            const diff = date2 - date1;
            if (diff > 30 * 60 * 1000) {
                return date2.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            }

            return null;
        };

        const docs = snap.docs.slice(-50);
        let lastTime = null;

        // Partner Profile
        let partnerProfile = { displayName: target, photoURL: null };
        if (currentChat) partnerProfile = await getUserProfile(currentChat);

        for (const d of docs) {
            const data = d.data();
            const id = d.id;
            const isMe = auth.currentUser && data.uid === auth.currentUser.uid;

            // Handle Timestamp being null (pending write)
            const msgTime = data.time || new Date();

            // --- RENDER SEPARATOR ---
            const sepText = getSep(lastTime, msgTime);
            if (sepText) {
                const sepDiv = document.createElement("div");
                sepDiv.className = "flex justify-center my-6";
                sepDiv.innerHTML = `<span class="text-[11px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-wide select-none border border-slate-100">${sepText}</span>`;
                box.appendChild(sepDiv);
            }
            lastTime = msgTime;

            // --- RENDER MESSAGE ---
            // Mark as seen if it's from them and not seen
            if (!isMe && data.status !== 'seen') updateDoc(d.ref, { status: 'seen' });

            const row = document.createElement("div");
            row.className = `flex w-full mb-4 gap-3 ${isMe ? 'justify-end' : 'justify-start'} group`;

            // Avatar (Only for Them)
            if (!isMe) {
                const avatarDiv = document.createElement("div");
                avatarDiv.className = "flex-shrink-0 self-end";
                if (partnerProfile.photoURL) {
                    avatarDiv.innerHTML = `<img src="${partnerProfile.photoURL}" class="size-8 rounded-full object-cover bg-gray-200">`;
                } else {
                    const name = partnerProfile.displayName || "User";
                    avatarDiv.innerHTML = `<div class="size-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">${name[0].toUpperCase()}</div>`;
                }
                row.appendChild(avatarDiv);
            }

            // Message Bubble Wrapper
            const bubbleWrapper = document.createElement("div");
            bubbleWrapper.className = `relative max-w-[70%]`;

            const bubble = document.createElement("div");
            bubble.className = `p-4 rounded-2xl text-sm font-medium shadow-sm break-words ${isMe ? 'bg-gradient-to-tr from-blue-600 to-blue-500 text-white rounded-br-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-bl-sm'}`;

            if (data.status === 'deleted') {
                bubble.innerHTML = `<span class="italic opacity-80 decoration-slice">Tin nhắn đã thu hồi</span>`;
            } else {
                // Reply UI
                let replyHtml = "";
                if (data.replyTo) {
                    const isReplyMe = data.replyTo.uid === auth.currentUser.uid;
                    replyHtml = `
                    <div class="mb-2 pl-2 border-l-2 ${isMe ? 'border-coral-200 bg-black/10' : 'border-blue-500 bg-blue-50'} rounded text-xs p-1 cursor-pointer hover:opacity-80 transition-opacity" onclick="document.getElementById('${data.replyTo.id}')?.scrollIntoView({behavior:'smooth', block:'center'})">
                        <span class="font-bold block opacity-90 mb-0.5">${data.replyTo.name}</span>
                        <span class="truncate block opacity-80">${data.replyTo.text}</span>
                    </div>`;
                }

                const contentHtml = `<div>${data.text}</div>`;

                const timeStr = formatTimestamp(data.time);
                let statusIcon = "";
                if (isMe) {
                    if (data.status === 'seen' || data.status === 'delivered') statusIcon = 'done_all';
                    else statusIcon = 'check';
                }

                const metaHtml = `
                <div class="flex items-center justify-end gap-1 mt-1 opacity-70 text-[10px] select-none">
                    <span>${timeStr}</span>
                    ${isMe ? `<span class="material-symbols-outlined text-[12px]">${statusIcon}</span>` : ''}
                </div>`;

                bubble.innerHTML = replyHtml + contentHtml + metaHtml;
            }

            // Actions Menu
            const actionsDiv = document.createElement("div");
            actionsDiv.className = `absolute -top-8 ${isMe ? 'right-0' : 'left-0'} hidden group-hover:flex items-center gap-1 bg-white shadow-md border border-gray-100 rounded-full px-2 py-1 z-10`;
            actionsDiv.innerHTML = `
            <button title="Reply" onclick="window.handleReply('${id}', '${data.uid}', \`${data.text}\`)" class="p-1 hover:text-blue-600 text-slate-400 transition-colors"><span class="material-symbols-outlined text-[18px]">reply</span></button>
            <button title="Pin" onclick="window.handlePin('${id}', \`${data.text}\`)" class="p-1 hover:text-blue-600 text-slate-400 transition-colors"><span class="material-symbols-outlined text-[18px]">keep</span></button>
            ${isMe && data.status !== 'deleted' ? `<button title="Delete" onclick="window.handleDelete('${id}')" class="p-1 hover:text-red-500 text-slate-400 transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>` : ''}
            `;

            bubbleWrapper.appendChild(actionsDiv);
            bubbleWrapper.appendChild(bubble);
            row.appendChild(bubbleWrapper);
            row.id = id;
            box.appendChild(row);
        }

        if (wasAtBottom || isFirstLoad) {
            scrollToBottom("msgBox");
        }
    });
};

export const sendMessage = async (myName, text, replyTo = null) => {
    if (!text || !text.trim()) {
        toast("Tin nhắn trống", "error");
        return;
    }
    if (!currentChat) return;

    const roomID = [myName, currentChat].sort().join("_");

    try {
        const msgData = {
            text: text.trim(),
            uid: auth.currentUser.uid,
            time: serverTimestamp(),
            status: 'sent'
        };
        if (replyTo) msgData.replyTo = replyTo;

        await addDoc(collection(db, "rooms", roomID, "messages"), msgData);

        // Increment Unseen Count
        const friendRef = doc(db, "users", currentChat, "friends", myName);
        updateDoc(friendRef, { unseenCount: increment(1) }).catch(e => console.log("Friendship update err", e));

    } catch (e) {
        console.error(e);
        toast("Lỗi gửi tin", "error");
    }
};

export const deleteMessage = async (myName, msgID) => {
    if (!currentChat) return;
    const roomID = [myName, currentChat].sort().join("_");
    try {
        await updateDoc(doc(db, "rooms", roomID, "messages", msgID), { status: "deleted" });
        toast("Đã thu hồi tin nhắn", "success");
    } catch (e) { toast("Lỗi khi xóa", "error"); }
};

export const pinMessage = async (myName, msgData) => {
    if (!currentChat) return;
    const roomID = [myName, currentChat].sort().join("_");
    try {
        // Set room-level pinned message
        await setDoc(doc(db, "rooms", roomID), { pinnedMessage: msgData }, { merge: true });
        toast("Đã ghim tin nhắn", "success");
    } catch (e) { toast("Lỗi ghim", "error"); }
};

export const unpinMessage = async (myName) => {
    if (!currentChat) return;
    const roomID = [myName, currentChat].sort().join("_");
    try {
        await updateDoc(doc(db, "rooms", roomID), { pinnedMessage: deleteField() });
        toast("Đã bỏ ghim", "success");
    } catch (e) { toast("Lỗi bỏ ghim", "error"); }
};

let typingTimeout = null;
export const setTyping = async (myName, isTyping) => {
    if (!currentChat) return;
    const roomID = [myName, currentChat].sort().join("_");

    // Determine my ID (username) or uid. Since we use username for roomID logic, 
    // but auth.currentUser.uid for message ID, let's use the USERNAME as key in typing doc for consistency with startChat target

    const myRef = doc(db, "rooms", roomID, "typing", myName);

    if (isTyping) {
        await setDoc(myRef, { isTyping: true });

        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            setDoc(myRef, { isTyping: false });
        }, 2000);
    } else {
        await setDoc(myRef, { isTyping: false });
    }
};

export const getCurrentChat = () => currentChat;
