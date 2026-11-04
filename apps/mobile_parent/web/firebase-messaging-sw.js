importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDEx6x-mKcW97xlw2eFiknFHAIsGY-WTIw",
  authDomain: "edu-affairs-dev.firebaseapp.com",
  projectId: "edu-affairs-dev",
  storageBucket: "edu-affairs-dev.firebasestorage.app",
  messagingSenderId: "377332053546",
  appId: "1:377332053546:web:879b85af94eb96fca07553",
  measurementId: "G-MR0YQJ9DG2"
});

const messaging = firebase.messaging();
