import { collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Vraća sve termine u kolekciju "sessions" na temelju podataka iz "reservations".
 * Koristi originalne sessionId-jeve, tako da klijentski prikaz sve prepoznaje.
 */
export const restoreMissingSessions = async () => {
  const reservationsSnap = await getDocs(collection(db, "reservations"));
  const allReservations = reservationsSnap.docs.map((d) => d.data());

  // Grupiraj rezervacije po sessionId
  const grouped: Record<string, any[]> = {};
  for (const r of allReservations) {
    if (!grouped[r.sessionId]) grouped[r.sessionId] = [];
    grouped[r.sessionId].push(r);
  }

  const restored = [];

  for (const sessionId in grouped) {
    const rezervacije = grouped[sessionId];
    const first = rezervacije[0]; // koristimo date/time iz prve

    const sessionRef = doc(db, "sessions", sessionId);
    const existing = await getDoc(sessionRef);

    if (!existing.exists()) {
      const broj = rezervacije.filter((r) => r.status === "rezervirano").length;

      await setDoc(sessionRef, {
        date: first.date,
        time: first.time,
        maxSlots: 5,
        bookedSlots: broj,
        active: true,
      });

      restored.push(sessionId);
    }
  }

  console.log(
    `✅ Vraćeno ${restored.length} termina s ispravnim ID-jevima i brojem rezervacija.`
  );
};
