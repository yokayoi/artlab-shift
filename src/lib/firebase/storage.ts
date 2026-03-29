import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseStorage } from "./config";

export async function uploadProfileImage(uid: string, file: File): Promise<string> {
  const storageRef = ref(getFirebaseStorage(), `users/${uid}/profile`);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}
