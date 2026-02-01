import { db } from "./config.js";
import {
    collection, doc, setDoc, onSnapshot, updateDoc, addDoc,
    getDoc, deleteDoc, serverTimestamp, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { toast, $ } from "./ui.js";

const servers = {
    iceServers: [
        {
            urls: [
                "stun:stun1.l.google.com:19302",
                "stun:stun2.l.google.com:19302"
            ]
        }
    ]
};

let pc = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;
let unsubscribeCall = null;

// UI Elements (assumed existence, will be added to HTML)
// Note: We resolve them dynamically in functions to ensure DOM is ready

export const initWebRTC = (myName) => {
    // Listen for incoming calls
    // We filter for calls where 'callee' is me and status is 'offering'
    const q = query(collection(db, "calls"), where("callee", "==", myName), where("status", "==", "offering"));

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                // Check if the call is recent (within last 60 seconds) to avoid picking up stale calls
                const now = new Date();
                const callTime = data.timestamp ? data.timestamp.toDate() : now;
                if (now - callTime < 60000) {
                    showIncomingCall(change.doc.id, data.caller);
                }
            }
        });
    }, (error) => {
        console.warn("WebRTC listener error (likely network):", error);
    });
};

const showIncomingCall = (callId, callerName) => {
    if (document.getElementById(callId)) return; // Already showing?

    const modal = $("incomingCallModal");
    const title = $("callerName");
    if (!modal) return;

    if (title) title.innerText = `${callerName} is calling...`;
    modal.classList.remove("hidden");

    // Attach handlers
    const btnAccept = $("btnAcceptCall");
    const btnDecline = $("btnDeclineCall");

    // Clear previous event listeners to avoid dupes (simple way: replace node or just overwrite onclick)
    if (btnAccept) btnAccept.onclick = () => answerCall(callId, callerName);
    if (btnDecline) btnDecline.onclick = () => declineCall(callId);
};

export const startCall = async (callerName, calleeName) => {
    if (currentCallId) {
        toast("You are already in a call", "error");
        return;
    }

    try {
        // 1. Setup PC & Stream
        await setupLocalStream();

        // 2. Create Call Doc
        const callDoc = doc(collection(db, "calls"));
        currentCallId = callDoc.id;

        const offerCandidates = collection(callDoc, "offerCandidates");
        const answerCandidates = collection(callDoc, "answerCandidates");

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(offerCandidates, event.candidate.toJSON()).catch(e => console.log("ICE Candidate Error", e));
            }
        };

        // 3. Create Offer
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        await setDoc(callDoc, {
            caller: callerName,
            callee: calleeName,
            offer: offer,
            status: "offering",
            timestamp: serverTimestamp()
        });

        // 4. Show Call UI
        showCallUI(calleeName, true);

        // 5. Listen for Answerc
        unsubscribeCall = onSnapshot(callDoc, (snapshot) => {
            const data = snapshot.data();
            if (!data) return; // Doc deleted

            if (pc && pc.signalingState !== "closed" && !pc.currentRemoteDescription && data.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription).catch(e => console.warn("Set Remote Desc Error", e));
            }

            // Handle end call
            if (data.status === "ended") {
                endCall(false);
                toast("Call ended", "info");
            }
        });

        // 6. Listen for Remote ICE
        onSnapshot(answerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate).catch(e => console.warn("Add ICE error", e));
                }
            });
        });

    } catch (e) {
        console.error("Start Call Error:", e);
        toast("Unable to start call. Check connection.", "error");
        endCall(false);
    }
};

const answerCall = async (callId, callerName) => {
    currentCallId = callId;
    $("incomingCallModal").classList.add("hidden");
    showCallUI(callerName, false);

    try {
        await setupLocalStream();

        const callDoc = doc(db, "calls", callId);
        const answerCandidates = collection(callDoc, "answerCandidates");
        const offerCandidates = collection(callDoc, "offerCandidates");

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(answerCandidates, event.candidate.toJSON());
            }
        };

        const callSnapshot = await getDoc(callDoc);
        if (!callSnapshot.exists()) {
            toast("Call expired", "error");
            endCall(false);
            return;
        }

        const callData = callSnapshot.data();
        const offerDescription = callData.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        };

        await updateDoc(callDoc, { answer, status: "answered" });

        // Listen for Offer Candidates
        onSnapshot(offerCandidates, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate).catch(e => console.warn("Add ICE error", e));
                }
            });
        });

        // Listen for end
        unsubscribeCall = onSnapshot(callDoc, (snap) => {
            if (snap.data()?.status === "ended") {
                endCall(false);
                toast("Call ended", "info");
            }
        });
    } catch (e) {
        console.error("Answer Call Error", e);
        toast("Failed to connect", "error");
        endCall(false);
    }
};

const setupLocalStream = async () => {
    if (pc) {
        pc.close();
    }
    pc = new RTCPeerConnection(servers);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera/Mic access requires a secure connection (HTTPS) or localhost.");
    }

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

    localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
    });

    const localVideo = $("localVideo");
    if (localVideo) {
        localVideo.srcObject = localStream;
        localVideo.muted = true; // Always mute local video to avoid echo
    }

    // Set up remote stream handler (only does something when track is received)
    remoteStream = new MediaStream();
    const remoteVideo = $("remoteVideo");
    if (remoteVideo) remoteVideo.srcObject = remoteStream;

    pc.ontrack = (event) => {
        event.streams[0].getTracks().forEach((track) => {
            remoteStream.addTrack(track); // Add to the stream object we already set
        });
    };
};

export const declineCall = async (callId) => {
    const modal = $("incomingCallModal");
    if (modal) modal.classList.add("hidden");

    if (callId) {
        try {
            const ref = doc(db, "calls", callId);
            await updateDoc(ref, { status: "ended" });
        } catch (e) { console.warn("Decline update failed", e); }
    }
};

export const endCall = async (shouldUpdateDb = true) => {
    // 1. Close PC
    if (pc) {
        try { pc.close(); } catch (e) { }
        pc = null;
    }

    // 2. Stop tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // 3. UI Reset
    const callModal = $("callModal");
    const incModal = $("incomingCallModal");
    if (callModal) callModal.classList.add("hidden");
    if (incModal) incModal.classList.add("hidden");

    if ($("localVideo")) $("localVideo").srcObject = null;
    if ($("remoteVideo")) $("remoteVideo").srcObject = null;

    // 4. Update DB
    if (shouldUpdateDb && currentCallId) {
        try {
            await updateDoc(doc(db, "calls", currentCallId), { status: "ended" });
        } catch (e) { console.warn("Call end update failed (likely network)", e); }
    }

    if (unsubscribeCall) {
        unsubscribeCall();
        unsubscribeCall = null;
    }
    currentCallId = null;
};

const showCallUI = (name, isCalling) => {
    const modal = $("callModal");
    const status = $("callStatus");
    if (modal) {
        modal.classList.remove("hidden");
        if (status) status.innerText = isCalling ? `Calling ${name}...` : `In call with ${name}`;
    }

    const btnEnd = $("btnEndCall");
    if (btnEnd) btnEnd.onclick = () => endCall(true);
};
