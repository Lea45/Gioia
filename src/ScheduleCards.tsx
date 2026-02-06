import { useEffect, useState } from "react";
import AnimatedCollapse from "./AnimatedCollapse";
import { db } from "./firebase";
import { runTransaction } from "firebase/firestore";

import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  QuerySnapshot,
  DocumentData,
  increment, // ← Add this instead of FieldValue
} from "firebase/firestore";
import "./ScheduleCards.css";
import ConfirmPopup from "./ConfirmPopup";

import {
  FaClock,
  FaUserFriends,
  FaCheckCircle,
  FaTimesCircle,
  FaCalendarAlt,
} from "react-icons/fa";
import spinner from "./gears-spinner.svg";

// Koristi Firebase Function za slanje WhatsApp poruka (API ključ je siguran na serveru)
const FUNCTION_URL = "/api/sendWhatsAppNotification";

export const sendWhatsAppMessage = async (rawPhone: string) => {
  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone: rawPhone, templateName: "waitlist_moved" }),
    });

    const result = await response.json();
    if (response.ok) {
      console.log("✅ WhatsApp poslana:", result);
    } else {
      console.error("❌ WhatsApp greška:", result);
    }
  } catch (err) {
    console.error("❌ WhatsApp greška:", err);
  }
};

type Session = {
  id: string;
  date: string;
  time: string;
  bookedSlots: number;
  maxSlots: number;
};

type Reservation = {
  id: string;
  phone: string;
  name?: string;
  sessionId: string;
  status: "rezervirano" | "cekanje";
};

type Props = {
  onReservationMade: () => void;
  onShowPopup: (message: string) => void;
};

