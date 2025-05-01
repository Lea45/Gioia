import { useEffect, useState } from 'react';
import { db } from './firebase';
import ConfirmPopup from './ConfirmPopup';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
} from 'firebase/firestore';

type Session = {
  id: string;
  date: string;
  time: string;
  bookedSlots: number;
  maxSlots: number;
};

type Reservation = {
  id: string;
  phone: string;
  sessionId: string;
  status: 'rezervirano' | 'cekanje';
};

type Props = {
  onReservationMade: () => void;
  onShowPopup: (message: string) => void;
  refreshKey: number;
};

const days = ['PON', 'UTO', 'SRI', 'ČET', 'PET', 'SUB'];
const times = [
  '07:00 - 08:00',
  '08:00 - 09:00',
  '09:00 - 10:00',
  '16:00 - 17:00',
  '17:00 - 18:00',
  '18:00 - 19:00',
  '19:00 - 20:00',
  '20:00 - 21:00',
];

const ScheduleTable = ({ onReservationMade, refreshKey, onShowPopup }: Props) => {
  const [confirmSession, setConfirmSession] = useState<Session | null>(null);
  const [confirmCancelSession, setConfirmCancelSession] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const phone = localStorage.getItem('phone');

  useEffect(() => {
    const fetchData = async () => {
      const sessionsSnap = await getDocs(collection(db, 'sessions'));
      const reservationsSnap = await getDocs(collection(db, 'reservations'));

      const fetchedSessions = sessionsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Session[];

      const fetchedReservations = reservationsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Reservation[];

      setSessions(fetchedSessions);
      setReservations(fetchedReservations);
    };

    fetchData();
  }, [refreshKey]);

  const getSession = (dayIndex: number, time: string): Session | undefined => {
    const targetDate = getDateByDayOffset(dayIndex);
    return sessions.find((s) => s.date === targetDate && s.time === time);
  };

  const getDateByDayOffset = (offset: number): string => {
    const base = new Date('2025-04-22'); // utorak kao početak
    const date = new Date(base);
    date.setDate(base.getDate() - 1 + offset);
    return date.toLocaleDateString('hr-HR');
  };

  const isAlreadyReserved = (sessionId: string) => {
    return reservations.some((r) => r.sessionId === sessionId && r.phone === phone);
  };

  const reserve = async (session: Session) => {
    if (!phone) return onShowPopup('📱 Prijavite se.');
  
    const already = isAlreadyReserved(session.id);
    if (already) return onShowPopup('⛔ Već ste prijavljeni.');
  
    const status = session.bookedSlots < session.maxSlots ? 'rezervirano' : 'cekanje';
  
    await addDoc(collection(db, 'reservations'), {
      phone,
      sessionId: session.id,
      date: session.date,
      time: session.time,
      status,
      createdAt: new Date(),
      notified: false,
    });
  
    if (status === 'rezervirano') {
      await updateDoc(doc(db, 'sessions', session.id), {
        bookedSlots: session.bookedSlots + 1,
      });
    }
  
    onShowPopup(status === 'rezervirano' ? '✅ Rezervirano!' : '🕐 Lista čekanja.');
    onReservationMade();
  };
  

  const cancelReservation = async (sessionId: string) => {
    if (!phone) return;

    const userReservation = reservations.find(
      (r) => r.phone === phone && r.sessionId === sessionId
    );

    if (!userReservation) return;

    await deleteDoc(doc(db, 'reservations', userReservation.id));

    if (userReservation.status === 'rezervirano') {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          bookedSlots: Math.max(0, session.bookedSlots - 1),
        });
      }
    }

    onShowPopup('❌ Termin otkazan');
    onReservationMade();
  };

  return (
    <div style={pageWrapperStyle}>

      {confirmSession && (
        <ConfirmPopup
          message={`Jeste li sigurni da želite rezervirati termin ${confirmSession?.date} ${confirmSession?.time}?`}
          onConfirm={() => {
            reserve(confirmSession!);
            setConfirmSession(null);
          }}
          onCancel={() => setConfirmSession(null)}
        />
      )}
      {confirmCancelSession && (
        <ConfirmPopup
          message={`Jeste li sigurni da želite otkazati termin ${confirmCancelSession?.date} ${confirmCancelSession?.time}?`}
          onConfirm={() => {
            cancelReservation(confirmCancelSession!.id);
            setConfirmCancelSession(null);
          }}
          onCancel={() => setConfirmCancelSession(null)}
        />
      )}

      <div style={innerWrapperStyle}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Raspored termina</h2>

        <div style={tableContainerStyle}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>Vrijeme</th>
                {days.map((day) => (
                  <th key={day} style={thStyle}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((time) => (
                <tr key={time}>
                  <td style={tdTimeStyle}><strong>{time}</strong></td>
                  {days.map((_, dayIdx) => {
                    const session = getSession(dayIdx, time);
                    if (!session) {
                      return (
                        <td key={dayIdx + time} style={tdStyle}>
                          <div style={{ visibility: 'hidden' }}>
                            <div>Rezervirano</div>
                            <div>0/5 mjesta</div>
                            <button>Rezerviraj</button>
                          </div>
                        </td>
                      );
                    }

                    const userReservation = reservations.find(
                      (r) => r.phone === phone && r.sessionId === session.id
                    );
                    const isFull = session.bookedSlots >= session.maxSlots;

                    return (
                      <td key={dayIdx + time} style={tdStyle}>
                        {userReservation ? (
                          <>
                            <div style={{ color: 'green', fontWeight: 'bold' }}>✅ Rezervirano</div>
                            <div style={{ margin: '5px 0' }}>{session.bookedSlots}/{session.maxSlots} mjesta</div>
                            <button
                              onClick={() => setConfirmCancelSession(session)}
                              style={{ backgroundColor: '#ffdddd' }}
                            >
                              ❌ Otkazivanje
                            </button>
                          </>
                        ) : (
                          <>
                            <div>{session.bookedSlots}/{session.maxSlots} mjesta</div>
                            <button
                              onClick={() => setConfirmSession(session)}
                              style={{ marginTop: '5px' }}
                            >
                              {isFull ? 'Lista čekanja' : 'Rezerviraj'}
                            </button>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const pageWrapperStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '100vh',
  padding: '20px',
  backgroundColor: '#ffffff',
};

const innerWrapperStyle = {
  width: 'fit-content',
  maxWidth: '100%',
};

const tableContainerStyle = {
  width: '100%',
  overflowX: 'auto' as const,
  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  borderRadius: '8px',
  backgroundColor: '#fff',
  padding: '20px',
};

const thStyle = {
  border: '1px solid #ccc',
  padding: '8px',
  background: '#f0f0f0',
  textAlign: 'center' as const,
  width: '140px',
  minWidth: '140px',
  height: '140px',
  boxSizing: 'border-box' as const,
};

const tdStyle = {
  border: '1px solid #ccc',
  padding: '10px',
  width: '140px',
  height: '140px',
  boxSizing: 'border-box' as const,
  textAlign: 'center' as const,
  verticalAlign: 'middle' as const,
  borderRadius: '6px',
};

const tdTimeStyle = {
  ...tdStyle,
  backgroundColor: '#f0f0f0',
  fontWeight: 'bold',
};

export default ScheduleTable;