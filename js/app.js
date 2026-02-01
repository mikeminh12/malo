/* ===============================
   APP MODULE (Main)
   =============================== */
import { switchView, $, toast, renderAvatar, toggleMobileChat } from "./ui.js";
import { initAuth, logout } from "./auth.js";
import * as DB from "./db.js";
import { initWebRTC, startCall } from "./webrtc.js";

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

        // Initialize WebRTC Listener
        initWebRTC(myName);

        // Notifications
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        // Default View
        switchView("chats", {
            loadFriends: () => DB.loadFriends(myName, (target) => {
                DB.startChat(myName, target);
                document.querySelector("footer")?.classList.remove("hidden");

                // Show Call Button
                const btnCall = $("btnCall");
                if (btnCall) {
                    btnCall.classList.remove("hidden");
                    btnCall.onclick = () => startCall(myName, target);
                }

                // History Logic for Mobile
                // Only push if we are not already in a chat state (simple check)
                if (!history.state || !history.state.chatOpen) {
                    history.pushState({ chatOpen: true }, "", "#chat");
                }
                toggleMobileChat(true);
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

    // Mobile Back Button (Browser/Hardware)
    window.onpopstate = (event) => {
        // If we pop back to null state or state without chatOpen, close chat
        if (!event.state || !event.state.chatOpen) {
            toggleMobileChat(false);
            const btnCall = $("btnCall");
            if (btnCall) btnCall.classList.add("hidden");
        } else {
            // Forward navigation to chat? 
            toggleMobileChat(true);
        }
    };

    // Mobile UI Back Button (if exists)
    const btnBack = $("btnBack");
    if (btnBack) {
        btnBack.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // If we have history, go back. 
            if (history.length > 1) {
                history.back();
            } else {
                // Fallback if opened directly or weird state
                toggleMobileChat(false);
                const btnCall = $("btnCall");
                if (btnCall) btnCall.classList.add("hidden");
            }
        });
    }

    // Navigation Events
    const navItems = [
        { id: "navChat", view: "chats" },
        { id: "tabChats", view: "chats" },
        { id: "navDiscover", view: "discover" },
        { id: "tabDiscover", view: "discover" },
        { id: "mobileNavChat", view: "chats" },
        { id: "mobileNavDiscover", view: "discover" }
    ];

    navItems.forEach(item => {
        const el = $(item.id);
        if (el) {
            el.onclick = () => switchView(item.view, {
                loadFriends: () => DB.loadFriends(myName, (target) => {
                    DB.startChat(myName, target);

                    // Helper: DRY call button logic if needed, but for now duplicate
                    // Actually simplest is just to make sure btnCall shows up
                    const btnCall = $("btnCall");
                    if (btnCall) {
                        btnCall.classList.remove("hidden");
                        btnCall.onclick = () => startCall(myName, target);
                    }
                }),
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
