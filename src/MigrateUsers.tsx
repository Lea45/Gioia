import { useState } from 'react';
import { db } from './firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';

export default function MigrateUsers() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const checkDuplicates = async () => {
    setRunning(true);
    setLog([]);
    const lines: string[] = ['--- PROVJERA DUPLIKATA ---'];
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const pinMap: Record<string, { name: string; id: string }[]> = {};

      for (const userDoc of usersSnap.docs) {
        const d = userDoc.data();
        if (d.pin) {
          if (!pinMap[d.pin]) pinMap[d.pin] = [];
          pinMap[d.pin].push({ name: d.name || d.fullName || '?', id: userDoc.id });
        }
      }

      let found = 0;
      for (const [pin, users] of Object.entries(pinMap)) {
        if (users.length > 1) {
          lines.push(`⛔ PIN ${pin}: ${users.map(u => u.name).join(' + ')}`);
          found++;
        }
      }

      if (found === 0) lines.push('✅ Nema duplikata.');
      else lines.push(`\nUkupno: ${found} duplikat(a).`);
    } catch (err: any) {
      lines.push(`❌ Greška: ${err.message}`);
    }
    setLog(lines);
    setRunning(false);
  };

  const migratePins = async () => {
    setRunning(true);
    setLog([]);
    const lines: string[] = ['--- MIGRACIJA PINova u pins kolekciju ---'];
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const pinMap: Record<string, string[]> = {};

      for (const userDoc of usersSnap.docs) {
        const pin = userDoc.data().pin;
        if (pin) {
          if (!pinMap[pin]) pinMap[pin] = [];
          pinMap[pin].push(userDoc.id);
        }
      }

      const batch = writeBatch(db);
      let migrated = 0;
      let skipped = 0;

      for (const [pin, userIds] of Object.entries(pinMap)) {
        if (userIds.length > 1) {
          lines.push(`⛔ DUPLIKAT PIN ${pin} — preskočeno, treba ručno riješiti.`);
          skipped++;
          continue;
        }
        batch.set(doc(db, 'pins', pin), { userId: userIds[0] });
        lines.push(`✅ PIN ${pin} → ${userIds[0]}`);
        migrated++;
      }

      await batch.commit();
      lines.push(`\nGotovo: ${migrated} migriranih, ${skipped} preskočenih.`);
    } catch (err: any) {
      lines.push(`❌ Greška: ${err.message}`);
    }
    setLog(lines);
    setRunning(false);
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h2>Migracija / Provjera PINova</h2>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <button onClick={checkDuplicates} disabled={running}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
          🔍 Provjeri duplikate
        </button>
        <button onClick={migratePins} disabled={running}
          style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
          ⚙️ Migiraj PINove u pins kolekciju
        </button>
      </div>
      {log.length > 0 && (
        <pre style={{ background: "#f0f0f0", padding: "1rem", borderRadius: "8px", whiteSpace: "pre-wrap" }}>
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
}
