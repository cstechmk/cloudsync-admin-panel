import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';
export const serviceAccount = JSON.parse(
  readFileSync(join(process.cwd(), 'service-account.json'), 'utf8')
);

function initAdmin() {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

initAdmin();

// Firestore is removed — DB is now MongoDB. Auth and Messaging stay on Firebase.
export const adminAuth = admin.auth();
export default admin;
