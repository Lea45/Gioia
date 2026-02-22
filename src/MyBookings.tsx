import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import ConfirmPopup from "./ConfirmPopup";
import "./MyBookings.css";
import spinner from "./gears-spinner.svg";
import { sendWhatsAppMessage } from "./ScheduleCards";
import { cancelReservation } from "./reservationUtils";

import { FaCheckCircle, FaClock, FaTimesCircle, FaFolderOpen } from "react-icons/fa";

type Booking = {
  id: string;
  sessionId: string;
  phone: string;
  name?: string;
  date: string;
  time: string;
  status: "rezervirano" | "cekanje" | "otkazano";
};

type MyBookingsProps = {
  onChanged: (message: string) => void;
};

const MyBookings = ({ onChanged }: MyBookingsProps) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [showPastBookings, setShowPastBookings] = useState(false);
  const [currentLabel, setCurrentLabel] = useState("");
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [confirmCancelBooking, setConfirmCancelBooking] =
    useState<Booking | null>(null);
  const phone = localStorage.getItem("phone");

  const fetchAll = async () => {
    if (!phone) return;
    setLoading(true);

    // Dohvati rezervacije
    const snap = await getDocs(
      query(collection(db, "reservations"), where("phone", "==", phone))
    );
    const fetched = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Booking[];

    const now = new Date();

    const futureBookings = fetched.filter((b) => {
      if (b.status === "otkazano") return false;
      const [d, m, y] = b.date.split(".");
      const dateISO = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      const rawTime = b.time.split(/[-–]/)[0].trim();
      const [hours, minutes] = rawTime.split(":").map(Number);
      const date = new Date(dateISO);
      date.setHours(hours, minutes, 0, 0);
      return date.getTime() >= now.getTime();
    });

    // Svi termini sa statusom "rezervirano" idu u evidenciju dolazaka
    // (čekanje ne ide dok se ne prebaci na rezervirano)
    const past = fetched.filter((b) => b.status === "rezervirano");

    // Sortiraj po datumu - najnoviji na vrhu
    const sortedPast = past.sort((a, b) => {
      const [dA, mA, yA] = a.date.split(".");
      const [dB, mB, yB] = b.date.split(".");
      const dateA = new Date(`${yA}-${mA.padStart(2, "0")}-${dA.padStart(2, "0")}`);
      const dateB = new Date(`${yB}-${mB.padStart(2, "0")}-${dB.padStart(2, "0")}`);
      return dateB.getTime() - dateA.getTime(); // Noviji prvi
    });

    setBookings(futureBookings);
    setPastBookings(sortedPast);

    // Dohvati aktivni tjedan
    const metaDoc = await getDocs(
      query(collection(db, "sessions"), where("__name__", "==", "meta"))
    );
    const meta = metaDoc.docs[0];
    if (meta && meta.exists()) {
      const data = meta.data();
      if (data.label) setCurrentLabel(data.label);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const cancelBooking = async (booking: Booking) => {
    try {
      const result = await cancelReservation(booking.id);

      console.log("Otkazivanje rezultat:", {
        reservationId: booking.id,
        phone: booking.phone,
        date: booking.date,
        time: booking.time,
        ...result,
      });

      if (!result.ok) {
        console.error("Otkazivanje neuspješno:", result.reason);
        return;
      }

      // Pošalji WhatsApp ako je netko promaknut s čekanja
      if (result.promotedPhone) {
        await sendWhatsAppMessage(result.promotedPhone);
      }

      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
      setInfoModalMessage(
        result.refunded
          ? `Otkazali ste termin:\n${booking.date}\n${booking.time}\n\n✅ Dolazak je vraćen.`
          : `Otkazali ste termin:\n${booking.date}\n${booking.time}`
      );
      setShowInfoModal(true);
    } catch (err) {
      console.error("❌ Greška pri otkazivanju:", err);
    }
  };

  return (
    <div className="my-bookings">
      {currentLabel && (
        <h3 style={{ textAlign: "center", marginBottom: "10px" }}>
          📌 Aktivni tjedan: {currentLabel}
        </h3>
      )}

      {loading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
          }}
        >
          <img
            src={spinner}
            alt="Učitavanje..."
            style={{ width: "120px", height: "120px" }}
          />
        </div>
      ) : bookings.length === 0 ? (
        <p className="no-bookings-message">Nemate aktivnih termina.</p>
      ) : (
        <div className="bookings-list">
          {bookings.map((booking) => {
            const now = new Date();

            // Parsiranje datuma i vremena
            const [d, m, y] = booking.date.split(".");
            const dateISO = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

            // Uzmi samo vrijeme početka termina (npr. "16:00")
            const rawTime = booking.time.split(/[-–]/)[0].trim(); // podržava "-" i "–"
            const [hours, minutes] = rawTime.split(":").map(Number);

            // Napravi točan Date objekt termina
            const bookingDateTime = new Date(dateISO);
            bookingDateTime.setHours(hours, minutes, 0, 0); // ručno postavi sat i minutu

            const isToday =
              now.toDateString() === bookingDateTime.toDateString();
            const isPast = bookingDateTime.getTime() < now.getTime();

            let canCancel = true;

            if (isPast) {
              canCancel = false;
            } else if (isToday) {
              const timeDiffHours =
                (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
              canCancel = timeDiffHours >= 2;
            }

            return (
              <div className="booking-card" key={booking.id}>
                <div className="booking-info">
                  <span>{booking.date}</span>
                  <span>{booking.time}</span>
                </div>
                <div className="booking-status">
                  {booking.status === "rezervirano" ? (
                    <span className="status-tag reserved">
                      <FaCheckCircle
                        style={{
                          marginRight: "6px",
                          position: "relative",
                          top: "3px",
                        }}
                      />
                      Rezervirano
                    </span>
                  ) : (
                    <span className="status-tag waiting">
                      <FaClock
                        style={{
                          marginRight: "6px",
                          position: "relative",
                          top: "3px",
                        }}
                      />
                      Čekanje
                    </span>
                  )}
                </div>

                <button
                  className="cancel-button"
                  onClick={() =>
                    canCancel ? setConfirmCancelBooking(booking) : null
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
              </div>
            );
          })}
        </div>
      )}

      {/* Gumb za prošle termine */}
      {pastBookings.length > 0 && (
        <div className="past-bookings-section">
          <button
            className="past-bookings-toggle"
            onClick={() => setShowPastBookings(true)}
          >
            <FaFolderOpen style={{ marginRight: "8px" }} />
            Evidencija dolazaka ({pastBookings.length})
          </button>
        </div>
      )}

      {/* Modal za evidenciju dolazaka */}
      {showPastBookings && (
        <div className="past-bookings-overlay" onClick={() => setShowPastBookings(false)}>
          <div className="past-bookings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="past-bookings-modal-header">
              <h3>
                <FaFolderOpen style={{ marginRight: "8px" }} />
                Evidencija dolazaka
              </h3>
              <button
                className="past-bookings-close"
                onClick={() => setShowPastBookings(false)}
              >
                &times;
              </button>
            </div>
            <div className="past-bookings-list">
              {pastBookings.map((booking) => (
                <div className="past-booking-card" key={booking.id}>
                  <div className="booking-info">
                    <span>{booking.date}</span>
                    <span>{booking.time}</span>
                  </div>
                  <div className="booking-status">
                    <span className="status-tag past-reserved">
                      <FaCheckCircle style={{ marginRight: "6px" }} />
                      Prisustvovali
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmCancelBooking && (
        <ConfirmPopup
          message={
            <>
              Jeste li sigurni da želite otkazati termin?
              <br />
              <strong>{confirmCancelBooking.date}</strong>
              <br />
              <strong>{confirmCancelBooking.time}</strong>
            </>
          }
          onConfirm={() => {
            cancelBooking(confirmCancelBooking);
            setConfirmCancelBooking(null);
          }}
          onCancel={() => setConfirmCancelBooking(null)}
        />
      )}

      {showInfoModal && (
        <ConfirmPopup
          message={infoModalMessage}
          onCancel={() => {
            setShowInfoModal(false);
            fetchAll();
          }}
          infoOnly
        />
      )}
    </div>
  );
};

export default MyBookings;
