/* ===============================
   APP MODULE (Main)
   =============================== */
import { switchView, $, toast, renderAvatar, toggleMobileChat } from "./ui.js";
import { initAuth, logout } from "./auth.js";
import * as DB from "./db.js";

let myName = "";

// Initialize App
import { createPopup } from 'https://unpkg.com/@picmo/popup-picker@latest/dist/index.js?module';

document.addEventListener("DOMContentLoaded", () => {
    initAuth((user, username) => {
        myName = username;

        // Presence
        DB.setOnlineStatus(myName, true);
        window.addEventListener('beforeunload', () => DB.setOnlineStatus(myName, false));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') DB.setOnlineStatus(myName, true);
            else DB.setOnlineStatus(myName, false);
        });

        // Notifications
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        // Default View
        switchView("chats", {
            loadFriends: () => DB.loadFriends(myName, (target) => {
                DB.startChat(myName, target);
                document.querySelector("footer")?.classList.remove("hidden");
                toggleMobileChat(true); // Slide in chat on mobile
            }),
            loadDiscover: () => DB.loadDiscover(myName, {
                sendRequest: (id) => DB.sendRequest(myName, id),
                acceptFriend: (id) => {
                    DB.acceptFriend(myName, id).then(() => {
                        // Reload discover after accept
                        DB.loadDiscover(myName, {
                            sendRequest: (id) => DB.sendRequest(myName, id),
                            acceptFriend: (id) => DB.acceptFriend(myName, id)
                        });
                    });
                }
            })
        });
    });

    // Mobile Back Button
    const btnBack = $("btnBack");
    if (btnBack) btnBack.onclick = () => toggleMobileChat(false);

    // Navigation Events
    const navItems = [
        { id: "navChat", view: "chats" },
        { id: "tabChats", view: "chats" },
        { id: "navDiscover", view: "discover" },
        { id: "tabDiscover", view: "discover" }
    ];

    navItems.forEach(item => {
        const el = $(item.id);
        if (el) {
            el.onclick = () => switchView(item.view, {
                loadFriends: () => DB.loadFriends(myName, (target) => DB.startChat(myName, target)),
                loadDiscover: () => DB.loadDiscover(myName, {
                    sendRequest: (id) => DB.sendRequest(myName, id),
                    acceptFriend: (id) => DB.acceptFriend(myName, id).then(() => {
                        // Simple re-trigger
                        $("tabDiscover").click();
                    })
                })
            });
        }
    });

    // Send Message & Typing
    const btnSend = $("btnSend");
    const txtMsg = $("txtMsg");
    const btnEmoji = $("btnEmoji");

    // Initial Empty State
    const footer = document.querySelector("footer");
    if (footer) footer.classList.add("hidden"); // Hide input until chat selected
    let currentReply = null; // State for reply

    // UI Helpers for Reply
    const setReplyUI = (data) => {
        currentReply = data;
        const preview = $("replyPreview");
        if (data) {
            preview.classList.remove("hidden");
            $("replyToName").innerText = `Replying to ${data.name || 'User'}`;
            $("replyToText").innerText = data.text;
            txtMsg.focus();
        } else {
            preview.classList.add("hidden");
        }
    };

    $("cancelReply") && ($("cancelReply").onclick = () => setReplyUI(null));

    // Global Handlers (exposed for HTML onclicks)
    window.handleReply = (id, uid, text) => {
        // Resolve name maybe? For now use UID or "User"
        setReplyUI({ id, uid, text, name: "User" }); // Improvement: Fetch name from cache
    };

    window.handleDelete = (id) => {
        if (confirm("Thu hồi tin nhắn này?")) DB.deleteMessage(myName, id);
    };

    window.handlePin = (id, text) => {
        DB.pinMessage(myName, { id, text });
    };

    window.handleUnpin = () => {
        if (confirm("Bỏ ghim tin nhắn này?")) DB.unpinMessage(myName);
    };

    if (btnSend && txtMsg) {
        const send = () => {
            const text = txtMsg.value;
            DB.sendMessage(myName, text, currentReply).then(() => {
                txtMsg.value = "";
                DB.setTyping(myName, false);
                setReplyUI(null); // Clear reply after send
            });
        };
        btnSend.onclick = send;

        txtMsg.onkeydown = (e) => {
            if (e.key === "Enter" && !e.shiftKey) { // Allow shift+enter for new line
                e.preventDefault();
                send();
            } else {
                DB.setTyping(myName, true);
            }
        };

        // Emoji Picker
        if (btnEmoji) {
            const picker = createPopup({}, {
                referenceElement: btnEmoji,
                triggerElement: btnEmoji,
                position: 'top-start'
            });

            btnEmoji.onclick = () => picker.toggle();

            picker.addEventListener('emoji:select', (selection) => {
                txtMsg.value += selection.emoji;
                txtMsg.focus();
                DB.setTyping(myName, true); // Emoji adds text
            });
        }
    }

    // Expose Logout
    window.handleLogout = logout;
});
