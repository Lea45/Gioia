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
  // 1) Dohvati rezervaciju (izvan transakcije za brzu provjeru)
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
  // VAŽNO: Firestore zahtijeva da svi transaction.get() pozivi budu PRIJE bilo kojeg write poziva
  await runTransaction(db, async (t) => {
    // ===== FAZA 1: SVI READS =====
    const resSnapTx = await t.get(reservationRef);
    const resTxData = resSnapTx.data();

    if (!resSnapTx.exists() || resTxData?.status === "otkazano") {
      throw new Error("already_cancelled");
    }

    const sessionRef = doc(db, "sessions", resTxData?.sessionId);
    const sessionSnap = await t.get(sessionRef);

    let userSnap = null;
    if (userRef) {
      userSnap = await t.get(userRef);
    }

    // getDocs NIJE transaction read, može biti između
    const waitSnap =
      resTxData?.status === "rezervirano"
        ? await getDocs(
            query(
              collection(db, "reservations"),
              where("sessionId", "==", resTxData?.sessionId),
              where("status", "==", "cekanje")
            )
          )
        : null;

    // Ako ima waitlist, dohvati prvog kandidata (transaction read)
    let nextRef = null;
    let nextSnap = null;
    if (waitSnap && !waitSnap.empty) {
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
        nextRef = doc(db, "reservations", next.id);
        nextSnap = await t.get(nextRef);
        if (nextSnap.exists() && nextSnap.data()?.status === "cekanje") {
          promotedPhone = next.phone;
        } else {
          nextRef = null;
          nextSnap = null;
        }
      }
    }

    // ===== FAZA 2: SVI WRITES =====
    // Stare rezervacije (prije deploymenta) nemaju visitDeducted polje,
    // ali stari kod je UVIJEK oduzimao visit pri rezervaciji.
    // Zato: undefined/true → visit JE oduzet, samo explicit false → nije.
    const visitDeducted = resTxData?.visitDeducted !== false;
    const wasRezervirano = resTxData?.status === "rezervirano";

    refunded = visitDeducted;
    refundReason = visitDeducted ? "visit_was_deducted" : "not_deducted";

    // 1) Update rezervacije na "otkazano"
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

    // 2) Ažuriraj session bookedSlots
    if (sessionSnap.exists()) {
      const sessionData = sessionSnap.data();
      let newBooked = sessionData?.bookedSlots ?? 0;

      if (wasRezervirano) {
        newBooked = Math.max(0, newBooked - 1);

        // Promakni prvog s waitliste
        if (nextRef && promotedPhone) {
          t.update(nextRef, { status: "rezervirano" });
          newBooked += 1;
        }
      }

      t.update(sessionRef, { bookedSlots: newBooked });
    }

    // 3) Vrati dolazak atomski
    if (refunded && userRef && userSnap && userSnap.exists()) {
      const currentVisits = userSnap.data()?.remainingVisits ?? 0;
      t.update(userRef, { remainingVisits: currentVisits + 1 });
    }
  });

  return { ok: true, refunded, reason: refundReason, promotedPhone };
}
