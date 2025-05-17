import { useEffect, useState } from "react";
import AnimatedCollapse from "./AnimatedCollapse";
import { db } from "./firebase";
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

const sendWhatsAppMessage = async (rawPhone: string) => {
  const normalized = rawPhone.startsWith("0")
    ? "385" + rawPhone.slice(1)
    : rawPhone;

  try {
    const response = await fetch(
      "https://z3g8qx.api.infobip.com/whatsapp/1/message/template",
      {
        method: "POST",
        headers: {
          Authorization:
            "App a0c43ce9d5d14a83e05b1d09e8088860-21c77bf5-0311-49e3-8d62-01c20e94b9f3",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              from: "15557795075",
              to: normalized,
              messageId: "waitlist-" + Date.now(),
              content: {
                templateName: "waitlist_moved",
                templateData: {
                  body: {
                    placeholders: [],
                  },
                },
                language: "hr",
              },
            },
          ],
        }),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ WhatsApp greška:", data);
    } else {
      console.log("✅ WhatsApp poslana:", data);
    }
  } catch (err) {
    console.error("❌ WhatsApp fetch greška:", err);
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

  const fetchData = async () => {
    setLoading(true);

    const sessionsSnap = await getDocs(collection(db, "sessions"));
    const reservationsSnap = await getDocs(collection(db, "reservations"));
    const metaDoc = await getDoc(doc(db, "draftSchedule", "meta"));

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

    setLoading(false);

    setInitialLoad(false);
  };

  useEffect(() => {
    fetchData();
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

    const userSnap = await getDocs(
      query(collection(db, "users"), where("phone", "==", phone))
    );
    if (!userSnap.empty) {
      const userDoc = userSnap.docs[0];
      const current = userDoc.data().remainingVisits ?? 0;

      if (current <= -5) {
        onShowPopup("⛔ Nemate dovoljno dolazaka za rezervaciju.");
        return;
      }
    }

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

    const adminPhone = "0911529422"; // <-- ovdje ide broj za admina za vise rezervacija

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

    const already = reservations.find(
      (r) => r.sessionId === session.id && r.phone === phone
    );
    if (already) {
      onShowPopup("⛔ Već ste prijavljeni.");
      return;
    }

    const status =
      session.bookedSlots < session.maxSlots ? "rezervirano" : "cekanje";

    try {
      const reservationRef = await addDoc(collection(db, "reservations"), {
        phone,
        name,
        sessionId: session.id,
        date: session.date,
        time: session.time,
        status,
        createdAt: new Date(),
        notified: false,
      });

      // ✅ Lokalno dodaj novu rezervaciju
      const newReservation: Reservation = {
        id: reservationRef.id,
        phone,
        name,
        sessionId: session.id,
        status,
      };
      setReservations((prev) => [...prev, newReservation]);

      // ✅ Ako je rezervirano, lokalno ažuriraj bookedSlots
      if (status === "rezervirano") {
        await updateDoc(doc(db, "sessions", session.id), {
          bookedSlots: session.bookedSlots + 1,
        });

        setSessions((prev) =>
          prev.map((s) =>
            s.id === session.id ? { ...s, bookedSlots: s.bookedSlots + 1 } : s
          )
        );
      }

      // 🔽 Smanji broj dolazaka korisniku
      try {
        const userSnap = await getDocs(
          query(collection(db, "users"), where("phone", "==", phone))
        );
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          const userRef = doc(db, "users", userDoc.id);
          const current = userDoc.data().remainingVisits ?? 0;
          const updated = Math.max(-5, current - 1);
          await updateDoc(userRef, { remainingVisits: updated });
        } else {
          console.warn("❗Korisnik nije pronađen za telefon:", phone);
        }
      } catch (err) {
        console.error("❌ Greška pri ažuriranju remainingVisits:", err);
      }

      // ✅ Prikaži obavijest
      setInfoModalMessage(
        status === "rezervirano"
          ? `✅ Rezervirali ste termin:\n${session.date}\n${session.time}`
          : `🕐 Dodani ste na listu čekanja:\n${session.date}\n${session.time}`
      );
      setShowInfoModal(true);

      // ❌ Nema više potrebe za onReservationMade(); jer ne radimo refetch
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

    // Preračunaj je li otkazano na vrijeme
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

    await deleteDoc(doc(db, "reservations", existing.id));

    let bookedSlots = session.bookedSlots;
    let netkoUletio = false;

    if (existing.status === "rezervirano") {
      bookedSlots = Math.max(0, bookedSlots - 1);

      // Provjeri listu čekanja
      const listaSnap = await getDocs(collection(db, "reservations"));
      const listaCekanja: Reservation[] = listaSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Reservation))
        .filter((r) => r.sessionId === session.id && r.status === "cekanje");

      if (listaCekanja.length > 0) {
        const prvi = listaCekanja[0];

        await updateDoc(doc(db, "reservations", prvi.id), {
          status: "rezervirano",
        });

        if (prvi.phone) {
          await sendWhatsAppMessage(prvi.phone);
        }

        setReservations((prev) =>
          prev.map((r) =>
            r.id === prvi.id ? { ...r, status: "rezervirano" } : r
          )
        );

        // Ako netko uskoči, broj ostaje isti
        bookedSlots += 1;
        netkoUletio = true;
      }

      await updateDoc(doc(db, "sessions", session.id), {
        bookedSlots,
      });

      setSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, bookedSlots } : s))
      );

      // Ako je otkazano pravovremeno → vrati dolazak
      if (canCancel) {
        try {
          const userSnap = await getDocs(
            query(collection(db, "users"), where("phone", "==", phone))
          );
          if (!userSnap.empty) {
            const userDoc = userSnap.docs[0];
            const userRef = doc(db, "users", userDoc.id);
            const current = userDoc.data().remainingVisits ?? 0;
            await updateDoc(userRef, { remainingVisits: current + 1 });
          }
        } catch (err) {
          console.error("❌ Greška pri vraćanju dolaska:", err);
        }
      }
    }

    setInfoModalMessage(
      `Otkazali ste termin: \n${session.date} \n${session.time}`
    );
    setShowInfoModal(true);
  };

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
                const isFull = s.bookedSlots >= s.maxSlots;

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
                        {s.bookedSlots}/{s.maxSlots}
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

                        {(() => {
                          const now = new Date();
                          const [d, m, y] = s.date.split(".");
                          const dateISO = `${y}-${m.padStart(
                            2,
                            "0"
                          )}-${d.padStart(2, "0")}`;
                          const startTime = s.time.split(" - ")[0].trim();
                          const [hours, minutes] = startTime
                            .split(":")
                            .map(Number);
                          const sessionDateTime = new Date(dateISO);
                          sessionDateTime.setHours(hours, minutes, 0, 0);

                          const isToday =
                            now.toDateString() ===
                            sessionDateTime.toDateString();
                          const isPast =
                            sessionDateTime.getTime() < now.getTime();

                          let canCancel = true;
                          if (isPast) {
                            canCancel = false;
                          } else if (isToday) {
                            const timeDiffHours =
                              (sessionDateTime.getTime() - now.getTime()) /
                              (1000 * 60 * 60);
                            canCancel = timeDiffHours >= 2;
                          }

                          return (
                            <button
                              className="cancel-button"
                              onClick={() =>
                                canCancel ? setConfirmCancelSession(s) : null
                              }
                              disabled={!canCancel}
                              style={{
                                opacity: canCancel ? 1 : 0.5,
                                cursor: canCancel ? "pointer" : "not-allowed",
                              }}
                            >
                              <FaTimesCircle
                                style={{
                                  marginRight: "6px",
                                  position: "relative",
                                  top: "3px",
                                }}
                              />
                              {canCancel
                                ? "Otkaži"
                                : isPast
                                ? "Termin je prošao"
                                : "Prekasno za otkazivanje"}
                            </button>
                          );
                        })()}
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
