import { useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';

export default function MigrateUsers() {
  useEffect(() => {
    const migrate = async () => {
      const usersSnap = await getDocs(collection(db, 'users'));

      usersSnap.forEach(async (userDoc) => {
        const userData = userDoc.data();
        if (!userData.fullName && userData.name) {
          // Ako nema fullName, postavi ga kao name
          const userRef = doc(db, 'users', userDoc.id);
          await updateDoc(userRef, {
            fullName: userData.name,
          });
          console.log(`✅ Full name dodan za korisnika: ${userData.name}`);
        } else {
          console.log(`ℹ️ Već ima full name: ${userData.fullName || userData.name}`);
        }
      });

      console.log('✅ Migracija korisnika završena.');
    };

    migrate();
  }, []);

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h2>Migracija korisnika...</h2>
      <p>Provjeravam i nadopunjavam korisnike u bazi.</p>
    </div>
  );
}
