import { useEffect, useState } from "react";
import { db } from "./firebase";
import "./ScheduleAdmin.css";
import {
  collection,
  getDocs,
  deleteDoc,
  addDoc,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import spinner from "./gears-spinner.svg";

type Session = {
  id: string;
  date: string;
  time: string;
  maxSlots: number;
  bookedSlots: number;
  active: boolean;
};

export default function ScheduleAdmin() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [view, setView] = useState<"sessions" | "draft" | "template">(
    "sessions"
  );
  const [labelInput, setLabelInput] = useState("");
  const [currentLabel, setCurrentLabel] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newSlots, setNewSlots] = useState(5);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    date: string;
    time: string;
  } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmPullTemplate, setConfirmPullTemplate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSessions = async () => {
    const source =
      view === "template"
        ? "defaultSchedule"
        : view === "draft"
        ? "draftSchedule"
        : "sessions";

    const snapshot = await getDocs(collection(db, source));
    const fetched = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Session[];
    setSessions(fetched.filter((s) => s.date));

    if (view === "draft" || view === "sessions") {
      const metaDoc = await getDoc(
        doc(db, view === "draft" ? "draftSchedule" : "sessions", "meta")
      );
      if (metaDoc.exists()) {
        const data = metaDoc.data();
        if (data.label) setCurrentLabel(data.label);
      }
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [view]);

  const deleteSession = async (id: string) => {
    const source =
      view === "template"
        ? "defaultSchedule"
        : view === "draft"
        ? "draftSchedule"
        : "sessions";
    await deleteDoc(doc(db, source, id));
    fetchSessions();
  };

  const addSession = async (date: string) => {
    if (!newTime.trim()) return;
    let target = "draftSchedule";
    if (view === "template") target = "defaultSchedule";
    else if (view === "sessions") target = "sessions";

    await addDoc(collection(db, target), {
      date,
      time: newTime,
      maxSlots: newSlots,
      bookedSlots: 0,
      active: true,
    });
    setShowModal(null);
    setNewTime("");
    setNewSlots(5);
    fetchSessions();
  };

  const generateWeekFromTemplate = async () => {
    if (!labelInput.trim()) return;
    const existing = await getDocs(collection(db, "draftSchedule"));
    await Promise.all(
      existing.docs.map((d) => deleteDoc(doc(db, "draftSchedule", d.id)))
    );
    const templateSnap = await getDocs(collection(db, "defaultSchedule"));
    const templateSessions = templateSnap.docs.map((doc) => doc.data());
    await Promise.all(
      templateSessions.map((session) =>
        addDoc(collection(db, "draftSchedule"), session)
      )
    );
    const metaDoc = await getDoc(doc(db, "draftSchedule", "meta"));
    if (metaDoc.exists()) {
      const data = metaDoc.data();
      if (data.label) {
        await setDoc(doc(db, "sessions", "meta"), { label: data.label });
      }
    }

    await setDoc(doc(db, "draftSchedule", "meta"), { label: labelInput });
    await fetchSessions();

    setToastMessage("✅ Raspored povučen iz predloška");
    setTimeout(() => setToastMessage(null), 3000);
    setView("draft");
  };

  const publishSchedule = async () => {
    const draftSnap = await getDocs(collection(db, "draftSchedule"));
    const draftTerms = draftSnap.docs
      .filter((doc) => doc.id !== "meta")
      .map((doc) => doc.data());
    const currentSessions = await getDocs(collection(db, "sessions"));
    await Promise.all(
      currentSessions.docs.map((d) => deleteDoc(doc(db, "sessions", d.id)))
    );
    await Promise.all(
      draftTerms.map((term) => addDoc(collection(db, "sessions"), term))
    );
    setToastMessage("✅ Novi tjedan objavljen");
    setTimeout(() => setToastMessage(null), 3000);
    setView("sessions");
  };

  const formatDay = (dateStr: string): string => {
    const [d, m, y] = dateStr.split(".").map((s) => parseInt(s.trim()));
    const date = new Date(y, m - 1, d);
    const dani = [
      "NEDJELJA",
      "PONEDJELJAK",
      "UTORAK",
      "SRIJEDA",
      "ČETVRTAK",
      "PETAK",
      "SUBOTA",
    ];
    return dani[date.getDay()];
  };

  const grouped: Record<string, Session[]> = sessions.reduce((acc, s) => {
    if (!acc[s.date]) acc[s.date] = [];
    acc[s.date].push(s);
    return acc;
  }, {} as Record<string, Session[]>);

  return (
    <div className="schedule-admin-container">
      <h2>Upravljanje Terminima</h2>

      {isLoading && (
        <div className="spinner-overlay">
          <img src={spinner} alt="Učitavanje..." className="spinner" />
        </div>
      )}

      <div className="tab-switcher">
        <button
          onClick={() => setView("sessions")}
          disabled={view === "sessions"}
        >
          📅 Tjedni raspored
        </button>
        <button onClick={() => setView("draft")} disabled={view === "draft"}>
          ✏️ Uredi tjedan
        </button>
        <button
          onClick={() => setView("template")}
          disabled={view === "template"}
        >
          🟩 DEFAULTNI RASPORED
        </button>
      </div>

      {view === "sessions" && currentLabel && (
        <div style={{ textAlign: "center", margin: "1rem 0" }}>
          <div style={{ fontSize: "18px", fontWeight: "600" }}>
            <span role="img" aria-label="calendar">
              🗓️
            </span>{" "}
            Raspored
          </div>
          <div
            style={{ fontSize: "16px", fontWeight: "500", marginTop: "0.3rem" }}
          >
            {currentLabel}
          </div>
        </div>
      )}

{view === "draft" && (
  <>
    <div className="draft-controls-card">
      <input
        type="text"
        placeholder="Tjedan od 06.05. do 11.05."
        value={labelInput}
        onChange={(e) => setLabelInput(e.target.value)}
        className="week-label-input"
      />
      <button
        className="generate-button"
        onClick={() => {
          if (!labelInput.trim()) {
            setToastMessage("⚠️ Prvo unesi za koji tjedan se povlači raspored");
            setTimeout(() => setToastMessage(null), 3000);
            return;
          }
          setConfirmPullTemplate(true);
        }}
      >
        📥 Povuci iz predloška
      </button>
    </div>

    {currentLabel && (
      <div className="active-draft-label">
        <div>📌 Aktivni tjedan:</div>
        <div>{currentLabel}</div>
      </div>
    )}

    <div style={{ maxWidth: "400px", margin: "1rem auto", textAlign: "center" }}>
      <button
        className="publish-button"
        onClick={() => setConfirmPublish(true)}
      >
        ✅ Objavi raspored
      </button>
    </div>
  </>
)}



      {toastMessage && <div className="custom-toast">{toastMessage}</div>}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              Jesi li sigurna da želiš obrisati termin:
              <br />
              <strong>
                {formatDay(confirmDelete.date)}, {confirmDelete.time}
              </strong>
              ?
            </p>
            <button
              onClick={() => {
                deleteSession(confirmDelete.id);
                setConfirmDelete(null);
              }}
              style={{ marginRight: "0.5rem" }}
            >
              Da, obriši
            </button>
            <button onClick={() => setConfirmDelete(null)}>Odustani</button>
          </div>
        </div>
      )}

      {confirmPullTemplate && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal">
            <p>
              Jesi li sigurna da želiš povući defaultni raspored?
              <br />
              Svi trenutni draft termini bit će obrisani.
            </p>
            <button
              onClick={async () => {
                setConfirmPullTemplate(false);
                await generateWeekFromTemplate();
              }}
              style={{
                marginRight: "0.5rem",
                backgroundColor: "#3498db",
                color: "white",
              }}
            >
              Da, povuci
            </button>
            <button onClick={() => setConfirmPullTemplate(false)}>
              Odustani
            </button>
          </div>
        </div>
      )}

      {confirmPublish && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              Jesi li sigurna da želiš objaviti novi tjedan?
              <br />
              Time se brišu svi trenutačni termini koji su vidljivi klijentima.
            </p>
            <button
              onClick={() => {
                publishSchedule();
                setConfirmPublish(false);
              }}
              style={{
                marginRight: "0.5rem",
                backgroundColor: "#28a745",
                color: "white",
              }}
            >
              Da, objavi
            </button>
            <button onClick={() => setConfirmPublish(false)}>Odustani</button>
          </div>
        </div>
      )}

      <div className="sessions-list">
        {Object.entries(grouped)
          .sort((a, b) => {
            const da = new Date(a[0].split(".").reverse().join("-"));
            const db = new Date(b[0].split(".").reverse().join("-"));
            return da.getTime() - db.getTime();
          })
          .map(([date, list]) => (
            <div key={date} className="session-group">
              <h4>{formatDay(date)}</h4>
              {[...list]
                .sort((a, b) => {
                  const getMinutes = (time: string) => {
                    const [h, m] = time.split(" - ")[0].split(":").map(Number);
                    return h * 60 + m;
                  };
                  return getMinutes(a.time) - getMinutes(b.time);
                })
                .map((s) => (
                  <div key={s.id} className="session-item-admin">
                    <span>
                      {s.time} ({s.bookedSlots}/{s.maxSlots})
                    </span>
                    <button
                      onClick={() =>
                        setConfirmDelete({
                          id: s.id,
                          date: s.date,
                          time: s.time,
                        })
                      }
                    >
                      Obriši
                    </button>
                  </div>
                ))}
              {(view === "draft" ||
                view === "template" ||
                view === "sessions") && (
                <>
                  <button
                    className="add-button-small"
                    onClick={() => setShowModal(date)}
                    style={{ marginTop: "0.5rem" }}
                  >
                    ➕ Dodaj termin
                  </button>
                  {showModal === date && (
                    <div className="modal-overlay">
                      <div className="modal">
                        <h4>Dodaj termin za {formatDay(date)}</h4>
                        <input
                          type="text"
                          placeholder="08:00 - 09:00"
                          value={newTime}
                          onChange={(e) => setNewTime(e.target.value)}
                          style={{
                            display: "block",
                            margin: "0.5rem 0",
                            padding: "0.4rem",
                          }}
                        />
                        <input
                          type="number"
                          min={1}
                          placeholder="Broj mjesta"
                          value={newSlots}
                          onChange={(e) => setNewSlots(Number(e.target.value))}
                          style={{
                            display: "block",
                            marginBottom: "0.5rem",
                            padding: "0.4rem",
                          }}
                        />
                        <button
                          onClick={() => addSession(date)}
                          style={{ marginRight: "0.5rem" }}
                        >
                          Spremi
                        </button>
                        <button onClick={() => setShowModal(null)}>
                          Odustani
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
