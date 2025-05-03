import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import ConfirmPopup from "./ConfirmPopup";
import "./MyBookings.css";
import spinner from "./gears-spinner.svg";

type Booking = {
  id: string;
  sessionId: string;
  phone: string;
  name?: string;
  date: string;
  time: string;
  status: "rezervirano" | "cekanje";
};

const MyBookings = ({
  onChanged,
}: {
  onChanged: (message: string) => void;
}) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [currentLabel, setCurrentLabel] = useState("");

  const [loading, setLoading] = useState(false);
  const [confirmCancelBooking, setConfirmCancelBooking] =
    useState<Booking | null>(null);
  const phone = localStorage.getItem("phone");

  useEffect(() => {
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
      setBookings(fetched.sort((a, b) => a.date.localeCompare(b.date)));

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

    fetchAll();
  }, []);

  const fetchBookings = async () => {
    if (!phone) return;
    setLoading(true);

    const snap = await getDocs(
      query(collection(db, "reservations"), where("phone", "==", phone))
    );

    const fetched = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Booking[];

    setBookings(fetched.sort((a, b) => a.date.localeCompare(b.date)));
    setLoading(false);
  };

  const cancelBooking = async (booking: Booking) => {
    try {
      await deleteDoc(doc(db, "reservations", booking.id));

      if (booking.status === "rezervirano") {
        const sessionSnap = await getDocs(
          query(
            collection(db, "sessions"),
            where("__name__", "==", booking.sessionId)
          )
        );
        const sessionDoc = sessionSnap.docs[0];
        if (sessionDoc) {
          const sessionData = sessionDoc.data();
          const currentBooked = sessionData.bookedSlots || 0;
          const sessionRef = doc(db, "sessions", booking.sessionId);

          await updateDoc(sessionRef, {
            bookedSlots: Math.max(0, currentBooked - 1),
          });
        }
      }

      setBookings((prev) => prev.filter((b) => b.id !== booking.id));
      onChanged(`❌ Otkazali ste termin:  ${booking.date}  ${booking.time}`);

      setTimeout(() => {
        onChanged("");
      }, 3000);
    } catch (error) {
      console.error("Greška pri otkazivanju termina:", error);
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
        <p>Nemate nijedan aktivan termin.</p>
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

  const isToday = now.toDateString() === bookingDateTime.toDateString();
  const isPast = bookingDateTime.getTime() < now.getTime();

  let canCancel = true;

  if (isPast) {
    canCancel = false;
  } else if (isToday) {
    const timeDiffHours = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    canCancel = timeDiffHours >= 3;
  }

  return (
    <div className="booking-card" key={booking.id}>
      <div className="booking-info">
        <span>{booking.date}</span>
        <span>{booking.time}</span>
      </div>
      <div className="booking-status">
        {booking.status === "rezervirano" ? (
          <span className="status-tag reserved">✅ Rezervirano</span>
        ) : (
          <span className="status-tag waiting">🕐 Čekanje</span>
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
        ❌{" "}
        {canCancel
          ? "Otkazivanje"
          : isPast
            ? "Termin je prošao"
            : "Prekasno za otkazivanje (danas unutar 3h)"}
      </button>
    </div>
  );
})}




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
    </div>
  );
};

export default MyBookings;
