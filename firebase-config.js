/**
 * ════════════════════════════════════════
 * TNPSC வழிகாட்டி — Firebase Configuration
 * File: assets/js/firebase-config.js
 * ════════════════════════════════════════
 * 
 * SETUP STEPS:
 * 1. Go to https://console.firebase.google.com
 * 2. Create project: "tnpsc-guide"
 * 3. Add web app, copy config below
 * 4. Enable: Authentication, Firestore, Storage
 * 5. Replace values in firebaseConfig object
 */

// ── Firebase SDK (add to index.html <head>) ──
// <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-auth-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.7.0/firebase-analytics-compat.js"></script>

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "tnpsc-guide.firebaseapp.com",
  projectId: "tnpsc-guide",
  storageBucket: "tnpsc-guide.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase
// firebase.initializeApp(firebaseConfig);
// const db = firebase.firestore();
// const auth = firebase.auth();

/* ══════════════════════════════════════════
   AUTHENTICATION FUNCTIONS
══════════════════════════════════════════ */

// Google Sign In
async function firebaseGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    const user = result.user;
    await saveUserToFirestore(user);
    return user;
  } catch (error) {
    console.error('Google login error:', error);
    throw error;
  }
}

// Email/Password Register
async function firebaseRegister(email, password, name) {
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    await result.user.updateProfile({ displayName: name });
    await saveUserToFirestore(result.user);
    return result.user;
  } catch (error) {
    throw error;
  }
}

// Email/Password Login
async function firebaseLogin(email, password) {
  try {
    const result = await auth.signInWithEmailAndPassword(email, password);
    return result.user;
  } catch (error) {
    throw error;
  }
}

// Forgot Password
async function firebaseForgotPassword(email) {
  await auth.sendPasswordResetEmail(email);
}

// Sign Out
async function firebaseSignOut() {
  await auth.signOut();
}

/* ══════════════════════════════════════════
   FIRESTORE DATABASE FUNCTIONS
══════════════════════════════════════════ */

// Save new user to Firestore
async function saveUserToFirestore(user) {
  const userRef = db.collection('users').doc(user.uid);
  const doc = await userRef.get();
  if (!doc.exists) {
    await userRef.set({
      uid: user.uid,
      name: user.displayName || 'மாணவர்',
      email: user.email,
      photoURL: user.photoURL || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      totalTests: 0,
      totalCorrect: 0,
      totalAttempted: 0,
      streak: 0,
      longestStreak: 0,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      badges: [],
      bookmarks: [],
      catScores: {},
      group: 'group4', // default
    });
  }
}

// Save quiz result
async function saveQuizResult(uid, catId, score, total, timeTaken) {
  const user = auth.currentUser;
  if (!user) return;

  const batch = db.batch();

  // Add to quiz_results collection
  const resultRef = db.collection('quiz_results').doc();
  batch.set(resultRef, {
    uid,
    catId,
    score,
    total,
    accuracy: Math.round((score/total)*100),
    timeTaken,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Update user stats
  const userRef = db.collection('users').doc(uid);
  batch.update(userRef, {
    totalTests: firebase.firestore.FieldValue.increment(1),
    totalCorrect: firebase.firestore.FieldValue.increment(score),
    totalAttempted: firebase.firestore.FieldValue.increment(total),
    [`catScores.${catId}.correct`]: firebase.firestore.FieldValue.increment(score),
    [`catScores.${catId}.total`]: firebase.firestore.FieldValue.increment(total),
    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  // Update leaderboard
  await updateLeaderboard(uid, score);
}

// Update streak
async function updateStreak(uid) {
  const userRef = db.collection('users').doc(uid);
  const doc = await userRef.get();
  const data = doc.data();

  const lastActive = data.lastActive?.toDate() || new Date(0);
  const today = new Date();
  const dayDiff = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));

  let newStreak = data.streak || 0;
  if (dayDiff === 1) newStreak++;
  else if (dayDiff > 1) newStreak = 1;

  await userRef.update({
    streak: newStreak,
    longestStreak: Math.max(newStreak, data.longestStreak || 0),
    lastActive: firebase.firestore.FieldValue.serverTimestamp(),
  });

  return newStreak;
}

// Update leaderboard
async function updateLeaderboard(uid, points) {
  const user = auth.currentUser;
  const lbRef = db.collection('leaderboard').doc(uid);
  await lbRef.set({
    uid,
    name: user.displayName,
    photoURL: user.photoURL,
    points: firebase.firestore.FieldValue.increment(points),
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

// Get global leaderboard
async function getLeaderboard(type = 'global', limit = 10) {
  let query = db.collection('leaderboard').orderBy('points', 'desc').limit(limit);

  if (type === 'weekly') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query.where('lastUpdated', '>', weekAgo);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc, i) => ({ rank: i+1, ...doc.data() }));
}

// Save bookmark
async function saveBookmark(uid, question) {
  await db.collection('users').doc(uid).update({
    bookmarks: firebase.firestore.FieldValue.arrayUnion(question)
  });
}

// Get user progress
async function getUserProgress(uid) {
  const doc = await db.collection('users').doc(uid).get();
  return doc.data();
}

/* ══════════════════════════════════════════
   FIRESTORE RULES (deploy to Firebase)
   
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth.uid == userId;
       }
       match /quiz_results/{docId} {
         allow create: if request.auth != null;
         allow read: if request.auth.uid == resource.data.uid;
       }
       match /leaderboard/{userId} {
         allow read: if request.auth != null;
         allow write: if request.auth.uid == userId;
       }
     }
   }
══════════════════════════════════════════ */

export {
  firebaseGoogleLogin, firebaseRegister, firebaseLogin,
  firebaseForgotPassword, firebaseSignOut,
  saveQuizResult, updateStreak, getLeaderboard,
  saveBookmark, getUserProgress
};
