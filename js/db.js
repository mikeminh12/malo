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

    const reqSnap = await getDocs(collection(db, "users", myName, "requests"));
    const friendsSnap = await getDocs(collection(db, "users", myName, "friends"));
    const usersSnap = await getDocs(collection(db, "users"));

    const friends = friendsSnap.docs.map((d) => d.id);
    const incoming = reqSnap.docs.map((d) => d.id);

    reqSnap.forEach((d) => {
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `<b>${d.id}</b><button class="accept-btn" data-id="${d.id}">Đồng ý</button>`;
        div.querySelector(".accept-btn").onclick = () => actions.acceptFriend(d.id);
        mainList.appendChild(div);
    });

    usersSnap.forEach((d) => {
        const id = d.id;
        if (id === myName || friends.includes(id) || incoming.includes(id)) return;
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `<b>${id}</b><button class="add-btn" data-id="${id}">Kết bạn</button>`;
        div.querySelector(".add-btn").onclick = () => actions.sendRequest(id);
        mainList.appendChild(div);
    });
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

        // Smart Scroll Logic:
        // 1. Check if we are currently at the bottom (before wiping content)
        // 2. OR if the box is empty (first load)
        const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
        const isFirstLoad = box.childElementCount === 0;

        box.innerHTML = "";

        const docs = snap.docs.slice(-50);

        // Get partner profile once if possible, or use getUserProfile which caches
        let partnerProfile = { displayName: target, photoURL: null };
        if (currentChat) {
            partnerProfile = await getUserProfile(currentChat);
        }

        for (const d of docs) {
            const data = d.data();
            const id = d.id;
            const isMe = auth.currentUser && data.uid === auth.currentUser.uid;

            // Mark as seen
            if (!isMe && data.status !== 'seen') {
                updateDoc(d.ref, { status: 'seen' });
            }

            // Wrapper Row
            const row = document.createElement("div");
            row.className = `flex w-full mb-4 gap-3 ${isMe ? 'justify-end' : 'justify-start'} group`; // Group on row

            // Avatar (Only for Them)
            if (!isMe) {
                const avatarDiv = document.createElement("div");
                avatarDiv.className = "flex-shrink-0 self-end"; // Align bottom or top? Usually bottom for chat bubbles
                if (partnerProfile.photoURL) {
                    avatarDiv.innerHTML = `<img src="${partnerProfile.photoURL}" class="size-8 rounded-full object-cover bg-gray-200">`;
                } else {
                    const name = partnerProfile.displayName || "User";
                    avatarDiv.innerHTML = `<div class="size-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">${name[0].toUpperCase()}</div>`;
                }
                row.appendChild(avatarDiv);
            }

            // Message Bubble Wrapper (Relative for actions)
            const bubbleWrapper = document.createElement("div");
            bubbleWrapper.className = `relative max-w-[70%]`; // Limit width

            const bubble = document.createElement("div");
            // Reuse msg classes but remove self alignment since row handles it
            // .msg in CSS has self-start/end, we can override or use inline styles or utility classes.
            // Let's use Tailwind utilities directly for structure and keep styling
            bubble.className = `p-4 rounded-2xl text-sm font-medium shadow-sm break-words ${isMe ? 'bg-gradient-to-tr from-blue-600 to-blue-500 text-white rounded-br-sm' : 'bg-white border border-slate-100 text-slate-700 rounded-bl-sm'}`;

            // Deleted
            if (data.status === 'deleted') {
                bubble.innerHTML = `<span class="italic opacity-80 decoration-slice">Tin nhắn đã thu hồi</span>`; // opacity-80 works for white text too
            } else {
                // Reply
                let replyHtml = "";
                if (data.replyTo) {
                    const isReplyMe = data.replyTo.uid === auth.currentUser.uid; // Did I write the msg being replied to?
                    replyHtml = `
                <div class="mb-2 pl-2 border-l-2 ${isMe ? 'border-blue-300 bg-black/10' : 'border-blue-500 bg-blue-50'} rounded text-xs p-1 cursor-pointer hover:opacity-80 transition-opacity" onclick="document.getElementById('${data.replyTo.id}')?.scrollIntoView({behavior:'smooth', block:'center'})">
                    <span class="font-bold block opacity-90 mb-0.5">${data.replyTo.name}</span>
                    <span class="truncate block opacity-80">${data.replyTo.text}</span>
                </div>`;
                }

                // Content
                const contentHtml = `<div>${data.text}</div>`;

                // Meta
                const timeStr = formatTimestamp(data.time);
                let statusIcon = "";
                if (isMe) {
                    if (data.status === 'seen') statusIcon = 'done_all';
                    else if (data.status === 'delivered') statusIcon = 'done_all';
                    else statusIcon = 'check';
                }

                const metaHtml = `
                <div class="flex items-center justify-end gap-1 mt-1 opacity-70 text-[10px] select-none">
                    <span>${timeStr}</span>
                    ${isMe ? `<span class="material-symbols-outlined text-[12px]">${statusIcon}</span>` : ''}
                </div>
            `;

                bubble.innerHTML = replyHtml + contentHtml + metaHtml;
            }

            // Actions Menu (Positioned ABSOLUTE on the Bubble Wrapper, visible on ROW hover)
            // Position: Top Right of the bubble for both (or Top Left for me?)
            // Let's put it on the side or top.
            // "Hard to use" -> let's make it sit right on top of the message with negative margin,
            // and add a delay or invisible alignment? 
            // Best: Absolute Top Right (-25px).

            const actionsDiv = document.createElement("div");
            actionsDiv.className = `absolute -top-8 ${isMe ? 'right-0' : 'left-0'} hidden group-hover:flex items-center gap-1 bg-white shadow-md border border-gray-100 rounded-full px-2 py-1 z-10`;

            actionsDiv.innerHTML = `
            <button title="Reply" onclick="window.handleReply('${id}', '${data.uid}', \`${data.text}\`)" class="p-1 hover:text-blue-600 text-slate-400 transition-colors"><span class="material-symbols-outlined text-[18px]">reply</span></button>
            <button title="Pin" onclick="window.handlePin('${id}', \`${data.text}\`)" class="p-1 hover:text-blue-600 text-slate-400 transition-colors"><span class="material-symbols-outlined text-[18px]">keep</span></button>
            ${isMe && data.status !== 'deleted' ? `<button title="Delete" onclick="window.handleDelete('${id}')" class="p-1 hover:text-red-500 text-slate-400 transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>` : ''}
        `;

            // Assemble
            bubbleWrapper.appendChild(actionsDiv);
            bubbleWrapper.appendChild(bubble);
            row.appendChild(bubbleWrapper);
            row.id = id;

            box.appendChild(row);
        }

        // Only scroll if we were at the bottom or it's the first load
        // Also, if a NEW message comes from Me, we should probably scroll? 
        // The Firestore snapshot doesn't easily tell us "which one is new" without diffing.
        // But usually checking bottom is enough.
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
