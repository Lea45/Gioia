import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import "./StatusManagement.css";
import { FaSyncAlt } from 'react-icons/fa';
import spinner from "./gears-spinner.svg";

type Reservation = {
  id: string;
  phone: string;
  name?: string;
  sessionId: string;
  date: string;
  time: string;
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
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    return date.toLocaleDateString("hr-HR", {
      weekday: "long",
    }).toUpperCase();
  };

  const groupedSessions = sessions.reduce(
    (acc: { [date: string]: Session[] }, session) => {
      if (!acc[session.date]) acc[session.date] = [];
      acc[session.date].push(session);
      return acc;
    },
    {}
  );

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
          <button className="refresh-button" onClick={refreshData}>
            <FaSyncAlt style={{ marginRight: "8px" }} />
            Osvježi podatke
          </button>
        )}
      </div>

      {!loading &&
        ["ponedjeljak", "utorak", "srijeda", "četvrtak", "petak", "subota"].map(
          (weekday) => {
            const entry = Object.entries(groupedSessions).find(
              ([date]) =>
                formatWeekday(date).toLowerCase() === weekday
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
                    {[...new Map(groupedSessions[date].map((item) => [item.time, item])).values()]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((session) => {
                        const relatedReservations = reservations.filter(
                          (r) => r.date === session.date && r.time === session.time
                        );
                        const reservationCount = relatedReservations.length;

                        return (
                          <div key={session.id} className="session-item">
                            <div
                              className="session-time"
                              onClick={() =>
                                setExpandedSessionId(
                                  expandedSessionId === session.id ? null : session.id
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
                                {reservationCount > 0 ? (
                                  relatedReservations.map((res) => (
                                    <div key={res.id} className="reservation-item">
                                      {res.name ? res.name : res.phone}
                                    </div>
                                  ))
                                ) : (
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
