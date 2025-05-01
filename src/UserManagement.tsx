import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc } from 'firebase/firestore';
import './UserManagement.css';

export default function UserManagement() {
  const [users, setUsers] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const querySnapshot = await getDocs(collection(db, 'users'));
    const usersList = querySnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      phone: doc.data().phone
    }));
    setUsers(usersList);
  };

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserPhone.trim()) return;
    await addDoc(collection(db, 'users'), {
      name: newUserName.trim(),
      fullName: newUserName.trim(), // <-- DODAJ I fullName!
      phone: newUserPhone.trim(),
      active: true
    });
    
    setNewUserName('');
    setNewUserPhone('');
    fetchUsers();
  };

  const confirmDeleteUser = (user: { id: string; name: string }) => {
    setUserToDelete(user);
  };

  const handleDeleteUserConfirmed = async () => {
    if (!userToDelete) return;
    await deleteDoc(doc(db, 'users', userToDelete.id));
    setUserToDelete(null);
    fetchUsers();
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone.includes(searchTerm)
  );

  return (
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
        <button onClick={handleAddUser} className="add-user-button">Dodaj</button>
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
            <button onClick={() => confirmDeleteUser(user)} className="delete-user-button">Obriši</button>
          </div>
        ))}
      </div>

      {userToDelete && (
        <div className="confirm-overlay">
          <div className="confirm-modal">
            <p>Jesi li sigurna da želiš obrisati <strong>{userToDelete.name}</strong>?</p>
            <div className="confirm-buttons">
              <button onClick={handleDeleteUserConfirmed} className="confirm-yes">Da</button>
              <button onClick={() => setUserToDelete(null)} className="confirm-no">Ne</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
