import { useEffect, useState } from "react";
import AnimatedCollapse from "./AnimatedCollapse";
import { db } from "./firebase";
import { runTransaction } from "firebase/firestore";

import {
  collection,
  getDocs,
  updateDoc,
  doc,
  getDoc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { cancelReservation } from "./reservationUtils";
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
  status: "rezervirano" | "cekanje" | "otkazano";
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
  const [reservingSessionId, setReservingSessionId] = useState<string | null>(null);

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

    const fetchedReservations = reservationsSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((r: any) => r.status !== "otkazano") as Reservation[];

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

    // Dohvati user dokument (treba nam referenca za transakciju)
    const userSnap = await getDocs(
      query(collection(db, "users"), where("phone", "==", phone))
    );
    let userDocRef: ReturnType<typeof doc> | null = null;

    if (!userSnap.empty) {
      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();
      userDocRef = doc(db, "users", userDoc.id);
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

    // Provjeri je li termin već počeo
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

    // Provjera duplikata na isti dan (osim admina)
    const adminPhone = "20181804";
    if (phone !== adminPhone) {
      const sameDayReservation = reservations.find(
        (r) =>
          r.phone === phone &&
          r.status !== "otkazano" &&
          sessions.find((s) => s.id === r.sessionId)?.date === session.date
      );
      if (sameDayReservation) {
        onShowPopup("⛔ Već imate rezervaciju za taj dan.");
        return;
      }
    }

    // Provjera duplikata za ovaj termin (lokalna)
    const already = reservations.find(
      (r) =>
        r.sessionId === session.id &&
        r.phone === phone &&
        r.status !== "otkazano"
    );
    if (already) {
      onShowPopup("⛔ Već ste prijavljeni.");
      return;
    }

    // Spriječi dvostruki klik
    if (reservingSessionId === session.id) {
      return;
    }
    setReservingSessionId(session.id);

    try {
      const {
        id: newId,
        status,
      }: { id: string; status: "rezervirano" | "cekanje" } =
        await runTransaction(db, async (transaction) => {
          // ===== FAZA 1: SVI READS PRVO =====
          const sessionRef = doc(db, "sessions", session.id);
          const sessionDoc = await transaction.get(sessionRef);

          if (!sessionDoc.exists()) {
            throw new Error("Session ne postoji.");
          }

          const sessionData = sessionDoc.data() as Session;

          // Dohvati user doc unutar transakcije (PRIJE writeova)
          let userSnapTx = null;
          if (userDocRef) {
            userSnapTx = await transaction.get(userDocRef);
          }

          // getDocs NIJE transaction read, može biti između
          const userExistingRes = await getDocs(
            query(
              collection(db, "reservations"),
              where("sessionId", "==", session.id),
              where("phone", "==", phone)
            )
          );

          const hasActiveReservation = userExistingRes.docs.some(
            (d) => d.data().status !== "otkazano"
          );
          if (hasActiveReservation) {
            throw new Error("ALREADY_RESERVED");
          }

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

          // ===== FAZA 2: SVI WRITES =====
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
            visitDeducted: !!userDocRef,
            visitDeductedAt: userDocRef ? serverTimestamp() : null,
          });

          transaction.update(sessionRef, {
            bookedSlots: brojRezervacija + 1,
          });

          // ATOMSKI smanji remainingVisits (read je već obavljen gore)
          if (userDocRef && userSnapTx) {
            const currentVisits = userSnapTx.data()?.remainingVisits ?? 0;
            transaction.update(userDocRef, {
              remainingVisits: Math.max(-1, currentVisits - 1),
            });
          }

          return { id: newReservationRef.id, status };
        });

      // Ažuriraj lokalni state
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

      setInfoModalMessage(
        status === "rezervirano"
          ? `✅ Rezervirali ste termin:\n${session.date}\n${session.time}`
          : `🕐 Dodani ste na listu čekanja:\n${session.date}\n${session.time}`
      );
      setShowInfoModal(true);
      fetchData(false);
    } catch (error: any) {
      if (error?.message === "ALREADY_RESERVED") {
        onShowPopup("⛔ Već ste prijavljeni na ovaj termin.");
      } else {
        console.error("⛔ Greška pri upisu rezervacije:", error);
        onShowPopup("⛔ Greška pri rezervaciji. Pokušajte ponovno.");
      }
    } finally {
      setReservingSessionId(null);
    }
  };

  const cancel = async (session: Session) => {
    const existing = reservations.find(
      (r) =>
        r.phone === phone &&
        r.sessionId === session.id &&
        r.status !== "otkazano"
    );
    if (!existing) return;

    try {
      const result = await cancelReservation(existing.id);

      if (!result.ok) {
        onShowPopup("⛔ Greška pri otkazivanju.");
        return;
      }

      // Pošalji WhatsApp ako je netko promaknut s čekanja
      if (result.promotedPhone) {
        await sendWhatsAppMessage(result.promotedPhone);
      }

      setInfoModalMessage(
        result.refunded
          ? `Otkazali ste termin:\n${session.date}\n${session.time}\nDolazak je vraćen.`
          : `Otkazali ste termin:\n${session.date}\n${session.time}`
      );
      setShowInfoModal(true);
      fetchData(false);
    } catch (err) {
      console.error("❌ Greška pri otkazivanju:", err);
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
                        disabled={reservingSessionId === s.id}
                      >
                        {reservingSessionId === s.id
                          ? "Učitavanje..."
                          : isFull
                          ? "Lista čekanja"
                          : "Rezerviraj"}
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
