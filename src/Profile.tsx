import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  runTransaction,
  writeBatch,
  onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

import {
  FaPhone,
  FaUser,
  FaSignOutAlt,
  FaLock,
  FaEye,
  FaEyeSlash,
} from "react-icons/fa";
import "./Profile.css";

export default function Profile() {
  const userId = localStorage.getItem("userId") || "";
  const [phone, setPhone] = useState(localStorage.getItem("phone") || "");
  const [name, setName] = useState("");
  const [docId, setDocId] = useState(userId);
  const [remainingVisits, setRemainingVisits] = useState<number | null>(null);
  const [validUntil, setValidUntil] = useState("");

  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pinStatus, setPinStatus] = useState("");

  useEffect(() => {
    if (!userId) return;

    const userRef = doc(db, "users", userId);
    const unsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const userData = snap.data();
        setName(userData.name || "");
        setDocId(snap.id);
        setRemainingVisits(userData.remainingVisits ?? null);
        setValidUntil(userData.validUntil ?? "");
        setCurrentPin(userData.pin ?? null);

        // Sinkroniziraj telefon s bazom i localStorage
        if (userData.phone && userData.phone !== localStorage.getItem("phone")) {
          setPhone(userData.phone);
          localStorage.setItem("phone", userData.phone);
        }
      }
    });

    return () => unsubscribe();
  }, [userId]);

  const handleLogout = () => {
    localStorage.removeItem("phone");
    window.location.reload();
  };

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}.`;
  };

  const handleSavePin = async () => {
    if (!/^[0-9]{4}$/.test(pinInput)) {
      setPinStatus("⛔ PIN mora imati točno 4 broja.");
      return;
    }
    if (pinInput === currentPin) {
      setPinStatus("⛔ PIN je isti kao trenutni.");
      return;
    }

    // Brza provjera — hvata stare PINove koji nisu još u pins kolekciji
    const uniqueQ = query(collection(db, "users"), where("pin", "==", pinInput));
    const uniqueSnap = await getDocs(uniqueQ);
    if (uniqueSnap.docs.some((d) => d.id !== docId)) {
      setPinStatus("⛔ Taj PIN je već zauzet. Odaberite drugi.");
      return;
    }

    // Atomska rezervacija PINa — sprječava race condition
    // pins/{pin} dokument osigurava da dva korisnika ne mogu dobiti isti PIN
    const pinDocRef = doc(db, "pins", pinInput);
    const oldPinDocRef = currentPin ? doc(db, "pins", currentPin) : null;
    const userDocRef = doc(db, "users", docId);

    try {
      await runTransaction(db, async (t) => {
        const pinSnap = await t.get(pinDocRef);
        if (pinSnap.exists() && pinSnap.data().userId !== docId) {
          throw new Error("pin_taken");
        }
        if (oldPinDocRef) t.delete(oldPinDocRef);
        t.set(pinDocRef, { userId: docId });
        t.update(userDocRef, { pin: pinInput });
      });
    } catch (err: any) {
      setPinStatus(
        err.message === "pin_taken"
          ? "⛔ Taj PIN je već zauzet. Odaberite drugi."
          : "⛔ Greška pri spremanju PIN-a. Pokušajte ponovno."
      );
      return;
    }

    setCurrentPin(pinInput);
    setPinInput("");
    setPinStatus("✅ PIN uspješno spremljen!");
  };

  const handleRemovePin = async () => {
    const batch = writeBatch(db);
    if (currentPin) batch.delete(doc(db, "pins", currentPin));
    batch.update(doc(db, "users", docId), { pin: null });
    await batch.commit();
    setCurrentPin(null);
    setPinInput("");
    setPinStatus("PIN uklonjen.");
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

      <div className="profile-card">
        <label className="profile-label">
          <FaLock style={{ marginRight: "8px" }} />
          PIN
        </label>
        <div style={{ fontSize: "0.85rem", color: "#555", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          {currentPin !== null ? (
            <>
              Tvoj PIN: <strong>{showPin ? currentPin : "••••"}</strong>
              <button
                type="button"
                className="profile-pin-toggle"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? "Sakriti PIN" : "Pokazati PIN"}
              >
                {showPin ? <FaEyeSlash /> : <FaEye />}
              </button>
            </>
          ) : (
            "PIN nije postavljen"
          )}
        </div>
        <div className="profile-pin-row">
          <input
            type="text"
            inputMode="numeric"
            placeholder={currentPin !== null ? "Novi PIN" : "Unesi PIN"}
            maxLength={4}
            value={pinInput}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setPinInput(val);
              setPinStatus("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pinInput.length === 4) handleSavePin();
            }}
          />
        </div>
        <div className="profile-pin-buttons">
          <button
            className="profile-pin-save"
            onClick={handleSavePin}
            disabled={pinInput.length !== 4}
          >
            {currentPin !== null ? "Ažuriraj PIN" : "Spremi PIN"}
          </button>
          {currentPin !== null && (
            <button className="profile-pin-remove" onClick={handleRemovePin}>
              Ukloni PIN
            </button>
          )}
        </div>
        {pinStatus && (
          <p className={`profile-pin-status ${pinStatus.startsWith("✅") ? "success" : "error"}`}>
            {pinStatus}
          </p>
        )}
      </div>

      <div className="profile-buttons-row">
        <button onClick={handleLogout} className="profile-logout-button">
          <FaSignOutAlt style={{ marginRight: "6px" }} />
          Odjava
        </button>
      </div>

      {remainingVisits !== null && (
        <div className="profile-card visits">
          <label className="profile-label">🎟 Dolasci:</label>
          <div>
            Preostalih dolazaka: {remainingVisits}
            {validUntil && (
              <div style={{ fontSize: "0.9rem", color: "#555" }}>
                Vrijede do: {formatDate(validUntil)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
