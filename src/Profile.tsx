import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  FaPhone,
  FaUser,
  FaEdit,
  FaSignOutAlt,
  FaCheckCircle,
  FaClock,
  FaFolderOpen,
} from "react-icons/fa";
import "./Profile.css";

export default function Profile() {
  const storedPhone = localStorage.getItem("phone");
  const [phone, setPhone] = useState(storedPhone || "");
  const [name, setName] = useState("");
  const [docId, setDocId] = useState("");

  useEffect(() => {
    const fetchUser = async () => {
      if (!phone) return;

      const q = query(collection(db, "users"), where("phone", "==", phone));
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();
        setName(userData.name || "");
        setDocId(userDoc.id);
      }
    };

    fetchUser();
  }, [phone]);

  const handleLogout = () => {
    localStorage.removeItem("phone");
    window.location.reload();
  };

  return (
    <div className="profile">
      <div className="profile-header">
        <h2 className="profile-title">Moj profil</h2>
      </div>

      <div className="profile-card">
        <label className="profile-label">
          <FaUser style={{ marginRight: "8px" }} />
          Ime i prezime:
        </label>
        <div>{name || "—"}</div>
      </div>

      <div className="profile-card">
        <label className="profile-label">
          <FaPhone style={{ marginRight: "8px" }} />
          Broj mobitela:
        </label>
        <div>{phone}</div>
      </div>

      <div className="profile-buttons-row">
        <button onClick={handleLogout} className="profile-logout-button">
          <FaSignOutAlt style={{ marginRight: "6px" }} />
          Odjava
        </button>
      </div>

      {/* Prošli termini */}
      {(() => {
        const raw = localStorage.getItem("pastBookings");
        const past = raw
          ? (JSON.parse(raw) as {
              date: string;
              time: string;
              status: string;
            }[])
          : [];

        return past.length > 0 ? (
          <div className="profile-past-section">
            <h3 className="profile-past-title">
              <FaFolderOpen className="profile-status-icon2" /> Prošli termini
            </h3>{" "}
            <div className="profile-past-list">
              {past.map((b, index) => (
                <div key={index} className="profile-card">
                  <div>
                    <strong>{b.date}</strong>
                  </div>
                  <div>{b.time}</div>
                  <div className="profile-past-status">
                    {b.status === "rezervirano" ? (
                      <>
                        <FaCheckCircle className="profile-status-icon" />{" "}
                        Prisustvovali
                      </>
                    ) : (
                      <>
                        <FaClock className="profile-status-icon" /> Čekanje
                      </>
                    )}
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
