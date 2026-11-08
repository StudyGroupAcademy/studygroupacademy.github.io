import { authClient } from "./auth-client.js";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "./firestore-client.js";

export const NICKNAME_RULE = "Use 2–30 characters: letters, numbers, spaces, hyphens, or apostrophes.";

export function takeWelcomeFlag() {
  let flag = false;
  try {
    flag = sessionStorage.getItem("studygroup_welcome") === "true"
      || sessionStorage.getItem("studygroup-welcome") === "1";
    sessionStorage.removeItem("studygroup_welcome");
    sessionStorage.removeItem("studygroup-welcome");
  } catch (error) {
    console.warn("Welcome state is unavailable.", error);
  }
  return flag;
}

export async function ensureUserProfile(user) {
  const uid = user?.id || user?.uid;
  if (!uid) throw new Error("Your sign-in session does not contain a user ID. Please sign out and sign in again.");
  const userDocRef = doc(null, "users", uid);
  const snapshot = await getDoc(userDocRef);

  if (snapshot.exists()) {
    return snapshot.data();
  }

  const displayName = user.name || user.displayName || user.email?.split("@")[0] || "Learner";
  const defaultProfile = {
    uid,
    displayName,
    nickname: displayName,
    handle: (user.email?.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9]/g, ""),
    bio: "",
    boards: {},
    leaderboardOptIn: false,
    xp: 0,
    dailyGoal: "",
    weeklyMinutes: 0,
    onboardingComplete: false,
    createdAt: new Date().toISOString()
  };

  await setDoc(userDocRef, defaultProfile);
  try {
    sessionStorage.setItem("studygroup_welcome", "true");
  } catch (error) {
    console.warn("Welcome state could not be saved.", error);
  }
  return defaultProfile;
}

export async function saveProfileChoices(profileData, optIn) {
  const sessionResult = await authClient.getSession();
  const authUser = sessionResult.data?.user;
  if (!authUser) throw new Error("No active user session found.");

  const uid = authUser.id || authUser.uid;
  const userDocRef = doc(null, "users", uid);
  const updates = {
    ...profileData,
    leaderboardOptIn: optIn,
    onboardingComplete: true,
    updatedAt: new Date().toISOString()
  };

  await updateDoc(userDocRef, updates);

  const publicRef = doc(null, "publicLeaderboard", uid);
  if (optIn) {
    await setDoc(publicRef, {
      uid,
      displayName: profileData.displayName,
      nickname: profileData.nickname,
      handle: profileData.handle,
      xp: 0,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } else {
    await deleteDoc(publicRef);
  }
}

export async function saveDailyGoal(goal) {
  const sessionResult = await authClient.getSession();
  const authUser = sessionResult.data?.user;
  if (!authUser) throw new Error("No active user session found.");

  const uid = authUser.id || authUser.uid;
  const userDocRef = doc(null, "users", uid);
  await updateDoc(userDocRef, {
    dailyGoal: goal,
    updatedAt: new Date().toISOString()
  });
}

export async function addWeeklyMinutes(minutes) {
  const sessionResult = await authClient.getSession();
  const authUser = sessionResult.data?.user;
  if (!authUser) throw new Error("No active user session found.");

  const uid = authUser.id || authUser.uid;
  const userDocRef = doc(null, "users", uid);
  const snapshot = await getDoc(userDocRef);
  const currentMinutes = snapshot.exists() ? (Number(snapshot.data().weeklyMinutes) || 0) : 0;
  
  await updateDoc(userDocRef, {
    weeklyMinutes: currentMinutes + minutes,
    updatedAt: new Date().toISOString()
  });
}
