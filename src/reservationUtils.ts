import { db } from "./firebase";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

export type CancelResult = {
  ok: boolean;
  refunded: boolean;
  reason: string;
  promotedPhone: string | null;
};

/**
 * Otkazuje rezervaciju atomski (all-or-nothing):
 * - Postavlja status "otkazano" umjesto brisanja
 * - Ako je visitDeducted === true, vraća remainingVisits +1
 * - Ako je bila "rezervirano", oslobađa slot i promiče prvog s čekanja
 * - Sve unutar jedne Firestore transakcije
 */
export async function cancelReservation(
  reservationId: string
): Promise<CancelResult> {
  // 1) Dohvati rezervaciju
  const reservationRef = doc(db, "reservations", reservationId);
  const reservationSnap = await getDoc(reservationRef);

  if (!reservationSnap.exists()) {
    return {
      ok: false,
      refunded: false,
      reason: "reservation_not_found",
      promotedPhone: null,
    };
  }

  const resData = reservationSnap.data();

  if (resData.status === "otkazano") {
    return {
      ok: false,
      refunded: false,
      reason: "already_cancelled",
      promotedPhone: null,
    };
  }

  // 2) Pronađi user dokument (preko userId ako postoji, inače preko phone)
  let userDocId: string | null = null;

  if (resData.userId) {
    userDocId = resData.userId;
  } else {
    const userQuery = await getDocs(
      query(collection(db, "users"), where("phone", "==", resData.phone))
    );
    if (!userQuery.empty) {
      userDocId = userQuery.docs[0].id;
    }
  }

  const userRef = userDocId ? doc(db, "users", userDocId) : null;

  let promotedPhone: string | null = null;
  let refunded = false;
  let refundReason = "";

  // 3) Atomska transakcija
  await runTransaction(db, async (t) => {
    // Re-read unutar transakcije za konzistentnost
    const resSnapTx = await t.get(reservationRef);
    const resTxData = resSnapTx.data();

    if (!resSnapTx.exists() || resTxData?.status === "otkazano") {
      throw new Error("already_cancelled");
    }

    const visitDeducted = resTxData?.visitDeducted === true;
    const wasRezervirano = resTxData?.status === "rezervirano";

    // Odredi refund na temelju visitDeducted, NE na temelju vremena
    refunded = visitDeducted;
    refundReason = visitDeducted ? "visit_was_deducted" : "not_deducted";

    // Update rezervacije na "otkazano"
    const cancelUpdate: Record<string, any> = {
      status: "otkazano",
      cancelledAt: serverTimestamp(),
      refunded,
      refundReason,
    };
    if (refunded) {
      cancelUpdate.refundedAt = serverTimestamp();
    }
    t.update(reservationRef, cancelUpdate);

    // Ažuriraj session bookedSlots i promakni s waitliste
    const sessionRef = doc(db, "sessions", resTxData?.sessionId);
    const sessionSnap = await t.get(sessionRef);

    if (sessionSnap.exists()) {
      const sessionData = sessionSnap.data();
      let newBooked = sessionData?.bookedSlots ?? 0;

      if (wasRezervirano) {
        newBooked = Math.max(0, newBooked - 1);

        // Nađi prvog s liste čekanja
        const waitSnap = await getDocs(
          query(
            collection(db, "reservations"),
            where("sessionId", "==", resTxData?.sessionId),
            where("status", "==", "cekanje")
          )
        );

        const waitlist = waitSnap.docs
          .filter((d) => d.id !== reservationId)
          .map((d) => ({
            id: d.id,
            phone: d.data().phone,
            createdAt: d.data().createdAt?.toDate?.() ?? new Date(0),
          }))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        if (waitlist.length > 0) {
          const next = waitlist[0];
          const nextRef = doc(db, "reservations", next.id);
          const nextSnap = await t.get(nextRef);

          if (nextSnap.exists() && nextSnap.data()?.status === "cekanje") {
            t.update(nextRef, { status: "rezervirano" });
            newBooked += 1;
            promotedPhone = next.phone;
          }
        }
      }

      t.update(sessionRef, { bookedSlots: newBooked });
    }

    // Vrati dolazak atomski unutar iste transakcije
    if (refunded && userRef) {
      const userSnap = await t.get(userRef);
      if (userSnap.exists()) {
        const currentVisits = userSnap.data()?.remainingVisits ?? 0;
        t.update(userRef, { remainingVisits: currentVisits + 1 });
      }
    }
  });

  return { ok: true, refunded, reason: refundReason, promotedPhone };
}
