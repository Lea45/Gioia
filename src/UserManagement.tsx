import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  runTransaction,
  where,
} from "firebase/firestore";
import "./UserManagement.css";
import { normalizePhone } from "./utils/normalizePhone";
import { cancelReservation } from "./reservationUtils";
import { sendWhatsAppMessage } from "./ScheduleCards";
import {
  appendReservationHistory,
  type ReservationEventType,
} from "./reservationHistory";

// Koristi Firebase Function za slanje admin obavijesti (API ključ je siguran na serveru)
const ADMIN_FUNCTION_URL = "/api/sendAdminNotification";

const sendAdminNoticeToPhone = async (phone: string, message: string): Promise<boolean> => {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    const token = await user.getIdToken();

    const response = await fetch(ADMIN_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ phone, message }),
    });

    return response.ok;
  } catch {
    return false;
  }
};

const sendWithRetry = async (phone: string, message: string, maxAttempts = 3): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ok = await sendAdminNoticeToPhone(phone, message);
    if (ok) return true;
  }
  return false;
};

type ReservationActivity = {
  id: string;
  reservationId: string;
  type: ReservationEventType;
  date: string;
  time: string;
  createdAt: Date | null;
  amount?: number;
  previousVisits?: number;
  newVisits?: number;
  reason?: string;
  source?: string;
};

type UserReservation = {
  id: string;
  phone?: string;
  name?: string;
  sessionId?: string;
  status?: string;
  date?: string;
  time?: string;
  createdAt?: unknown;
  notified?: boolean;
  visitDeducted?: boolean;
  visitDeductedAt?: unknown;
  cancelledAt?: unknown;
  refunded?: boolean;
  refundReason?: string;
  refundedAt?: unknown;
  history?: unknown;
};

const reservationEventTypes: ReservationEventType[] = [
  "rezervacija",
  "cekanje",
  "promaknuto",
  "otkazivanje",
  "povrat_dolaska",
  "admin_dolazak",
];

const isReservationEventType = (value: unknown): value is ReservationEventType =>
  reservationEventTypes.includes(value as ReservationEventType);

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value) {
    const toDateMethod = value.toDate;
    if (typeof toDateMethod === "function") {
      const converted = toDateMethod.call(value);
      return converted instanceof Date && !Number.isNaN(converted.getTime())
        ? converted
        : null;
    }
  }
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const activityLabel: Record<ReservationEventType, string> = {
  rezervacija: "Rezervirano",
  cekanje: "Stavljen na listu čekanja",
  promaknuto: "Promaknut s liste čekanja",
  otkazivanje: "Rezervacija otkazana",
  povrat_dolaska: "Vraćen dolazak",
  admin_dolazak: "Admin promijenio dolaske",
};

