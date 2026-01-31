/* ===============================
   UI MODULE
   =============================== */
import Toastify from "https://cdn.jsdelivr.net/npm/toastify-js/+esm";

export const $ = (id) => document.getElementById(id);

export const toast = (text, type = "info") => {
    let bg = "#3b82f6"; // Primary Blue
    if (type === "error") bg = "#ef4444"; // Red
    if (type === "success") bg = "#10b981"; // Green

    Toastify({
        text: text,
        gravity: "top",
        position: "right",
        style: { background: bg, borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }
    }).showToast();
};

export const switchView = (view, setupCallbacks) => {
    const mainList = $("mainList");
    const tabChats = $("tabChats");
    const tabDiscover = $("tabDiscover");

    // Tab Styling
    const activeClass = "pb-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-colors";
    const inactiveClass = "pb-3 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors";

    if (view === "chats") {
        if (tabChats) tabChats.className = activeClass;
        if (tabDiscover) tabDiscover.className = inactiveClass;
        if (setupCallbacks && setupCallbacks.loadFriends) setupCallbacks.loadFriends();
    } else if (view === "discover") {
        if (tabDiscover) tabDiscover.className = activeClass;
        if (tabChats) tabChats.className = inactiveClass;
        if (setupCallbacks && setupCallbacks.loadDiscover) setupCallbacks.loadDiscover();
    }
};

export const renderAvatar = (url, name) => {
    const avatarBox = $("avatarBox");
    const navAvatar = $("navAvatar");
    const mobileAvatar = $("mobileAvatar");
    const content = url
        ? `<img src="${url}" class="w-full h-full object-cover rounded-full">`
        : (name ? name[0].toUpperCase() : "?");

    if (avatarBox) {
        if (url) avatarBox.innerHTML = content;
        else avatarBox.innerText = content;
    }

    if (navAvatar) {
        if (url) navAvatar.innerHTML = content;
        else navAvatar.innerText = content;
        navAvatar.style.cursor = "pointer";
        navAvatar.onclick = () => window.location.href = "account.html";
    }

    if (mobileAvatar) {
        if (url) mobileAvatar.innerHTML = content;
        else mobileAvatar.innerHTML = content;
    }
};

export const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const renderTyping = (isTyping) => {
    const el = $("typingIndicator");
    if (el) {
        if (isTyping) {
            el.classList.remove("hidden");
        } else {
            el.classList.add("hidden");
        }
    }
};

export const clearContainer = (id) => {
    const el = $(id);
    if (el) el.innerHTML = "";
};

export const appendElement = (parentId, element) => {
    const parent = $(parentId);
    if (parent) parent.appendChild(element);
};

export const renderFriendItem = (data) => {
    // data: { id, displayName, photoURL, unseenCount, isOnline }
    const div = document.createElement("div");
    // Styling: Card layout (previously 'card' class in css? Let's use Tailwind)
    div.className = "flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm hover:bg-blue-50 cursor-pointer transition-all mb-3 relative overflow-visible";

    const name = data.displayName || data.id;
    const avatarChar = name[0].toUpperCase();

    // Avatar HTML
    let avatarHtml = "";
    if (data.photoURL) {
        avatarHtml = `<img src="${data.photoURL}" class="w-full h-full object-cover rounded-full">`;
    } else {
        avatarHtml = `<span class="text-xl font-bold text-blue-600">${avatarChar}</span>`;
    }

    // Online Dot
    const onlineHtml = data.isOnline
        ? `<div class="absolute bottom-0 right-0 size-3 bg-green-500 rounded-full border-2 border-white z-20"></div>`
        : `<div class="absolute bottom-0 right-0 size-3 bg-slate-300 rounded-full border-2 border-white z-20"></div>`;

    // Unseen Badge (Red Dot)
    // "Left of user's card" usually means left of the whole item? Or left of the text? 
    // User request: "left of the user'card have a red dot"
    // Assuming absolute positioned badge on top-right or left. 
    // Let's put a prominent badge on the RIGHT side usually for badges, 
    // BUT user said "Left". So we put it absolute left or just flex order.
    // Let's place it floating on the top-left corner of the avatar for visibility.

    let badgeHtml = "";
    if (data.unseenCount > 0) {
        badgeHtml = `
            <div class="absolute -top-1 -left-1 min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 shadow-md z-30">
                ${data.unseenCount > 99 ? '99+' : data.unseenCount}
            </div>
        `;
    }

    div.innerHTML = `
        <div class="relative size-12 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center">
            ${avatarHtml}
            ${onlineHtml}
            ${badgeHtml} 
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="font-bold text-slate-800 truncate">${name}</h3>
            <p class="text-xs text-slate-400 truncate">Click to chat</p>
        </div>
    `;

    return div;
};

export const notify = (title, body) => {
    if (Notification.permission === "granted") {
        new Notification(title, { body, icon: '/favicon.ico' });
    }
};

export const scrollToBottom = (id) => {
    const el = $(id);
    if (el) el.scrollTop = el.scrollHeight;
};

export const renderPinnedMessage = (msgData) => {
    const el = $("pinnedMsg");
    const txt = $("pinnedText");
    if (!el || !txt) return;

    if (msgData) {
        el.className = "px-6 py-2 bg-yellow-50 border-b border-yellow-100 flex items-center gap-3 cursor-pointer hover:bg-yellow-100 transition-colors z-20";
        el.innerHTML = `
            <span class="material-symbols-outlined text-yellow-600 text-sm">keep</span>
            <div class="flex-1 min-w-0" onclick="
                const target = document.getElementById('${msgData.id}');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('bg-yellow-100');
                    setTimeout(()=>target.classList.remove('bg-yellow-100'), 2000);
                } else {
                    // It's defined in db.js scope usually, but toast is exported here. 
                    // We can reuse the onclick or logic passed in. 
                    // Simplified: We rely on global access or just simple scroll for now.
                    alert('Tin nhắn đã cũ, hãy cuộn lên để tìm!'); 
                }
            ">
                <p class="text-xs font-bold text-yellow-700">Pinned Message</p>
                <p class="text-xs text-yellow-800 truncate">${msgData.text}</p>
            </div>
            <button onclick="event.stopPropagation(); window.handleUnpin()" class="p-1 hover:bg-yellow-200 rounded text-yellow-600">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
    } else {
        el.className = "hidden";
    }
};

export const toggleMobileChat = (show) => {
    const chat = $("chatSection");
    if (chat) {
        if (show) {
            chat.classList.remove("translate-x-full");
            chat.classList.add("translate-x-0");
        } else {
            chat.classList.add("translate-x-full");
            chat.classList.remove("translate-x-0");
        }
    }
};

export const renderEmptyState = (show) => {
    const box = $("msgBox");
    const title = $("chatTitle");
    const footer = document.querySelector("footer");

    if (show) {
        if (box) box.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-300">
                <span class="material-symbols-outlined text-6xl mb-2">chat_bubble_outline</span>
                <p>Select a friend to start chatting</p>
            </div>
        `;
        if (title) title.innerText = "Malo Messenger";
        if (footer) footer.classList.add("hidden");
    } else {
        if (footer) footer.classList.remove("hidden");
    }
};
