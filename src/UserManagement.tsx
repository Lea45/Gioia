import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import "./UserManagement.css";

export default function UserManagement() {
  const [users, setUsers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [newUserName, setNewUserName] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);
  const [newNotification, setNewNotification] = useState("");
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 5;

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const q = query(collection(db, "users"), orderBy("name"), limit(PAGE_SIZE));
    const querySnapshot = await getDocs(q);
    const usersList = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      phone: doc.data().phone,
    }));
    setUsers(usersList);
    setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
    setHasMore(querySnapshot.docs.length === PAGE_SIZE);
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
    const querySnapshot = await getDocs(q);
    const newUsers = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      phone: doc.data().phone,
    }));
    setUsers((prev) => [...prev, ...newUsers]);
    setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
    setHasMore(querySnapshot.docs.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserPhone.trim()) return;
    await addDoc(collection(db, "users"), {
      name: newUserName.trim(),
      fullName: newUserName.trim(),
      phone: newUserPhone.trim(),
      active: true,
    });
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

  const handleNotify = () => {
    if (!newNotification.trim()) return;
    alert(`Obavijest: ${newNotification.trim()}`);
    setNewNotification("");
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
              <button
                onClick={() => confirmDeleteUser(user)}
                className="delete-user-button"
              >
                Obriši
              </button>
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
                Jesi li sigurna da želiš obrisati <strong>{userToDelete.name}</strong>?
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
            Obavijesti
          </button>
        </div>
      </div>
    </>
  );
}
