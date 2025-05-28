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
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  FaCalendarAlt,
  FaEdit,
  FaRegListAlt,
  FaRecycle,
  FaDownload,
  FaThumbtack,
  FaCheckCircle,
  FaPlusCircle,
} from "react-icons/fa";

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
  const [reservations, setReservations] = useState<any[]>([]);

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
  const [showMissingLabelModal, setShowMissingLabelModal] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [dailyNotes, setDailyNotes] = useState<Record<string, string>>({});
  const [disabledDays, setDisabledDays] = useState<string[]>([]);

  const [noteModalDate, setNoteModalDate] = useState<string | null>(null);
  const [confirmDisableDay, setConfirmDisableDay] = useState<string | null>(
    null
  );

  const [noteInput, setNoteInput] = useState("");

  const saveNoteForDay = async (date: string, text: string) => {
    await setDoc(doc(db, "draftScheduleNotes", date), { text });
    setDailyNotes((prev) => ({ ...prev, [date]: text }));
    setNoteModalDate(null);
    setNoteInput("");
  };

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
    const reservationsSnap = await getDocs(collection(db, "reservations"));
    const allReservations = reservationsSnap.docs.map((d) => d.data());
    setReservations(allReservations);

    if (view === "draft" || view === "sessions") {
      const metaDoc = await getDoc(
        doc(db, view === "draft" ? "draftSchedule" : "sessions", "meta")
      );
      if (metaDoc.exists()) {
        const data = metaDoc.data();
        if (data.label) setCurrentLabel(data.label);
      }
    }

    if (view === "draft") {
      const notesSnap = await getDocs(collection(db, "draftScheduleNotes"));
      const notes: Record<string, string> = {};
      notesSnap.forEach((doc) => {
        notes[doc.id] = doc.data().text;
      });
      setDailyNotes(notes);
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
    if (!startDate) {
      setShowMissingLabelModal(true);
      return;
    }

    const existing = await getDocs(collection(db, "draftSchedule"));
    await Promise.all(
      existing.docs.map((d) => deleteDoc(doc(db, "draftSchedule", d.id)))
    );

    const templateSnap = await getDocs(collection(db, "defaultSchedule"));
    const templateSessions = templateSnap.docs.map((doc) => doc.data());

    const danOffset: Record<string, number> = {
      PONEDJELJAK: 0,
      UTORAK: 1,
      SRIJEDA: 2,
      ČETVRTAK: 3,
      PETAK: 4,
      SUBOTA: 5,
      NEDJELJA: 6,
    };

    const formatDate = (date: Date) => {
      return date.toLocaleDateString("hr-HR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };

    const updatedSessions = templateSessions.map((session) => {
      const dan = session.date; // očekuje se npr. "PONEDJELJAK"
      const offset = danOffset[dan];
      const realDate = new Date(startDate);
      realDate.setDate(realDate.getDate() + offset);

      return {
        ...session,
        date: formatDate(realDate), // sada stvarni datum npr. "14.05.2025."
      };
    });

    await Promise.all(
      updatedSessions.map((session) =>
        addDoc(collection(db, "draftSchedule"), session)
      )
    );

    const label = `${formatDate(startDate)} - ${formatDate(
      new Date(startDate.getTime() + 6 * 86400000)
    )}`;

    await setDoc(doc(db, "draftSchedule", "meta"), { label });
    setLabelInput(label);
    await fetchSessions();

    setShowModal("✅ Raspored je uspješno generiran prema odabranom tjednu.");

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

    // 🔁 Kopiraj opise iz draftScheduleNotes u sessionsNotes
    const notesSnap = await getDocs(collection(db, "draftScheduleNotes"));
    const currentNotes = await getDocs(collection(db, "sessionsNotes"));

    // Obrisi sve stare sessionsNotes
    await Promise.all(
      currentNotes.docs.map((d) => deleteDoc(doc(db, "sessionsNotes", d.id)))
    );

    // Dodaj nove
    await Promise.all(
      notesSnap.docs.map((d) =>
        setDoc(doc(db, "sessionsNotes", d.id), { text: d.data().text })
      )
    );

    setShowModal("✅ Novi tjedan je uspješno objavljen.");
    setView("sessions");
  };

  const resetDefaultSchedule = async () => {
    const dani = [
      "PONEDJELJAK",
      "UTORAK",
      "SRIJEDA",
      "ČETVRTAK",
      "PETAK",
      "SUBOTA",
    ];
    const termini = [
      "07:00 - 08:00",
      "08:00 - 09:00",
      "09:00 - 10:00",
      "16:00 - 17:00",
      "17:00 - 18:00",
      "18:00 - 19:00",
    ];

    const existing = await getDocs(collection(db, "defaultSchedule"));
    await Promise.all(
      existing.docs.map((d) => deleteDoc(doc(db, "defaultSchedule", d.id)))
    );

    for (const dan of dani) {
      for (const time of termini) {
        await addDoc(collection(db, "defaultSchedule"), {
          date: dan,
          time,
          maxSlots: 5,
          bookedSlots: 0,
          active: true,
        });
      }
    }

    setToastMessage("✅ Defaultni raspored je postavljen");
    setTimeout(() => setToastMessage(null), 3000);
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
  const getBrojRezervacija = (sessionId: string) =>
    reservations.filter(
      (r) => r.sessionId === sessionId && r.status === "rezervirano"
    ).length;

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
          <FaCalendarAlt />
          Tjedni raspored
        </button>
        <button onClick={() => setView("draft")} disabled={view === "draft"}>
          <FaEdit />
          Uredi tjedan
        </button>
        <button
          onClick={() => setView("template")}
          disabled={view === "template"}
        >
          <FaRegListAlt />
          Defaultni raspored
        </button>
      </div>

      {view === "sessions" && currentLabel && (
        <div style={{ textAlign: "center", margin: "1rem 0" }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: "600",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <FaCalendarAlt style={{ marginRight: "0.4rem" }} />
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
            <div className="week-datepicker-wrapper">
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Početak tjedna
              </label>
              <DatePicker
                selected={startDate}
                onChange={(selectedDate) => {
                  if (!selectedDate) return;

                  const selected = new Date(selectedDate);

                  const adjustedStart =
                    selected.getDay() === 0
                      ? new Date(selected.setDate(selected.getDate() - 6))
                      : new Date(
                          selected.setDate(
                            selected.getDate() - (selected.getDay() - 1)
                          )
                        );

                  setStartDate(adjustedStart);

                  const end = new Date(adjustedStart);
                  end.setDate(adjustedStart.getDate() + 6);

                  const label = `${adjustedStart.toLocaleDateString(
                    "hr-HR"
                  )} - ${end.toLocaleDateString("hr-HR")}`;
                  setLabelInput(label);
                }}
                dateFormat="dd.MM.yyyy"
                placeholderText="Odaberite datum"
                calendarStartDay={1} // 🟢 OVO POSTAVLJA PONEDJELJAK KAO PRVI DAN
                className="week-label-input"
              />
            </div>

            <button
              className="generate-button"
              onClick={() => {
                if (!labelInput.trim()) {
                  setShowMissingLabelModal(true);
                  return;
                }

                setConfirmPullTemplate(true);
              }}
            >
              <FaDownload style={{ marginRight: "0.4rem" }} />
              Povuci iz predloška
            </button>
          </div>

          {currentLabel && (
            <div className="active-draft-label">
              <div>
                <FaThumbtack style={{ marginRight: "0.4rem" }} />
                Aktivni tjedan:
              </div>

              <div>{currentLabel}</div>
            </div>
          )}

          <div
            style={{
              maxWidth: "400px",
              margin: "1rem auto",
              textAlign: "center",
            }}
          >
            <button
              className="publish-button"
              onClick={() => setConfirmPublish(true)}
            >
              <FaCheckCircle style={{ marginRight: "0.4rem" }} />
              Objavi raspored
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

      {showMissingLabelModal && (
        <div className="modal-overlay">
          <div className="modal">
            <p style={{ textAlign: "center", marginBottom: "1rem" }}>
              ⚠️ Prvo unesi datume za tjedan (od - do) za koji želiš generirati
              raspored.
            </p>
            <button
              style={{ display: "block", margin: "0 auto" }}
              onClick={() => setShowMissingLabelModal(false)}
            >
              U redu
            </button>
          </div>
        </div>
      )}

      {confirmDisableDay && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              Jesi li sigurna da želiš onemogućiti sve termine za dan:
              <br />
              <strong>{formatDay(confirmDisableDay)}</strong>?
            </p>
            <button
              onClick={() => {
                setDisabledDays([...disabledDays, confirmDisableDay]);
                setConfirmDisableDay(null);
              }}
              style={{
                marginRight: "0.5rem",
                backgroundColor: "#e74c3c",
                color: "white",
              }}
            >
              Da, onemogući
            </button>
            <button onClick={() => setConfirmDisableDay(null)}>Odustani</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <p
              style={{
                textAlign: "center",
                marginBottom: "1rem",
                whiteSpace: "pre-line",
              }}
            >
              {showModal}
            </p>
            <button
              style={{ display: "block", margin: "0 auto" }}
              onClick={() => setShowModal(null)}
            >
              U redu
            </button>
          </div>
        </div>
      )}

      {noteModalDate && (
        <div className="modal-overlay">
          <div className="modal">
            <h4>Opis za {formatDay(noteModalDate)}</h4>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              rows={4}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
            <button
              onClick={() => saveNoteForDay(noteModalDate, noteInput)}
              style={{ marginRight: "0.5rem" }}
            >
              Spremi
            </button>
            <button onClick={() => setNoteModalDate(null)}>Odustani</button>
          </div>
        </div>
      )}

      <div className="sessions-list">
        {Object.entries(grouped)
          .sort((a, b) => {
            if (view === "template") {
              const daniRedoslijed = [
                "PONEDJELJAK",
                "UTORAK",
                "SRIJEDA",
                "ČETVRTAK",
                "PETAK",
                "SUBOTA",
                "NEDJELJA",
              ];
              return (
                daniRedoslijed.indexOf(a[0]) - daniRedoslijed.indexOf(b[0])
              );
            } else {
              const da = new Date(a[0].split(".").reverse().join("-"));
              const db = new Date(b[0].split(".").reverse().join("-"));
              return da.getTime() - db.getTime();
            }
          })
          .map(([date, list]) => {
            if (view === "draft" && disabledDays.includes(date)) return null;
            return (
              <div key={date} className="session-group">
                <h4>{view === "template" ? date : formatDay(date)}</h4>

                {view === "draft" && (
                  <>
                    <button
                      className="add-button-small"
                      style={{ marginBottom: "0.5rem" }}
                      onClick={() => {
                        setNoteModalDate(date);
                        setNoteInput(dailyNotes[date] || "");
                      }}
                    >
                      📝 Dodaj opis
                    </button>
                    <button
                      className="add-button-small"
                      style={{
                        marginBottom: "0.5rem",
                        backgroundColor: "#e74c3c",
                        color: "white",
                      }}
                      onClick={() => {
                        if (!disabledDays.includes(date)) {
                          setConfirmDisableDay(date);
                        }
                      }}
                    >
                      {disabledDays.includes(date)
                        ? "♻️ Vrati dan"
                        : "🚫 Onemogući dan"}
                    </button>

                    {dailyNotes[date] && (
                      <div className="daily-note-box">
                        <em>{dailyNotes[date]}</em>
                      </div>
                    )}
                  </>
                )}

                {[...list]
                  .sort((a, b) => {
                    const getMinutes = (time: string) => {
                      const [h, m] = time
                        .split(" - ")[0]
                        .split(":")
                        .map(Number);
                      return h * 60 + m;
                    };
                    return getMinutes(a.time) - getMinutes(b.time);
                  })
                  .map((s) => (
                    <div key={s.id} className="session-item-admin">
                      <span>
                        {s.time} ({getBrojRezervacija(s.id)}/{s.maxSlots})
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
                      <FaPlusCircle style={{ marginRight: "0.4rem" }} />
                      Dodaj termin
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
                            onChange={(e) =>
                              setNewSlots(Number(e.target.value))
                            }
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
            );
          })}
      </div>
    </div>
  );
}
