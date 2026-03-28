import { GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import { getFirebaseAuth } from "./config";

const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  return signInWithPopup(getFirebaseAuth(), provider);
}

export async function signOut() {
  return firebaseSignOut(getFirebaseAuth());
}
