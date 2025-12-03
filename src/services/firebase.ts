import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDYVIfDZ_kqRMdHrYRHA1l8pA1edZ-jFN0",
    authDomain: "smartshoppingcart-f59a8.firebaseapp.com",
    projectId: "smartshoppingcart-f59a8",
    storageBucket: "smartshoppingcart-f59a8.firebasestorage.app",
    messagingSenderId: "1062447419900",
    appId: "1:1062447419900:web:83a97140bafaedb40fa279",
    measurementId: "G-XVX1H8LJ8K"
};


const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

export const db = getFirestore(app);