const formatTimestamp = (value: unknown) => {
  const date = toDate(value);
  return date
    ? date.toLocaleString("hr-HR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Nije zabilježeno";
};

const reservationStatusLabel = (status?: string) => {
  if (status === "rezervirano") return "Rezervirano";
  if (status === "cekanje") return "Lista čekanja";
  if (status === "otkazano") return "Otkazano";
  return status || "Nije zabilježeno";
};

const defaultActivityAmount = (type: ReservationEventType) => {
  if (type === "rezervacija" || type === "cekanje") return -1;
  if (type === "povrat_dolaska") return 1;
  return undefined;
};

const refundReasonLabel = (reason?: string) => {
  if (reason === "admin_waitlist_expired") {
    return "Admin vratio dolazak jer je termin na listi čekanja prošao";
  }
  if (reason === "waitlist_expired") {
    return "Termin na listi čekanja je prošao";
  }
  if (reason === "session_deleted") {
    return "Termin je obrisan iz rasporeda";
  }
  if (reason === "visit_was_deducted") {
    return "Rezervacija je otkazana nakon oduzimanja dolaska";
  }
  if (reason === "not_deducted") {
    return "Dolazak nije bio prethodno oduzet";
  }
  return reason || "Nije zabilježeno";
};

const refundSourceLabel = (source?: string) => {
  if (source === "admin_return_visits_button") {
    return "Admin gumb \"Vrati dolaske\"";
  }
  return source || "Nije zabilježeno";
};

const ReservationDatabaseFields = ({
  reservation,
}: {
  reservation: UserReservation;
}) => (
  <div className="reservation-record-fields">
    <span>Status u bazi</span>
    <strong>{reservation.status || "Nije zabilježeno"}</strong>
    <span>Rezervacija kreirana</span>
    <span>{formatTimestamp(reservation.createdAt)}</span>
    <span>Dolazak oduzet</span>
    <span>
      {reservation.visitDeducted === undefined
        ? "Nije zabilježeno"
        : reservation.visitDeducted
        ? "DA"
        : "NE"}
    </span>
    <span>Vrijeme oduzimanja</span>
    <span>{formatTimestamp(reservation.visitDeductedAt)}</span>
    <span>Dolazak vraćen</span>
    <span>
      {reservation.refunded === undefined
        ? "Nije zabilježeno"
        : reservation.refunded
        ? "DA"
        : "NE"}
    </span>
    <span>Vrijeme povrata</span>
    <span>{formatTimestamp(reservation.refundedAt)}</span>
    <span>Vrijeme otkazivanja</span>
    <span>{formatTimestamp(reservation.cancelledAt)}</span>
    <span>Razlog povrata</span>
    <span>{refundReasonLabel(reservation.refundReason)}</span>
    <span>Obavijest poslana</span>
    <span>
      {reservation.notified === undefined
        ? "Nije zabilježeno"
        : reservation.notified
        ? "DA"
        : "NE"}
    </span>
    <span>Session ID</span>
    <span>{reservation.sessionId || "Nije zabilježeno"}</span>
  </div>
);

export default function UserManagement() {
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string;
    phone: string;
    pin: string | null;
  } | null>(null);
  const [successType, setSuccessType] = useState<
    "notifikacija" | "dolasci" | null
  >(null);

  const [remainingVisits, setRemainingVisits] = useState<number>(0);
  const [validUntil, setValidUntil] = useState<string>(""); // ISO string
  const [showConfirm, setShowConfirm] = useState(false);
  const [existingVisits, setExistingVisits] = useState<number>(0);
  const [additionalVisits, setAdditionalVisits] = useState<string>("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  const [newlyAddedName, setNewlyAddedName] = useState("");
  const [showReservationHistory, setShowReservationHistory] = useState(false);
  const [reservationHistory, setReservationHistory] = useState<ReservationActivity[]>([]);
  const [reservationRecords, setReservationRecords] = useState<UserReservation[]>([]);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  interface User {
    id: string;
    name: string;
    phone: string;
    pin: string | null;
    remainingVisits: number;
    validUntil: string;
  }

  const [users, setUsers] = useState<User[]>([]);

  const [newUserName, setNewUserName] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [userToDelete, setUserToDelete] = useState<{
    id: string;
    name: string;
    phone: string;
  } | null>(null);
  const [newNotification, setNewNotification] = useState("");
  const [visibleCount, setVisibleCount] = useState(8);

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleConfirmEntry = async () => {
    if (!selectedUser) return;

    const parsedVisits = Number(additionalVisits || "0");
    if (!Number.isFinite(parsedVisits) || !Number.isInteger(parsedVisits)) return;

    const userRef = doc(db, "users", selectedUser.id);
    const { totalVisits, appliedVisits } = await runTransaction(db, async (transaction) => {
      const userDataSnap = await transaction.get(userRef);
      const userData = userDataSnap.data();
      const currentVisits = Number(userData?.remainingVisits ?? existingVisits ?? 0);
      const newTotalVisits = Math.max(-1, currentVisits + parsedVisits);
      const actualChange = newTotalVisits - currentVisits;

      transaction.update(userRef, {
        remainingVisits: newTotalVisits,
        validUntil,
        visitHistory: appendReservationHistory(
          userData?.visitHistory,
          "admin_dolazak",
          {
            amount: actualChange,
            previousVisits: currentVisits,
            newVisits: newTotalVisits,
          }
        ),
      });

      return { totalVisits: newTotalVisits, appliedVisits: actualChange };
    });

    setExistingVisits(totalVisits);

    setSuccessMessage(
      `${appliedVisits >= 0 ? "Dodali" : "Oduzeli"} ste ${Math.abs(
        appliedVisits
      )} dolazaka za ${selectedUser.name}...\n`
    );

    setSuccessType("dolasci");
    setShowSuccess(true);
    setShowConfirm(false);
  };

  const docToUser = (doc: any): User => ({
    id: doc.id,
    name: doc.data().name,
    phone: doc.data().phone,
    pin: doc.data().pin ?? null,
    remainingVisits: doc.data().remainingVisits || 0,
    validUntil: doc.data().validUntil || "",
  });

  const fetchUsers = async () => {
    const q = query(collection(db, "users"), orderBy("name"));
    const snapshot = await getDocs(q);
    setUsers(snapshot.docs.map(docToUser));
  };

  const openReservationHistory = async () => {
    if (!selectedUser) return;

    setHistoryLoading(true);
    setHistoryError("");
    setShowReservationHistory(true);
    setExpandedActivityId(null);

    try {
      const [reservationsSnap, userSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "reservations"),
            where("phone", "==", selectedUser.phone)
          )
        ),
        getDoc(doc(db, "users", selectedUser.id)),
      ]);
      const userData = userSnap.data();

      const userReservations = reservationsSnap.docs.map((reservationDoc) => ({
        id: reservationDoc.id,
        ...reservationDoc.data(),
      })) as UserReservation[];
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);
      const isRecent = (value: unknown) => {
        const date = toDate(value);
        return date !== null && date >= cutoff;
      };
      const hasRecentActivity = (reservation: UserReservation) => {
        const historyDates = Array.isArray(reservation.history)
          ? reservation.history.map((entry) => {
              if (typeof entry !== "object" || entry === null) return null;
              return toDate((entry as Record<string, unknown>).createdAt);
            })
          : [];

        return [
          reservation.createdAt,
          reservation.visitDeductedAt,
          reservation.cancelledAt,
          reservation.refundedAt,
          ...historyDates,
        ].some(isRecent);
      };
      const recentReservations = userReservations.filter(hasRecentActivity);

      setReservationRecords(
        [...recentReservations].sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0)
        )
      );

      const documentActivities: ReservationActivity[] = recentReservations.flatMap(
        (reservation) => {
          if (!Array.isArray(reservation.history)) return [];

          return reservation.history
            .map((entry, index): ReservationActivity | null => {
              if (typeof entry !== "object" || entry === null) return null;
              const historyEntry = entry as Record<string, unknown>;
              if (!isReservationEventType(historyEntry.type)) return null;

              return {
                id: `${reservation.id}-history-${index}`,
                reservationId: reservation.id,
                type: historyEntry.type,
                date: reservation.date ?? "",
                time: reservation.time ?? "",
                createdAt: toDate(historyEntry.createdAt),
                amount:
                  typeof historyEntry.amount === "number"
                    ? historyEntry.amount
                    : defaultActivityAmount(historyEntry.type),
                previousVisits:
                  typeof historyEntry.previousVisits === "number"
                    ? historyEntry.previousVisits
                    : undefined,
                newVisits:
                  typeof historyEntry.newVisits === "number"
                    ? historyEntry.newVisits
                    : undefined,
                reason:
                  typeof historyEntry.reason === "string"
                    ? historyEntry.reason
                    : undefined,
                source:
                  typeof historyEntry.source === "string"
                    ? historyEntry.source
                    : undefined,
              };
            })
            .filter(
              (activity): activity is ReservationActivity => activity !== null
            );
        }
      );

      const adminActivities: ReservationActivity[] = Array.isArray(userData?.visitHistory)
        ? userData.visitHistory
            .map((entry: unknown, index: number): ReservationActivity | null => {
              if (typeof entry !== "object" || entry === null) return null;
              const historyEntry = entry as Record<string, unknown>;
              if (historyEntry.type !== "admin_dolazak") return null;

              return {
                id: `admin-history-${index}`,
                reservationId: `admin-${index}`,
                type: "admin_dolazak" as const,
                date: "",
                time: "",
                createdAt: toDate(historyEntry.createdAt),
                amount:
                  typeof historyEntry.amount === "number"
                    ? historyEntry.amount
                    : undefined,
                previousVisits:
                  typeof historyEntry.previousVisits === "number"
                    ? historyEntry.previousVisits
                    : undefined,
                newVisits:
                  typeof historyEntry.newVisits === "number"
                    ? historyEntry.newVisits
                    : undefined,
              };
            })
            .filter(
              (activity): activity is ReservationActivity => activity !== null
            )
        : [];

      // Za stare rezervacije, koje još nemaju audit događaje, izgradi najbolji
      // mogući pregled iz postojećih polja rezervacije.
      const reservationActivities = documentActivities;
      const recordedTypes = new Set(
        reservationActivities.map(
          (activity) => `${activity.reservationId}:${activity.type}`
        )
      );
      const legacyActivities: ReservationActivity[] = [];

      recentReservations.forEach((reservation) => {
        const baseType: ReservationEventType =
          reservation.status === "cekanje" ? "cekanje" : "rezervacija";
        const baseKey = `${reservation.id}:${baseType}`;

        if (!recordedTypes.has(baseKey)) {
          legacyActivities.push({
            id: `legacy-${baseKey}`,
            reservationId: reservation.id,
            type: baseType,
            date: reservation.date ?? "",
            time: reservation.time ?? "",
            createdAt: toDate(reservation.createdAt),
            amount: defaultActivityAmount(baseType),
          });
        }

        if (
          reservation.status === "otkazano" &&
          !recordedTypes.has(`${reservation.id}:otkazivanje`)
        ) {
          legacyActivities.push({
            id: `legacy-${reservation.id}-otkazivanje`,
            reservationId: reservation.id,
            type: "otkazivanje",
            date: reservation.date ?? "",
            time: reservation.time ?? "",
            createdAt: toDate(reservation.cancelledAt),
          });
        }

        if (
          reservation.refunded === true &&
          !recordedTypes.has(`${reservation.id}:povrat_dolaska`)
        ) {
          legacyActivities.push({
            id: `legacy-${reservation.id}-povrat_dolaska`,
            reservationId: reservation.id,
            type: "povrat_dolaska",
            date: reservation.date ?? "",
            time: reservation.time ?? "",
            createdAt: toDate(reservation.refundedAt) ?? toDate(reservation.cancelledAt),
            amount: 1,
          });
        }
      });

      const allRecordedActivities = [...documentActivities, ...adminActivities];
      const recentActivities = [...allRecordedActivities, ...legacyActivities].filter(
        (activity) =>
          activity.createdAt !== null &&
          activity.createdAt >= cutoff
      );

      setReservationHistory(
        recentActivities.sort((a, b) => {
          const aTime = a.createdAt?.getTime() ?? 0;
          const bTime = b.createdAt?.getTime() ?? 0;
          return bTime - aTime;
        })
      );
    } catch (error) {
      console.error("Greška pri dohvaćanju povijesti rezervacija:", error);
      setHistoryError("Povijest rezervacija trenutno nije moguće učitati.");
      setReservationHistory([]);
      setReservationRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserPhone.trim()) return;
    await addDoc(collection(db, "users"), {
      name: newUserName.trim(),
      fullName: newUserName.trim(),
      phone: normalizePhone(newUserPhone.trim()),
      active: true,
    });

    setNewlyAddedName(newUserName.trim());
    setShowAddSuccess(true);
    setNewUserName("");
    setNewUserPhone("");
    fetchUsers();
  };

  const confirmDeleteUser = (user: { id: string; name: string; phone: string }) => {
    setUserToDelete(user);
  };

  const handleDeleteUserConfirmed = async () => {
    if (!userToDelete) return;

    // Dohvati aktivne rezervacije korisnika
    const resSnap = await getDocs(
      query(
        collection(db, "reservations"),
        where("phone", "==", userToDelete.phone),
        where("status", "in", ["rezervirano", "cekanje"]),
      )
    );

    // Za svaku aktivnu rezervaciju: atomski otkaži, oslobodi slot, promiči čekaliste
    const promotedPhones: string[] = [];
    for (const resDoc of resSnap.docs) {
      const result = await cancelReservation(resDoc.id, { force: true });
      if (result.promotedPhone) {
        promotedPhones.push(result.promotedPhone);
      }
    }

    // Obriši korisnika
    await deleteDoc(doc(db, "users", userToDelete.id));

    // Pošalji WhatsApp svima koji su promaknuti s čekanja
    for (const phone of promotedPhones) {
      sendWhatsAppMessage(phone).catch(() => {});
    }

    setUserToDelete(null);
    fetchUsers();
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone.includes(searchTerm)
  );
  const visibleUsers = filteredUsers.slice(0, visibleCount);

  const handleNotify = async () => {
    const trimmed = newNotification.trim();
    if (!trimmed) return;

    // 1. Spremi u Firestore (opcionalno)
    await addDoc(collection(db, "announcements"), {
      text: trimmed,
      createdAt: new Date(),
    });

    // 2. Dohvati sve korisnike
    const usersSnap = await getDocs(collection(db, "users"));
    const users = usersSnap.docs.map((doc) => doc.data());

    // 3. Pošalji svakom korisniku poruku (automatski retry 2x)
    const failed: string[] = [];
    for (const user of users) {
      if (user.phone) {
        const ok = await sendWithRetry(user.phone, trimmed);
        if (!ok) failed.push(user.name || user.phone);
      }
    }

    const total = users.filter((u) => u.phone).length;
    const sent = total - failed.length;
    setSuccessMessage(
      failed.length === 0
        ? trimmed
        : `Poslano: ${sent}/${total}\nNeuspješno: ${failed.join(", ")}`
    );
    setSuccessType("notifikacija");
    setShowSuccess(true);
    setNewNotification("");
  };

  const formatDate = (isoDate: string): string => {
    if (!isoDate) return "";
    const [year, month, day] = isoDate.split("-");
    return `${day}.${month}.${year}.`;
  };

  return (
    <>
      <div className="user-management-container">
        <h2>Upravljanje korisnicima</h2>

        <div className="user-input-section">
          <input
            type="text"
            placeholder="Unesi ime korisnika"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            className="user-input"
          />
          <input
            type="tel"
            placeholder="Unesi broj telefona"
            value={newUserPhone}
            onChange={(e) => setNewUserPhone(e.target.value)}
            className="user-input"
          />
          <button onClick={handleAddUser} className="add-user-button">
            Dodaj
          </button>
        </div>

        <div className="search-section">
          <input
            type="text"
            placeholder="Pretraži korisnika..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setVisibleCount(8); }}
            className="user-input"
          />
        </div>

        <div className="user-list">
          {visibleUsers.map((user) => (
            <div key={user.id} className="user-card">
              <div>
                <div className="user-name">{user.name}</div>
                <div className="user-phone">{user.phone}</div>
              </div>
              <div className="user-buttons">
                <button
                  onClick={() => confirmDeleteUser(user)}
                  className="delete-user-button"
                >
                  Obriši
                </button>
                <button
                  onClick={async () => {
                    const userRef = doc(db, "users", user.id);
                    const userSnap = await getDoc(userRef);
                    const data = userSnap.data();

                    setSelectedUser({ id: user.id, name: user.name, phone: user.phone, pin: data?.pin ?? null });
                    setAdditionalVisits("");
                    setValidUntil(data?.validUntil || "");
                    setExistingVisits(data?.remainingVisits ?? 0);
                  }}
                  className="details-button"
                >
                  Detalji
                </button>
              </div>
            </div>
          ))}
        </div>

        {visibleCount < filteredUsers.length && (
          <button
            className="load-more-button"
            onClick={() => setVisibleCount((c) => c + 8)}
          >
            Učitaj više
          </button>
        )}

        {userToDelete && (
          <div className="confirm-overlay">
            <div className="confirm-modal">
              <p>
                Jesi li sigurna da želiš obrisati{" "}
                <strong>{userToDelete.name}</strong>?
              </p>
              <div className="confirm-buttons">
                <button
                  onClick={handleDeleteUserConfirmed}
                  className="confirm-yes"
                >
                  Da
                </button>
                <button
                  onClick={() => setUserToDelete(null)}
                  className="confirm-no"
                >
                  Ne
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="notifications-container">
        <h3>Obavijesti</h3>
        <div className="notifications-input">
          <input
            type="text"
            placeholder="Unesi obavijest..."
            value={newNotification}
            onChange={(e) => setNewNotification(e.target.value)}
            maxLength={1024}
            className="notification-input"
          />
          <div style={{ fontSize: "0.75rem", color: newNotification.length > 900 ? "#c0392b" : "#888", textAlign: "right" }}>
            {newNotification.length}/1024
          </div>
          <button className="notify-button" onClick={handleNotify}>
            Pošalji
          </button>
        </div>
      </div>

      {selectedUser && (
        <div className="modal-overlay">
          <div className="modal details-modal">
            <button
              className="details-modal-close"
              onClick={() => setSelectedUser(null)}
              aria-label="Zatvori detalje korisnika"
              title="Zatvori"
            >
              ×
            </button>
            <h3>{selectedUser.name}</h3>

            <div className="details-info-section">
              <div className="details-info-row">
                <span className="details-info-label">Preostali dolasci</span>
                <span className="details-info-value">{existingVisits}</span>
              </div>
              {validUntil && (
                <div className="details-info-row">
                  <span className="details-info-label">Vrijede do</span>
                  <span className="details-info-value">{formatDate(validUntil)}</span>
                </div>
              )}
              <div className="details-info-row">
                <span className="details-info-label">PIN</span>
                <span className="details-info-value">{selectedUser.pin ? "Postavljeno" : "Nije postavljeno"}</span>
              </div>
            </div>

            <button
              className="reservation-history-button"
              onClick={openReservationHistory}
            >
              Rezervacije
            </button>

            <div className="details-edit-section">
              <label>Dodaj dolaske:</label>
              <input
                type="number"
                value={additionalVisits}
                onChange={(e) => setAdditionalVisits(e.target.value)}
                step="1"
              />

              <label>Novi datum valjanosti:</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>

            <div className="modal-buttons">
              <button onClick={() => setShowConfirm(true)}>Dodaj</button>
              <button onClick={() => setSelectedUser(null)}>Odustani</button>
            </div>
          </div>
        </div>
      )}

      {showReservationHistory && selectedUser && (
        <div className="modal-overlay reservation-history-overlay">
          <div className="modal details-modal reservation-history-modal">
            <button
              className="reservation-history-close"
              onClick={() => setShowReservationHistory(false)}
              aria-label="Zatvori povijest rezervacija"
              title="Zatvori"
            >
              ×
            </button>
            <h3>Rezervacije: {selectedUser.name}</h3>
            <p className="reservation-history-period">Prikaz aktivnosti iz zadnja 3 mjeseca</p>

            {historyLoading && <p className="reservation-history-empty">Učitavanje...</p>}
            {!historyLoading && historyError && (
              <p className="reservation-history-empty">{historyError}</p>
            )}
            {!historyLoading &&
              !historyError &&
              reservationRecords.length === 0 &&
              reservationHistory.length === 0 && (
              <p className="reservation-history-empty">Nema zabilježenih aktivnosti.</p>
            )}
            {!historyLoading && !historyError && reservationRecords.length > 0 && (
              <div
                className={`reservation-records ${
                  reservationHistory.length > 0 ? "reservation-records-collapsed" : ""
                }`}
              >
                {reservationRecords.map((reservation) => (
                  <div key={reservation.id} className="reservation-record">
                    <div className="reservation-record-header">
                      <div>
                        <strong>
                          {reservation.date || "Nepoznat datum"} {reservation.time || ""}
                        </strong>
                        <small>ID: {reservation.id}</small>
                      </div>
                      <span className={`reservation-status ${reservation.status || "unknown"}`}>
                        {reservationStatusLabel(reservation.status)}
                      </span>
                    </div>

                    <div className="reservation-record-fields">
                      <span>Status u bazi</span>
                      <strong>{reservation.status || "Nije zabilježeno"}</strong>
                      <span>Rezervacija kreirana</span>
                      <span>{formatTimestamp(reservation.createdAt)}</span>
                      <span>Dolazak oduzet</span>
                      <span>
                        {reservation.visitDeducted === undefined
                          ? "Nije zabilježeno"
                          : reservation.visitDeducted
                          ? "DA"
                          : "NE"}
                      </span>
                      <span>Vrijeme oduzimanja</span>
                      <span>{formatTimestamp(reservation.visitDeductedAt)}</span>
                      <span>Dolazak vraćen</span>
                      <span>
                        {reservation.refunded === undefined
                          ? "Nije zabilježeno"
                          : reservation.refunded
                          ? "DA"
                          : "NE"}
                      </span>
                      <span>Vrijeme povrata</span>
                      <span>{formatTimestamp(reservation.refundedAt)}</span>
                      <span>Vrijeme otkazivanja</span>
                      <span>{formatTimestamp(reservation.cancelledAt)}</span>
                      <span>Razlog povrata</span>
                      <span>{reservation.refundReason || "Nije zabilježeno"}</span>
                      <span>Obavijest poslana</span>
                      <span>
                        {reservation.notified === undefined
                          ? "Nije zabilježeno"
                          : reservation.notified
                          ? "DA"
                          : "NE"}
                      </span>
                      <span>Session ID</span>
                      <span>{reservation.sessionId || "Nije zabilježeno"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!historyLoading && !historyError && reservationHistory.length > 0 && (
              <div className="reservation-history-list">
                {reservationHistory.map((activity) => {
                  const reservation = reservationRecords.find(
                    (record) => record.id === activity.reservationId
                  );
                  const isExpanded = expandedActivityId === activity.id;

                  return (
                  <div
                    key={activity.id}
                    className={`reservation-history-item ${isExpanded ? "expanded" : ""}`}
                    onClick={() =>
                      setExpandedActivityId(isExpanded ? null : activity.id)
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedActivityId(isExpanded ? null : activity.id);
                      }
                    }}
                  >
                    <div className={`reservation-history-dot ${activity.type}`} />
                    <div className="reservation-history-content">
                      <strong>
                        {activity.type === "admin_dolazak"
                          ? `Admin ${
                              activity.amount === undefined
                                ? "promijenio"
                                : activity.amount >= 0
                                ? "dodao"
                                : "oduzeo"
                            } dolaske`
                          : activityLabel[activity.type]}
                        {activity.amount !== undefined
                          ? ` (${activity.amount > 0 ? "+" : ""}${activity.amount})`
                          : ""}
                      </strong>
                      <span>
                        {activity.type === "admin_dolazak"
                          ? "Promjena dolazaka"
                          : `${activity.date} ${activity.time}`}
                      </span>
                      <small>
                        {activity.createdAt
                          ? activity.createdAt.toLocaleString("hr-HR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Vrijeme nije zabilježeno"}
                      </small>
                    </div>
                    <span className="reservation-history-toggle">
                      {isExpanded ? "−" : "+"}
                    </span>
                    {isExpanded && reservation && (
                      <div
                        className="reservation-history-database"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="reservation-record">
                          <div className="reservation-record-header">
                            <div>
                              <strong>
                                {reservation.date || "Nepoznat datum"}{" "}
                                {reservation.time || ""}
                              </strong>
                              <small>ID: {reservation.id}</small>
                            </div>
                            <span
                              className={`reservation-status ${
                                reservation.status || "unknown"
                              }`}
                            >
                              {reservationStatusLabel(reservation.status)}
                            </span>
                          </div>
                          <ReservationDatabaseFields reservation={reservation} />
                          {activity.type === "povrat_dolaska" && (
                            <div className="reservation-record-fields">
                              <span>Ovaj povrat</span>
                              <strong>(+1)</strong>
                              <span>Razlog ovog povrata</span>
                              <span>
                                {refundReasonLabel(
                                  activity.reason || reservation.refundReason
                                )}
                              </span>
                              <span>Način povrata</span>
                              <span>{refundSourceLabel(activity.source)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {isExpanded && !reservation && activity.type === "admin_dolazak" && (
                      <div
                        className="reservation-history-database"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="reservation-record">
                          <div className="reservation-record-fields">
                            <span>Promjena dolazaka</span>
                            <strong>
                              {activity.amount !== undefined
                                ? `(${activity.amount > 0 ? "+" : ""}${activity.amount})`
                                : "Nije zabilježeno"}
                            </strong>
                            <span>Prethodno stanje</span>
                            <span>
                              {activity.previousVisits ?? "Nije zabilježeno"}
                            </span>
                            <span>Novo stanje</span>
                            <span>{activity.newVisits ?? "Nije zabilježeno"}</span>
                            <span>Vrijeme promjene</span>
                            <span>{formatTimestamp(activity.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>
            )}

            <div className="modal-buttons">
              <button onClick={() => setShowReservationHistory(false)}>Zatvori</button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <p>
              Jesi li sigurna da želiš primijeniti promjenu od{" "}
              {additionalVisits} na broj dolazaka za{" "}
              <strong>{selectedUser?.name}</strong>?
            </p>

            <div className="confirm-buttons">
              <button onClick={handleConfirmEntry} className="confirm-yes">
                Da
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="confirm-no"
              >
                Ne
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            {successType === "notifikacija" ? (
              <p style={{ whiteSpace: "pre-line" }}>
                {successMessage.startsWith("Poslano:")
                  ? `⚠️ ${successMessage}`
                  : `✅ Obavijest je poslana svim korisnicima.`}
              </p>
            ) : (
              <p>✅ {successMessage}</p>
            )}

            <div className="confirm-buttons">
              <button
                onClick={() => {
                  setShowSuccess(false);
                  setSelectedUser(null);
                  setAdditionalVisits("0");
                  setExistingVisits(0);
                  setValidUntil("");
                  fetchUsers();
                }}
                className="confirm-yes"
              >
                U redu
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddSuccess && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <p>
              Dodali ste korisnika:<br></br> <strong>{newlyAddedName}</strong>
            </p>
            <div className="confirm-buttons">
              <button
                onClick={() => setShowAddSuccess(false)}
                className="confirm-yes"
              >
                U redu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
