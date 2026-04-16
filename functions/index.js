const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Cloud Function: deleteAuthUser
 * Deletes a Firebase Auth user by UID.
 * Only callable by authenticated admin users.
 */
exports.deleteAuthUser = functions.https.onCall(async (data, context) => {
  // Verify caller is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Musisz być zalogowany.");
  }

  const callerUid = context.auth.uid;
  const uid = data.uid;

  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "Brak UID użytkownika do usunięcia.");
  }

  // Verify caller is an admin
  const callerDoc = await admin.firestore().collection("users").doc(callerUid).get();
  if (!callerDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "Brak uprawnień.");
  }
  const callerData = callerDoc.data();
  if (!["ADMIN", "admin", "administrator"].includes(callerData && callerData.role)) {
    throw new functions.https.HttpsError("permission-denied", "Tylko administrator może usuwać konta.");
  }

  // Delete the user from Firebase Auth
  try {
    await admin.auth().deleteUser(uid);
    return { success: true, message: "Konto zostało usunięte z Firebase Auth." };
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      return { success: true, message: "Konto już nie istnieje w Firebase Auth." };
    }
    throw new functions.https.HttpsError("internal", "Błąd usuwania konta Auth: " + err.message);
  }
});
