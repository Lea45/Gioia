import { useState, useEffect } from "react";
import { db } from "./firebase";
import "./StatusManagement.css";
import { FaSyncAlt, FaUndoAlt } from "react-icons/fa";
import spinner from "./gears-spinner.svg";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

type Reservation = {
  id: string;
  phone: string;
  name?: string;
  sessionId: string;
  date: string;
  time: string;
  status: "rezervirano" | "cekanje";
  refunded: boolean;
};

type Session = {
  id: string;
  date: string;
  time: string;
};

export default function StatusManagement() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState("");

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await fetchSessions();
      await fetchReservations();
      setLoading(false);
    };
    loadAll();
  }, []);

  const fetchSessions = async () => {
    const querySnapshot = await getDocs(collection(db, "sessions"));
    const sessionList = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      date: doc.data().date,
      time: doc.data().time,
    }));
    setSessions(sessionList);
  };

  const fetchReservations = async () => {
    const querySnapshot = await getDocs(collection(db, "reservations"));
    const reservationList = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      phone: doc.data().phone,
      name: doc.data().name,
      sessionId: doc.data().sessionId,
      date: doc.data().date,
      time: doc.data().time,
      status: doc.data().status,
      refunded: doc.data().refunded ?? false,
    }));
    setReservations(reservationList);
  };

  const refreshData = async () => {
    setLoading(true);
    await fetchSessions();
    await fetchReservations();
    setLoading(false);
  };

  const formatWeekday = (dateString: string) => {
    if (!dateString) return "NEPOZNAT DAN";
    const parts = dateString.split(".").map((part) => part.trim());
    if (parts.length < 3) return "NEPOZNAT DAN";
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return "NEPOZNAT DAN";
    return date
      .toLocaleDateString("hr-HR", {
        weekday: "long",
      })
      .toUpperCase();
  };

  const groupedSessions = sessions.reduce(
    (acc: { [date: string]: Session[] }, session) => {
      if (!acc[session.date]) acc[session.date] = [];
      acc[session.date].push(session);
      return acc;
    },
    {}
  );

  const handleRefundConfirmed = async () => {
    try {
      const now = new Date();

      const waitlistToRefund = reservations.filter((res) => {
        if (res.status !== "cekanje" || res.refunded === true) return false;

        const [day, month, year] = res.date
          .split(".")
          .map((x) => parseInt(x, 10));
        const [startHour] = res.time.split(" - ");
        const [hour, minute] = startHour.split(":").map(Number);

        const resDate = new Date(year, month - 1, day, hour, minute);
        return resDate < now;
      });

      if (waitlistToRefund.length === 0) {
        setInfoModalMessage("ℹ️ Nema rezervacija na čekanju za povrat.");
        setShowInfoModal(true);
        return;
      }

      // Pripremi sve operacije, zatim izvrši atomski po korisniku
      let refundedCount = 0;
      const errors: string[] = [];

      for (const res of waitlistToRefund) {
        const userQuery = query(
          collection(db, "users"),
          where("phone", "==", res.phone)
        );
        const userSnap = await getDocs(userQuery);

        if (userSnap.empty) {
          errors.push(`Korisnik ${res.phone} nije pronađen.`);
          continue;
        }

        const userDocRef = userSnap.docs[0].ref;
        const resRef = doc(db, "reservations", res.id);

        // writeBatch: obe operacije uspiju ili obje padnu (all-or-nothing)
        try {
          const batch = writeBatch(db);
          batch.update(userDocRef, { remainingVisits: increment(1) });
          batch.update(resRef, { refunded: true });
          await batch.commit();
          refundedCount++;
        } catch (err) {
          console.error(`❌ Greška pri povratu za ${res.name || res.phone}:`, err);
          errors.push(`${res.name || res.phone}: greška pri povratu`);
        }
      }

      if (errors.length > 0) {
        setInfoModalMessage(
          `✔ Vraćeno dolazaka: ${refundedCount}\n❌ Neuspješno: ${errors.length}\n\n${errors.join("\n")}`
        );
      } else {
        setInfoModalMessage(
          "✔ Vraćeni su dolasci za sve korisnike s liste čekanja čiji su termini prošli."
        );
      }
      setShowInfoModal(true);
      refreshData();
    } catch (error) {
      console.error("Greška pri globalnom povratu:", error);
      setInfoModalMessage("❌ Greška prilikom vraćanja dolazaka.");
      setShowInfoModal(true);
    } finally {
      setShowConfirmModal(false);
    }
  };

  return (
    <div className="status-management-container">
      <h2>Status Termina</h2>

      <div className="refresh-button-container">
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              padding: "1rem",
            }}
          >
            <img
              src={spinner}
              alt="Učitavanje..."
              style={{ width: "60px", height: "60px" }}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <button className="refresh-button" onClick={refreshData}>
              <FaSyncAlt
                className="button-icon"
                style={{ marginRight: "8px" }}
              />
              Osvježi podatke
            </button>
            <button
              className="refund-button"
              onClick={() => setShowConfirmModal(true)}
            >
              <FaUndoAlt
                className="button-icon"
                style={{ marginRight: "8px" }}
              />
              Vrati dolaske
            </button>
          </div>
        )}
      </div>
      {showConfirmModal && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <p>
              Jeste li sigurni da želite vratiti dolaske za sve rezervacije na
              čekanju kojima je prošao termin?
            </p>
            <div className="confirm-buttons">
              <button onClick={handleRefundConfirmed} className="confirm-yes">
                Da
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="confirm-no"
              >
                Ne
              </button>
            </div>
          </div>
        </div>
      )}
      {showInfoModal && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <p style={{ whiteSpace: "pre-line" }}>{infoModalMessage}</p>
            <div className="confirm-buttons">
              <button
                onClick={() => setShowInfoModal(false)}
                className="confirm-yes"
              >
                U redu
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading &&
        ["ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota"].map(
          (weekday) => {
            const entry = Object.entries(groupedSessions).find(
              ([date]) => formatWeekday(date).toLowerCase() === weekday
            );
            if (!entry) return null;
            const [date] = entry;

            return (
              <div key={date} className="date-card">
                <div
                  className="date-header"
                  onClick={() =>
                    setExpandedDate(expandedDate === date ? null : date)
                  }
                >
                  <div className="weekday-text">{formatWeekday(date)}</div>
                </div>

                {expandedDate === date && (
                  <div className="sessions-list">
                    {[
                      ...new Map(
                        groupedSessions[date].map((item) => [item.time, item])
                      ).values(),
                    ]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((session) => {
                        const relatedReservations = reservations.filter(
                          (r) =>
                            r.date === session.date && r.time === session.time
                        );
                        const reservationCount = relatedReservations.filter(
                          (r) => r.status === "rezervirano"
                        ).length;

                        return (
                          <div key={session.id} className="session-item">
                            <div
                              className="session-time"
                              onClick={() =>
                                setExpandedSessionId(
                                  expandedSessionId === session.id
                                    ? null
                                    : session.id
                                )
                              }
                            >
                              <div className="time-text">{session.time}</div>
                              <div className="reservation-count">
                                ({reservationCount}{" "}
                                {reservationCount === 1 ||
                                reservationCount === 0 ||
                                reservationCount >= 5
                                  ? "rezervacija"
                                  : "rezervacije"}
                                )
                              </div>
                            </div>

                            {expandedSessionId === session.id && (
                              <div className="reservation-list">
                                {relatedReservations.filter(
                                  (r) => r.status === "rezervirano"
                                ).length > 0 && (
                                  <>
                                    <div
                                      style={{
                                        fontWeight: "bold",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      ✅ Rezervirani:
                                    </div>
                                    {relatedReservations
                                      .filter(
                                        (res) => res.status === "rezervirano"
                                      )
                                      .map((res) => (
                                        <div
                                          key={res.id}
                                          className="reservation-item"
                                        >
                                          {res.name || res.phone}
                                        </div>
                                      ))}
                                  </>
                                )}

                                {relatedReservations.filter(
                                  (r) => r.status === "cekanje"
                                ).length > 0 && (
                                  <>
                                    <hr
                                      style={{
                                        margin: "12px 0",
                                        border: "none",
                                        borderTop: "1px solid #ccc",
                                      }}
                                    />
                                    <div
                                      style={{
                                        fontWeight: "bold",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      🕐 Lista čekanja:
                                    </div>
                                    {relatedReservations
                                      .filter((res) => res.status === "cekanje")
                                      .map((res) => (
                                        <div
                                          key={res.id}
                                          className="reservation-item"
                                        >
                                          {res.name || res.phone}
                                        </div>
                                      ))}
                                  </>
                                )}

                                {relatedReservations.length === 0 && (
                                  <div className="no-reservations">
                                    Nema rezervacija
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          }
        )}
    </div>
  );
}
