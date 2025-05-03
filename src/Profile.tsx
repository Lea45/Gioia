import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { FaPhone, FaUser, FaEdit, FaSignOutAlt } from 'react-icons/fa';

export default function Profile() {
  const storedPhone = localStorage.getItem('phone');
  const [phone, setPhone] = useState(storedPhone || '');
  const [name, setName] = useState('');
  const [docId, setDocId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      if (!phone) return;

      const q = query(collection(db, 'users'), where('phone', '==', phone));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        setName(userData.name || '');
        setDocId(userDoc.id);
      }
    };

    fetchUser();
  }, [phone]);

  const handleNameChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);

    if (docId) {
      const userRef = doc(db, 'users', docId);
      await updateDoc(userRef, { name: newName });
      setMessage('✅ Podaci su spremljeni');
    }
  };

  const handlePhoneChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPhone = e.target.value;
    setPhone(newPhone);
    localStorage.setItem('phone', newPhone);

    if (docId) {
      const userRef = doc(db, 'users', docId);
      await updateDoc(userRef, { phone: newPhone });
      setMessage('✅ Podaci su spremljeni');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('phone');
    window.location.reload();
  };

  return (
    <div style={profileStyle}>
      <div style={{ textAlign: 'center' }}>
        <h2
          style={{
            backgroundColor: '#ECE5D1',
            display: 'inline-block',
            borderRadius: '12px',
            color: 'black',
            fontWeight: 700,
            padding: '8px 16px',
            marginBottom: '32px'
          }}
        >
          Moj profil
        </h2>
      </div>

      <div style={cardStyle}>
        <label style={labelStyle}>
          <FaPhone style={{ marginRight: '8px' }} />
          Broj mobitela:
        </label>
        {isEditing ? (
          <input
            type="text"
            value={phone}
            onChange={handlePhoneChange}
            style={inputStyle}
            placeholder="Unesi broj mobitela"
          />
        ) : (
          <div>{phone}</div>
        )}
      </div>

      <div style={cardStyle}>
        <label style={labelStyle}>
          <FaUser style={{ marginRight: '8px' }} />
          Ime i prezime:
        </label>
        {isEditing ? (
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            style={inputStyle}
            placeholder="Unesi ime i prezime"
          />
        ) : (
          <div>{name || '—'}</div>
        )}
      </div>

      <button onClick={() => setIsEditing((prev) => !prev)} style={editButtonStyle}>
        <FaEdit style={{ marginRight: '6px' }} />
        {isEditing ? 'Završi uređivanje' : 'Promijeni podatke'}
      </button>

      {message && <div style={messageStyle}>{message}</div>}

      <button onClick={handleLogout} style={logoutButtonStyle}>
        <FaSignOutAlt style={{ marginRight: '6px' }} />Odjavi se
      </button>

      {/* Prošli termini */}
{(() => {
  const raw = localStorage.getItem("pastBookings");
  const past = raw ? (JSON.parse(raw) as { date: string; time: string; status: string }[]) : [];

  return past.length > 0 ? (
    <div style={{ marginTop: "32px" }}>
      <h3 style={{ marginBottom: "12px", textAlign: "center" }}>📁 Prošli termini</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {past.map((b, index) => (
          <div key={index} style={cardStyle}>
            <div><strong>{b.date}</strong></div>
            <div>{b.time}</div>
            <div style={{ fontSize: "0.9rem", color: "#555" }}>
              {b.status === "rezervirano" ? "✅ Prisustvovali" : "🕐 Čekanje"}
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;
})()}

    </div>
  );
}

const profileStyle = {
  padding: '20px',
  maxWidth: '400px',
  margin: '0 auto',
};

const cardStyle = {
  backgroundColor: '#F3EEE1',
  padding: '12px 16px',
  borderRadius: '12px',
  border: '1px solid #ddd',
  marginBottom: '16px',
};

const labelStyle = {
  display: 'flex',
  alignItems: 'center',
  fontWeight: 'bold',
  marginBottom: '6px',
};

const inputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #ccc',
  fontSize: '1rem',
};

const editButtonStyle = {
  padding: '10px 16px',
  backgroundColor: '#838A78',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 'bold',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  marginBottom: '12px',
  transition: 'background-color 0.3s',
};

const logoutButtonStyle = {
  padding: '10px 16px',
  backgroundColor: '#e74c3c',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 'bold',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  transition: 'background-color 0.3s',
};

const messageStyle = {
  color: 'green',
  fontSize: '0.9rem',
  marginBottom: '10px',
};
