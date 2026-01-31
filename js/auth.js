/* ===============================
   AUTH MODULE
   =============================== */
import { auth, db } from "./config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { renderAvatar } from "./ui.js";

export const initAuth = (onUserForApp) => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "index.html";
            return;
        }

        // Determine username logic (email prefix)
        const myName = user.email.split("@")[0];

        // Ensure user doc exists with username
        await setDoc(doc(db, "users", myName), { username: myName }, { merge: true });

        // Load specific user data (avatar, etc)
        const snap = await getDoc(doc(db, "users", myName));
        const data = snap.data();

        // Update UI with avatar
        renderAvatar(data?.photoURL, myName);

        // Pass control back to App with validated user
        onUserForApp(user, myName);
    });
};

export const logout = () => {
    signOut(auth).then(() => window.location.href = "index.html");
};
