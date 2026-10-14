import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE",
  authDomain: "concrete-erb.firebaseapp.com",
  projectId: "concrete-erb",
  storageBucket: "concrete-erb.firebasestorage.app",
  messagingSenderId: "964088736698",
  appId: "1:964088736698:web:bed223d45d1240c101cb83",
  measurementId: "G-YG66TJNMGF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
