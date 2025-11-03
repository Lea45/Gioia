import { useState, useEffect } from "react";
import { db } from "./firebase";
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
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import "./UserManagement.css";

const sendAdminNoticeToPhone = async (phone: string, message: string) => {
  const normalized = phone.replace(/^\+/, "").replace(/^0/, "385");

  await fetch("https://z3g8qx.api.infobip.com/whatsapp/1/message/template", {
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
          messageId: "admin-" + Date.now(),
          content: {
            templateName: "admin_notice",
            templateData: {
              body: {
                placeholders: [message],
              },
            },
            language: "hr",
          },
        },
      ],
    }),
  });
};

export default function UserManagement() {
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string;
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

  interface User {
    id: string;
    name: string;
    phone: string;
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
  } | null>(null);
  const [newNotification, setNewNotification] = useState("");
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(
    null
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 5;

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleConfirmEntry = async () => {
    if (!selectedUser) return;

    const parsedVisits = Number(additionalVisits || "0");
    // Dopuštamo minimalno -2
    const totalVisits = Math.max(-2, existingVisits + parsedVisits);

    const userRef = doc(db, "users", selectedUser.id);
    await updateDoc(userRef, {
      remainingVisits: totalVisits,
      validUntil,
    });

    setSuccessMessage(
      `${parsedVisits >= 0 ? "Dodali" : "Oduzeli"} ste ${Math.abs(
        parsedVisits
      )} dolazaka za ${selectedUser.name}...\n`
    );

    setSuccessType("dolasci");
    setShowSuccess(true);
    setShowConfirm(false);
  };

  interface User {
    id: string;
    name: string;
    phone: string;
    remainingVisits: number;
    validUntil: string;
  }

  const docToUser = (doc: any): User => ({
    id: doc.id,
    name: doc.data().name,
    phone: doc.data().phone,
    remainingVisits: doc.data().remainingVisits || 0,
    validUntil: doc.data().validUntil || "",
  });

  const fetchUsers = async () => {
    const q = query(collection(db, "users"), orderBy("name"), limit(PAGE_SIZE));
    const snapshot = await getDocs(q);
    setUsers(snapshot.docs.map(docToUser));
    setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    setHasMore(snapshot.docs.length === PAGE_SIZE);
  };

  const fetchMoreUsers = async () => {
    if (!lastVisible) return;
    setLoadingMore(true);
    const q = query(
      collection(db, "users"),
      orderBy("name"),
      startAfter(lastVisible),
      limit(PAGE_SIZE)
    );
    const snapshot = await getDocs(q);
    setUsers((prev) => [...prev, ...snapshot.docs.map(docToUser)]);
    setLastVisible(snapshot.docs[snapshot.docs.length - 1]);
    setHasMore(snapshot.docs.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const searchUsers = async (term: string) => {
    const q = query(collection(db, "users"), orderBy("name"));
    const snapshot = await getDocs(q);
    const allUsers = snapshot.docs.map(docToUser);

    const filtered = allUsers.filter(
      (user) =>
        user.name.toLowerCase().includes(term.toLowerCase()) ||
        user.phone.includes(term)
    );

    setUsers(filtered);
    setHasMore(false);
  };

  useEffect(() => {
    if (searchTerm.trim()) {
      searchUsers(searchTerm);
    } else {
      fetchUsers();
    }
  }, [searchTerm]);

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserPhone.trim()) return;
    await addDoc(collection(db, "users"), {
      name: newUserName.trim(),
      fullName: newUserName.trim(),
      phone: newUserPhone.trim(),
      active: true,
    });

    setNewlyAddedName(newUserName.trim());
    setShowAddSuccess(true);
    setNewUserName("");
    setNewUserPhone("");
    fetchUsers();
  };

  const confirmDeleteUser = (user: { id: string; name: string }) => {
    setUserToDelete(user);
  };

  const handleDeleteUserConfirmed = async () => {
    if (!userToDelete) return;
    await deleteDoc(doc(db, "users", userToDelete.id));
    setUserToDelete(null);
    fetchUsers();
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone.includes(searchTerm)
  );

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

    // 3. Pošalji svakom korisniku poruku
    for (const user of users) {
      if (user.phone) {
        await sendAdminNoticeToPhone(user.phone, trimmed);
      }
    }

    setSuccessMessage(trimmed);
    setSuccessType("notifikacija"); // <- DODANO OVDJE
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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="user-input"
          />
        </div>

        <div className="user-list">
          {filteredUsers.map((user) => (
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

                    setSelectedUser(user);
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

        {hasMore && (
          <button
            onClick={fetchMoreUsers}
            className="load-more-button"
            disabled={loadingMore}
          >
            {loadingMore ? "Učitavam..." : "Učitaj više"}
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
            className="notification-input"
          />
          <button className="notify-button" onClick={handleNotify}>
            Pošalji
          </button>
        </div>
      </div>

      {selectedUser && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{selectedUser.name}</h3>

            <p>
              Preostali dolasci: <strong>{existingVisits}</strong>
            </p>
            {validUntil && (
              <p>
                Vrijede do: <strong>{formatDate(validUntil)}</strong>
              </p>
            )}

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

            <div className="modal-buttons">
              <button onClick={() => setShowConfirm(true)}>Dodaj</button>
              <button onClick={() => setSelectedUser(null)}>Odustani</button>
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
              <p>
                ✅ Obavijest je poslana korisnicima:
                <br />"{successMessage}"
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
