import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "./firestore-client.js";
import { db, state } from "./core.js";
import { sanitizeNickname, weekStartKey } from "./helpers.js";

export const NICKNAME_RULE = "Use 2 to 24 letters, numbers, spaces, dots, underscores or hyphens for your nickname.";

const WELCOME_KEY = "studygroup-welcome";
const inflightProfiles = new Map();

export function profileReference(user) {
  return doc(db, "users", user.uid);
}

export function leaderboardReference(uid) {
  return doc(db, "publicLeaderboard", uid);
}

function setWelcomeFlag() {
  try {
    sessionStorage.setItem(WELCOME_KEY, "1");
  } catch (error) {
    console.error("The welcome flag could not be stored.", error);
  }
}

export function takeWelcomeFlag() {
  try {
    const flagged = sessionStorage.getItem(WELCOME_KEY) === "1";
    sessionStorage.removeItem(WELCOME_KEY);
    return flagged;
  } catch (error) {
    return false;
  }
}

function suggestedName(user) {
  const authName = typeof user.displayName === "string" ? user.displayName.trim() : "";
  const emailName = typeof user.email === "string" ? user.email.split("@")[0] : "";
  const name = authName && !/^(study buddy|student|learner)$/i.test(authName) ? authName : emailName;
  return sanitizeNickname(name, `Learner ${user.uid.slice(0, 5)}`);
}

async function createOrLoadProfile(user) {
  const reference = profileReference(user);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) {
    const newProfile = {
      displayName: suggestedName(user),
      nickname: suggestedName(user),
      handle: `${suggestedName(user).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15) || "learner"}_${user.uid.slice(-4)}`,
      bio: "",
      badge: "Learner",
      boards: {},
      onboardingComplete: false,
      leaderboardOptIn: false,
      createdAt: serverTimestamp()
    };
    await setDoc(reference, newProfile);
    setWelcomeFlag();
    return newProfile;
  }
  let existing = snapshot.data();
  if (!existing.displayName || /^(study buddy|student|learner)$/i.test(existing.displayName.trim())) {
    const displayName = suggestedName(user);
    await updateDoc(reference, { displayName });
    existing = { ...existing, displayName };
  }
  const missingFields = {};
  if (!existing.nickname) missingFields.nickname = existing.displayName;
  if (!existing.handle) missingFields.handle = `${(existing.nickname || existing.displayName).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 15) || "learner"}_${user.uid.slice(-4)}`;
  if (typeof existing.bio !== "string") missingFields.bio = "";
  if (!existing.badge) missingFields.badge = "Learner";
  if (!existing.boards || typeof existing.boards !== "object") missingFields.boards = {};
  if (Object.keys(missingFields).length) {
    await updateDoc(reference, missingFields);
    existing = { ...existing, ...missingFields };
  }
  if (existing.leaderboardOptIn === true) {
    const publicReference = leaderboardReference(user.uid);
    const publicSnapshot = await getDoc(publicReference);
    if (!publicSnapshot.exists()) {
      await setDoc(publicReference, {
        displayName: existing.nickname,
        points: 0,
        lastPointAt: null,
        joinedAt: serverTimestamp()
      });
    } else if (publicSnapshot.data().displayName !== existing.nickname) {
      await updateDoc(publicReference, { displayName: existing.nickname });
    }
  }
  return existing;
}

export function ensureUserProfile(user) {
  if (!inflightProfiles.has(user.uid)) {
    const pending = createOrLoadProfile(user).finally(() => inflightProfiles.delete(user.uid));
    inflightProfiles.set(user.uid, pending);
  }
  return inflightProfiles.get(user.uid);
}

export async function saveProfileChoices(profile, optIn) {
  const publicReference = leaderboardReference(state.user.uid);
  const publicSnapshot = await getDoc(publicReference);
  const batch = writeBatch(db);
  batch.update(profileReference(state.user), { ...profile, onboardingComplete: true, leaderboardOptIn: optIn });
  if (optIn && publicSnapshot.exists()) {
    batch.update(publicReference, { displayName: profile.nickname });
  } else if (optIn) {
    batch.set(publicReference, {
      displayName: profile.nickname,
      points: 0,
      lastPointAt: null,
      joinedAt: serverTimestamp()
    });
  } else if (publicSnapshot.exists()) {
    batch.delete(publicReference);
  }
  await batch.commit();
  state.profile = { ...state.profile, ...profile, onboardingComplete: true, leaderboardOptIn: optIn };
}

export async function addWeeklyMinutes(minutes) {
  if (!state.user || !state.profile?.leaderboardOptIn) return;
  const reference = leaderboardReference(state.user.uid);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  const key = weekStartKey();
  const current = data.weekKey === key ? Number(data.weekMinutes) || 0 : 0;
  await updateDoc(reference, { weekKey: key, weekMinutes: Math.min(6000, current + minutes) });
}

export async function saveDailyGoal(minutes) {
  await updateDoc(profileReference(state.user), { dailyGoal: minutes });
  state.profile = { ...state.profile, dailyGoal: minutes };
}
