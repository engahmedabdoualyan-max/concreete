import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAXC4SQacAv7oUOdFDMFDfsZGqAOpd3Ni8",
  authDomain: "techincalconcrete.firebaseapp.com",
  projectId: "techincalconcrete",
  storageBucket: "techincalconcrete.firebasestorage.app",
  messagingSenderId: "338536058137",
  appId: "1:338536058137:web:d4e560daf0a5f2c598c988",
  measurementId: "G-QTT2XDKHX5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
