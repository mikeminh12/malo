import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCyC9LeRT5K43R519zxfFknu1QAr5_-3jQ",
    authDomain: "malo-c5b59.firebaseapp.com",
    projectId: "malo-c5b59",
    storageBucket: "malo-c5b59.firebasestorage.app",
    messagingSenderId: "785455852092",
    appId: "1:785455852092:web:0bd514152a4f4fcb4ff139"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
