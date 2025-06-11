// ✅ OVO JE NA VRHU FILE-A
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase"; // prilagodi putanju ako treba

type Session = {
  id: string;
  date: string;
  time: string;
  maxSlots?: number;
  bookedSlots?: number;
};

type Reservation = {
  sessionId: string;
  status: "rezervirano" | "cekanje";
};

// ✅ OVO JE TVOJA FUNKCIJA
export async function auditSessionsSimple() {
  const sessionsSnap = await getDocs(collection(db, "sessions"));
  const reservationsSnap = await getDocs(collection(db, "reservations"));

  const sessions = sessionsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Session[];

  const reservations = reservationsSnap.docs.map((doc) =>
    doc.data()
  ) as Reservation[];

  const problemi: any[] = [];

  for (const session of sessions) {
    const rezervirano = reservations.filter(
      (r) => r.sessionId === session.id && r.status === "rezervirano"
    ).length;

    const issues: string[] = [];

    if (session.maxSlots === undefined) {
      issues.push("⚠️ maxSlots nije postavljen");
    }

    if (session.bookedSlots !== rezervirano) {
      issues.push(
        `❗ bookedSlots=${
          session.bookedSlots ?? 0
        }, stvarno rezervirano=${rezervirano}`
      );
    }

    if (issues.length > 0) {
      problemi.push({
        datum: session.date,
        vrijeme: session.time,
        sessionId: session.id,
        maxSlots: session.maxSlots,
        bookedSlots: session.bookedSlots,
        stvarno: rezervirano,
        napomena: issues.join(" | "),
      });
    }
  }

  console.table(problemi);
}