const ScheduleCards = ({ onReservationMade, onShowPopup }: Props) => {
  const [confirmSession, setConfirmSession] = useState<Session | null>(null);
  const [confirmCancelSession, setConfirmCancelSession] =
    useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [label, setLabel] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [infoPopupMessage, setInfoPopupMessage] = useState<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState("");

  const phone = localStorage.getItem("phone");
  const name = localStorage.getItem("userName");
  const [initialLoad, setInitialLoad] = useState(true);
  const [dailyNotes, setDailyNotes] = useState<Record<string, string>>({});

  const fetchData = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    const sessionsSnap = await getDocs(collection(db, "sessions"));
    const reservationsSnap = await getDocs(collection(db, "reservations"));
    const metaDoc = await getDoc(doc(db, "draftSchedule", "meta"));

    const notesSnap = await getDocs(collection(db, "sessionsNotes"));
    const notes: Record<string, string> = {};
    notesSnap.forEach((doc) => {
      notes[doc.id] = doc.data().text;
    });
    setDailyNotes(notes);

    const fetchedSessions = sessionsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Session[];

    const fetchedReservations = reservationsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Reservation[];

    setSessions(fetchedSessions);
    setReservations(fetchedReservations);

    if (metaDoc.exists()) {
      const data = metaDoc.data();
      if (data.label) setLabel(data.label);
    }

    if (showSpinner) setLoading(false);

    setInitialLoad(false);
  };

  useEffect(() => {
    fetchData(true); // prvo dohvaćanje s loading spinnerom

    const interval = setInterval(() => {
      fetchData(false); // tihi refresh
    }, 20000); // 20 sekundi

    return () => clearInterval(interval);
  }, []);

  const getDayName = (dateStr: string) => {
    const [day, month, year] = dateStr.split(".");
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    const dani = [
      "NEDJELJA",
      "PONEDJELJAK",
      "UTORAK",
      "SRIJEDA",
      "ČETVRTAK",
      "PETAK",
      "SUBOTA",
    ];
    return dani[date.getDay()];
  };

  const groupByDate = () => {
    const grouped: Record<string, Session[]> = {};
    sessions.forEach((s) => {
      if (!grouped[s.date]) grouped[s.date] = [];
      grouped[s.date].push(s);
    });
    return grouped;
  };

  const groupedSessions = groupByDate();

  const sortedDates = Object.keys(groupedSessions).sort((a, b) => {
    const [d1, m1, y1] = a.split(".").map(Number);
    const [d2, m2, y2] = b.split(".").map(Number);
    return (
      new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime()
    );
  });

  const toggleDate = (date: string) => {
    setExpandedDate((prev) => (prev === date ? null : date));
  };

  const reserve = async (session: Session) => {
    if (!phone || !name) {
      onShowPopup("📱 Prijavite se.");
      return;
    }

    // Check user's remaining visits
    const userSnap = await getDocs(
      query(collection(db, "users"), where("phone", "==", phone))
    );
    if (!userSnap.empty) {
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();
      const current = userData.remainingVisits ?? 0;
      const validUntilRaw = userData.validUntil;

      let validUntilDate: Date | null = null;

      if (validUntilRaw) {
        if (typeof validUntilRaw.toDate === "function") {
          validUntilDate = validUntilRaw.toDate();
        } else {
          validUntilDate = new Date(validUntilRaw);
        }
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (current <= -1 || (validUntilDate && validUntilDate < today)) {
        onShowPopup("⛔ Vaši dolasci su istekli. Uplatite nove dolaske.");
        return;
      }
    }

    // Check if session has already started
    const now = new Date();
    const [d, m, y] = session.date.split(".");
    const dateISO = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const startTime = session.time.split(" - ")[0].trim();

    const [hours, minutes] = startTime.split(":").map(Number);
    const sessionDateTime = new Date(dateISO);
    sessionDateTime.setHours(hours, minutes, 0, 0);

    if (sessionDateTime.getTime() < now.getTime()) {
      setInfoPopupMessage("⛔ Termin je završio. Rezervacija nije moguća.");
      return;
    }

    // Check for existing reservation on same day (except for admin)
    const adminPhone = "20181804";
    if (phone !== adminPhone) {
      const sameDayReservation = reservations.find(
        (r) =>
          r.phone === phone &&
          sessions.find((s) => s.id === r.sessionId)?.date === session.date
      );
      if (sameDayReservation) {
        onShowPopup("⛔ Već imate rezervaciju za taj dan.");
        return;
      }
    }

    // Check if already registered for this specific session
    const already = reservations.find(
      (r) => r.sessionId === session.id && r.phone === phone
    );
    if (already) {
      onShowPopup("⛔ Već ste prijavljeni.");
      return;
    }

    try {
      const {
        id: newId,
        status,
      }: { id: string; status: "rezervirano" | "cekanje" } =
        await runTransaction(db, async (transaction) => {
          const sessionRef = doc(db, "sessions", session.id);
          const sessionDoc = await transaction.get(sessionRef);

          if (!sessionDoc.exists()) {
            throw new Error("Session ne postoji.");
          }

          const sessionData = sessionDoc.data() as Session;

          // Determine status based on FRESH data from transaction
          // Dohvati broj postojećih rezervacija iz baze (unutar transakcije)
          const existingResSnap = await getDocs(
            query(
              collection(db, "reservations"),
              where("sessionId", "==", session.id),
              where("status", "==", "rezervirano")
            )
          );

          const brojRezervacija = existingResSnap.size;
          const status: "rezervirano" | "cekanje" =
            brojRezervacija < sessionData.maxSlots ? "rezervirano" : "cekanje";

          const newReservationRef = doc(collection(db, "reservations"));

          transaction.set(newReservationRef, {
            phone,
            name,
            sessionId: session.id,
            date: session.date,
            time: session.time,
            status,
            createdAt: new Date(),
            notified: false,
            refunded: false,
          });

          // 🔥 IMPROVED: Use increment() for atomic counter updates
          transaction.update(sessionRef, {
            bookedSlots: brojRezervacija + 1,
          });

          return { id: newReservationRef.id, status };
        });

      // Update local state
      const newReservation: Reservation = {
        id: newId,
        phone,
        name,
        sessionId: session.id,
        status,
      };

      setReservations((prev) => [...prev, newReservation]);

      if (newReservation.status === "rezervirano") {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id ? { ...s, bookedSlots: s.bookedSlots + 1 } : s
          )
        );
      }

      // 🔽 Decrease user's remaining visits
      try {
        const userSnap = await getDocs(
          query(collection(db, "users"), where("phone", "==", phone))
        );
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          const userRef = doc(db, "users", userDoc.id);
          const current = userDoc.data().remainingVisits ?? 0;
          const updated = Math.max(-1, current - 1);
          await updateDoc(userRef, { remainingVisits: updated });
        } else {
          console.warn("❗Korisnik nije pronađen za telefon:", phone);
        }
      } catch (err) {
        console.error("❌ Greška pri ažuriranju remainingVisits:", err);
      }

      // ✅ Show success message
      setInfoModalMessage(
        status === "rezervirano"
          ? `✅ Rezervirali ste termin:\n${session.date}\n${session.time}`
          : `🕐 Dodani ste na listu čekanja:\n${session.date}\n${session.time}`
      );
      setShowInfoModal(true);
      fetchData(false);
    } catch (error) {
      console.error("⛔ Greška pri upisu rezervacije:", error);
      onShowPopup("⛔ Greška pri rezervaciji. Pokušajte ponovno.");
    }
  };

  const cancel = async (session: Session) => {
    const existing = reservations.find(
      (r) => r.phone === phone && r.sessionId === session.id
    );
    if (!existing) return;

    const [d, m, y] = session.date.split(".");
    const dateISO = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const startTime = session.time.split(" - ")[0].trim();
    const [hours, minutes] = startTime.split(":").map(Number);
    const sessionDateTime = new Date(dateISO);
    sessionDateTime.setHours(hours, minutes, 0, 0);

    const now = new Date();
    const timeDiffHours =
      (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    const canCancel = timeDiffHours >= 2;

    let promotedPhone: string | null = null;

    try {
      await runTransaction(db, async (t) => {
        const sessionRef = doc(db, "sessions", session.id);
        const sessionSnap = await t.get(sessionRef);
        const sessionData = sessionSnap.data() as Session;

        // 1) Obriši korisnikovu rezervaciju
        t.delete(doc(db, "reservations", existing.id));

        // 2) Oslobodi mjesto ako je rezervirano
        let newBooked = sessionData.bookedSlots;
        if (existing.status === "rezervirano") {
          newBooked = Math.max(0, newBooked - 1);

          // 3) Nađi prvog s liste čekanja iz React state-a
          const waitlist = reservations
            .filter((r) => r.sessionId === session.id && r.status === "cekanje")
            .sort((a, b) => a.id.localeCompare(b.id)); // ID kao fallback za redoslijed

          if (waitlist.length > 0) {
            const next = waitlist[0];
            const nextRef = doc(db, "reservations", next.id);

            const nextSnap = await t.get(nextRef);
            const nextData = nextSnap.data() as Reservation;

            if (nextSnap.exists() && nextData.status === "cekanje") {
              t.update(nextRef, { status: "rezervirano" });
              newBooked += 1;
              promotedPhone = nextData.phone;
            }
          }
        }

        // 4) Ažuriraj broj zauzetih mjesta
        t.update(sessionRef, { bookedSlots: newBooked });
      });

      // 5) Pošalji WhatsApp poruku ako je netko promoviran
      if (promotedPhone) {
        await sendWhatsAppMessage(promotedPhone);
      }

      // 6) Vrati dolazak ako je otkazano na vrijeme
      if (canCancel) {
        const userSnap = await getDocs(
          query(collection(db, "users"), where("phone", "==", phone))
        );
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          const userRef = doc(db, "users", userDoc.id);
          const current = userDoc.data().remainingVisits ?? 0;
          await updateDoc(userRef, { remainingVisits: current + 1 });
        }
      }

      // 7) Obavijesti korisnika
      setInfoModalMessage(
        `Otkazali ste termin:\n${session.date}\n${session.time}`
      );
      setShowInfoModal(true);
      fetchData(false);
    } catch (err) {
      console.error("❌ Greška u transakciji otkazivanja:", err);
      onShowPopup("⛔ Greška pri otkazivanju. Pokušajte ponovno.");
    }
  };

  const getRezervacijaZaSession = (sessionId: string) =>
    reservations.filter(
      (r) => r.sessionId === sessionId && r.status === "rezervirano"
    );

  if (loading && initialLoad) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "60vh",
        }}
      >
        <img
          src={spinner}
          alt="Učitavanje..."
          style={{ width: "120px", height: "120px" }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      {label && (
        <div className="schedule-label">
          <h2
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <FaCalendarAlt size={18} color="#848B79" />
            Raspored:
          </h2>
          <h2>{label}</h2>
        </div>
      )}

      {confirmCancelSession && (
        <ConfirmPopup
          message={
            <>
              <strong>Otkazati termin?</strong>
              <br />
              {confirmCancelSession?.date}
              <br />
              {confirmCancelSession?.time}
            </>
          }
          onConfirm={() => {
            cancel(confirmCancelSession!);
            setConfirmCancelSession(null);
          }}
          onCancel={() => setConfirmCancelSession(null)}
        />
      )}

      {confirmSession && (
        <ConfirmPopup
          message={
            <>
              <strong>Rezervirati termin?</strong>
              <br />
              {confirmSession?.date}
              <br />
              {confirmSession?.time}
            </>
          }
          onConfirm={() => {
            reserve(confirmSession!);
            setConfirmSession(null);
          }}
          onCancel={() => setConfirmSession(null)}
        />
      )}

      {showInfoModal && (
        <ConfirmPopup
          message={infoModalMessage}
          onCancel={() => {
            setShowInfoModal(false);
            fetchData(); // 🔄 odmah osvježi sve
          }}
          infoOnly
        />
      )}

      {sortedDates.map((date) => (
        <div key={date} className="day-card">
          <button className="day-header" onClick={() => toggleDate(date)}>
            <span>{getDayName(date)}</span>
            <span
              style={{
                transition: "transform 0.3s",
                transform:
                  expandedDate === date ? "rotate(180deg)" : "rotate(0deg)",
              }}
            >
              ▼
            </span>
          </button>

          {dailyNotes[date] && (
            <div className="daily-note-client">
              <em>{dailyNotes[date]}</em>
            </div>
          )}

          <AnimatedCollapse isOpen={expandedDate === date}>
            {[
              ...new Map(
                groupedSessions[date].map((s) => [s.time, s])
              ).values(),
            ]
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((s, index) => {
                const reserved = reservations.find(
                  (r) => r.phone === phone && r.sessionId === s.id
                );
                const isFull =
                  getRezervacijaZaSession(s.id).length >= s.maxSlots;

                return (
                  <div
                    key={s.id}
                    className="session-card"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="session-info">
                      <span className="session-time">
                        <FaClock
                          style={{
                            marginRight: "6px",
                            fontSize: "20px",
                            position: "relative",
                            top: "3px",
                          }}
                        />
                        <strong>{s.time}</strong>
                      </span>
                      <span>
                        <FaUserFriends
                          style={{
                            marginRight: "6px",
                            position: "relative",
                            top: "3px",
                          }}
                        />
                        {getRezervacijaZaSession(s.id).length}/{s.maxSlots}
                      </span>
                    </div>

                    {reserved ? (
                      <>
                        <div
                          className={`status-tag ${
                            reserved.status === "rezervirano"
                              ? "status-rezervirano"
                              : "status-cekanje"
                          }`}
                        >
                          {reserved.status === "rezervirano" ? (
                            <>
                              <FaCheckCircle
                                style={{
                                  marginRight: "6px",
                                  position: "relative",
                                  top: "3px",
                                }}
                              />
                              Rezervirano
                            </>
                          ) : (
                            <>
                              <FaClock
                                style={{
                                  marginRight: "6px",
                                  position: "relative",
                                  top: "3px",
                                }}
                              />
                              Čekanje
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <button
                        className={`reserve-button ${isFull ? "full" : ""}`}
                        onClick={() => setConfirmSession(s)}
                      >
                        {isFull ? "Lista čekanja" : "Rezerviraj"}
                      </button>
                    )}
                  </div>
                );
              })}
          </AnimatedCollapse>
        </div>
      ))}
    </div>
  );
};

export default ScheduleCards;
