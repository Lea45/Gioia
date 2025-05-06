import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase"; // koristiš svoj postojeći firebase.ts
import "./login.css";

type AdminLoginProps = {
  onAdminLoginSuccess: () => void;
  onBackToHome: () => void;
};

export default function AdminLogin({
  onAdminLoginSuccess,
  onBackToHome,
}: AdminLoginProps) {
  const [codeInput, setCodeInput] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAdminCode = async () => {
      try {
        const docRef = doc(db, "adminLogin", "adminCode");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setAdminCode(docSnap.data().code);
        } else {
          console.error("Nema admin koda u bazi!");
        }
      } catch (error) {
        console.error("Greška kod dohvaćanja admin koda:", error);
      }
    };

    fetchAdminCode();
  }, []);

  const handleLogin = () => {
    setLoading(true);
    setStatus("");

    setTimeout(() => {
      if (codeInput === adminCode) {
        setStatus("✅ Uspješna prijava");
        localStorage.setItem("admin", "true");
        onAdminLoginSuccess();
      } else {
        setStatus("⛔ Pogrešan kod");
      }
      setLoading(false);
    }, 500);
  };

  return (
    <div className="login-container">
      <input
        type="password" // 👈 maskirano unos
        placeholder="Unesi admin kod"
        value={codeInput}
        onChange={(e) => {
          setCodeInput(e.target.value);
          setStatus("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleLogin();
        }}
        className="login-input"
      />
      <button onClick={handleLogin} className="login-button" disabled={loading}>
        {loading ? "Prijava..." : "Prijavi se"}
      </button>
      <button onClick={onBackToHome} className="login-back-button">
         Natrag na početnu
      </button>

      {status && (
        <p
          className={
            status.startsWith("✅") ? "status-success" : "status-error"
          }
        >
          {status}
        </p>
      )}
    </div>
  );
}
