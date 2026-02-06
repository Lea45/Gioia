import { useState } from "react";
import { db } from "./firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import "./login.css";

type LoginProps = {
  onLoginSuccess: () => void;
  onBackToHome: () => void;
};

// Normalizira broj telefona u međunarodni format (38591...)
// Podržava: 091..., 0911..., +38591..., 38591...
const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/\s+/g, "").replace(/^\+/, "");

  // Ako počinje s 0, zamijeni s 385
  if (cleaned.startsWith("0")) {
    cleaned = "385" + cleaned.slice(1);
  }

  return cleaned;
};

export default function Login({ onLoginSuccess, onBackToHome }: LoginProps) {
  const [loginMethod, setLoginMethod] = useState<"pin" | "phone">("pin");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState("");

  const handlePhoneLogin = async () => {
    if (!phone.trim()) {
      setStatus("⛔ Unesite broj telefona.");
      return;
    }

    const normalizedPhone = normalizePhone(phone);

    try {
      const q = query(
        collection(db, "users"),
        where("phone", "==", normalizedPhone),
        where("active", "==", true)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();

        localStorage.setItem("phone", normalizedPhone);
        localStorage.setItem("userId", userDoc.id);
        localStorage.setItem("userName", userData.name);

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

  const handlePinLogin = async () => {
    if (pin.length !== 4) return;

    try {
      const q = query(
        collection(db, "users"),
        where("pin", "==", pin),
        where("active", "==", true)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const userDoc = snap.docs[0];
        const userData = userDoc.data();

        localStorage.setItem("phone", userData.phone);
        localStorage.setItem("userId", userDoc.id);
        localStorage.setItem("userName", userData.name);

        setStatus("✅ Dobrodošao/la!");
        onLoginSuccess();
      } else {
        setStatus("⛔ Neispravan PIN.");
      }
    } catch (error) {
      console.error("Greška pri prijavi:", error);
      setStatus("⛔ Greška pri prijavi. Pokušajte ponovno.");
    }
  };

  return (
    <div className="login-container">
      <div className="login-method-tabs">
        <button
          className={`login-method-tab ${loginMethod === "pin" ? "active" : ""}`}
          onClick={() => { setLoginMethod("pin"); setStatus(""); }}
        >
          🔢 PIN
        </button>
        <button
          className={`login-method-tab ${loginMethod === "phone" ? "active" : ""}`}
          onClick={() => { setLoginMethod("phone"); setStatus(""); }}
        >
          📱 Broj telefona
        </button>
      </div>

      {loginMethod === "pin" ? (
        <>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Unesi PIN"
            maxLength={4}
            pattern="[0-9]{4}"
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setPin(val);
              setStatus("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin.length === 4) handlePinLogin();
            }}
            className="login-input pin-input"
          />
          <button
            onClick={handlePinLogin}
            className="login-button"
            disabled={pin.length !== 4}
          >
            Prijavi se
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="Unesi broj telefona (npr. 091...)"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setStatus(""); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePhoneLogin();
            }}
            className="login-input"
          />
          <button onClick={handlePhoneLogin} className="login-button">
            Prijavi se
          </button>
        </>
      )}

      <button onClick={onBackToHome} className="login-back-button">
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
