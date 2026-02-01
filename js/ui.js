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

export const renderTabIndicator = (tabId) => {
    // Mobile Tabs (Bottom) - if we had them, but user prompt implies Side/Tab nav.
    // Focusing on Sidebar Nav Animation.

    // We remove the hardcoded indicator from HTML and manage it here or toggle classes.
    // Strategy: We have 'navChat', 'navDiscover' for desktop, and 'mobileNavChat', 'mobileNavDiscover' for mobile.
    const navs = ['navChat', 'navDiscover', 'mobileNavChat', 'mobileNavDiscover'];

    // Map view aliases to DOM IDs
    const activeMap = {
        'navChat': 'mobileNavChat',
        'navDiscover': 'mobileNavDiscover',
        'mobileNavChat': 'navChat',
        'mobileNavDiscover': 'navDiscover'
    };

    navs.forEach(id => {
        const el = $(id);
        if (!el) return;

        // Remove existing indicator if any
        const existing = el.querySelector(".indicator-bar");
        if (existing) existing.remove();

        const isActive = (id === tabId) || (activeMap[tabId] === id);

        if (isActive) {
            // Active Styles
            el.classList.remove("text-slate-400", "hover:text-blue-600", "bg-transparent");
            // Mobile vs Desktop differentiation
            if (id.startsWith('mobile')) {
                el.classList.add("text-blue-600");
                // No bg change for mobile bottom nav usually, just text color
            } else {
                el.classList.add("bg-blue-50", "text-blue-600");
                // Add Indicator with Animation (Desktop only)
                const indicator = document.createElement("div");
                indicator.className = "indicator-bar absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r-full animate-fade-in";
                el.appendChild(indicator);
            }
        } else {
            // Inactive Styles
            if (id.startsWith('mobile')) {
                el.classList.remove("text-blue-600");
                el.classList.add("text-slate-400");
            } else {
                el.classList.remove("bg-blue-50", "text-blue-600");
                el.classList.add("text-slate-400", "hover:text-blue-600", "bg-transparent");
            }
        }
    });

    // Handle Mobile Tabs (Top or Bottom if exist)
    const tabChats = $("tabChats");
    const tabDiscover = $("tabDiscover");
    const activeClass = "pb-3 text-sm font-bold border-b-2 border-blue-600 text-blue-600 transition-colors";
    const inactiveClass = "pb-3 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors";

    if (tabId === 'navChat' || tabId === 'tabChats') { // Map nav to tab
        if (tabChats) tabChats.className = activeClass;
        if (tabDiscover) tabDiscover.className = inactiveClass;
    } else {
        if (tabDiscover) tabDiscover.className = activeClass;
        if (tabChats) tabChats.className = inactiveClass;
    }
};

export const switchView = (view, setupCallbacks) => {
    const mainList = $("mainList");

    if (view === "chats") {
        renderTabIndicator('navChat');
        if (setupCallbacks && setupCallbacks.loadFriends) setupCallbacks.loadFriends();
    } else if (view === "discover") {
        renderTabIndicator('navDiscover');
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
    div.className = "friend-item flex items-center gap-4 p-4 bg-white rounded-2xl shadow-sm hover:bg-blue-50 cursor-pointer transition-all mb-3 relative overflow-visible";
    div.dataset.id = data.id; // For easy selection

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

    let badgeHtml = "";
    if (data.unseenCount > 0) {
        badgeHtml = `
            <div id="badge-${data.id}" class="absolute -top-1 -left-1 min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full px-1 shadow-md z-30 transition-transform">
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

    // Add click listener to hide badge immediately
    div.addEventListener("click", () => {
        const badge = document.getElementById(`badge-${data.id}`);
        if (badge) {
            badge.style.display = 'none'; // Force hide
            badge.classList.add("hidden");
        }

        // Also update the data passed to it visually if possible, though UI refresh comes from DB listener
        // But instant feedback is key.
    });

    return div;
};

export const notify = (title, body) => {
    if (Notification.permission === "granted") {
        new Notification(title, { body, icon: '/favicon.ico' });
    }
};

export const scrollToBottom = (id, smooth = true) => {
    const el = $(id);
    if (!el) return;

    setTimeout(() => {
        el.scrollTo({
            top: el.scrollHeight,
            behavior: smooth ? "smooth" : "auto"
        });
    }, 50);
};

export const isAtBottom = (id) => {
    const el = $(id);
    if (!el) return false;
    // Tolerance of 100px
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
};

export const renderPinnedMessage = (msgData) => {
    const el = $("pinnedMsg");
    const txt = $("pinnedText");
    if (!el || !txt) return; // Wait, txt not found in code, maybe a mistake in variable naming previously? 
    // Just protecting against null el is enough.

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
                    alert('Tin nhắn đã cũ hoặc chưa tải!'); 
                }
            ">
                <p class="text-xs font-bold text-yellow-700">Pinned Message</p>
                <p class="text-xs text-yellow-800 truncate">${msgData.text}</p>
            </div>
            <button onclick="event.stopPropagation(); window.handleUnpin()" class="p-1 hover:bg-yellow-200 rounded text-yellow-600">
                <span class="material-symbols-outlined text-sm">close</span>
            </button>
        `;
        el.classList.remove('hidden');
    } else {
        el.classList.add("hidden");
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
                <p>Chọn một người bạn để bắt đầu</p>
            </div>
        `;
        if (title) title.innerText = "Malo Messenger";
        if (footer) footer.classList.add("hidden");
    } else {
        if (footer) footer.classList.remove("hidden");
    }
};
