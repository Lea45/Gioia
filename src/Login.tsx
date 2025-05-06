import { useState } from "react";
import { db } from "./firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import "./login.css";

type LoginProps = {
  onLoginSuccess: () => void;
  onBackToHome: () => void;
};


export default function Login({ onLoginSuccess, onBackToHome }: LoginProps) {

  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");

  const handleLogin = async () => {
    if (!phone.trim()) {
      setStatus("⛔ Unesite broj telefona.");
      return;
    }

    try {
      const q = query(
        collection(db, "users"),
        where("phone", "==", phone),
        where("active", "==", true)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();

        localStorage.setItem("phone", phone);
        localStorage.setItem("userId", userDoc.id);
        localStorage.setItem("userName", userData.name); // <-- SPREMI I IME!!

        setStatus("✅ Dobrodošao/la!");
        onLoginSuccess();
      } else {
        setStatus("⛔ Nemaš pristup. Obrati se trenerici.");
      }
    } catch (error) {
      console.error("Greška pri prijavi:", error);
      setStatus("⛔ Greška pri prijavi. Pokušajte ponovno.");
    }
  };

  return (
    <div className="login-container">
      <input
        type="text"
        placeholder="Unesi broj telefona"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="login-input"
      />
      <button onClick={handleLogin} className="login-button">
        Prijavi se
      </button>
      <button
        onClick={onBackToHome}
        className="login-back-button"
      >
         Natrag na početnu
      </button>

      {status && (
        <p
          className={`${
            status.startsWith("✅") ? "status-success" : "status-error"
          }`}
        >
          {status}
        </p>
      )}
    </div>
  );
}
