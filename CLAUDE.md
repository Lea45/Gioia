# Gioia Reformer Pilates Studio

## Projekt
React + Firebase (Firestore v9 modular SDK) web aplikacija za rezervacije pilates termina.
Hostano na Firebase Hosting. PWA s VitePWA pluginom.

## Tech stack
- React 18 + TypeScript
- Vite + vite-plugin-pwa
- Firebase Firestore (v9 modular)
- Firebase Hosting
- Infobip WhatsApp API (preko Firebase Function proxy-ja `/api/sendWhatsAppNotification`)

## Firestore kolekcije
- **users** — `{ phone, name, pin, remainingVisits, validUntil, active }`
- **reservations** — `{ phone, name, sessionId, date, time, status, createdAt, notified, refunded, visitDeducted, visitDeductedAt, cancelledAt, refundReason, refundedAt }`
- **sessions** — `{ date, time, maxSlots, bookedSlots, active }` + `sessions/meta` (label)
- **draftSchedule** — isti format kao sessions (admin editing)
- **defaultSchedule** — template (dan umjesto datuma)
- **sessionsNotes** / **draftScheduleNotes** — `{ text }`
- **announcements** — `{ text, createdAt }`

## Statusi rezervacija
- `"rezervirano"` — korisnik ima potvrđeno mjesto
- `"cekanje"` — lista čekanja
- `"otkazano"` — otkazano (NIKAD se ne briše dokument)

## Ključne arhitekturne odluke
- **Otkazivanje**: koristi `status: "otkazano"` umjesto `deleteDoc`. Audit trail s `cancelledAt`, `refunded`, `refundedAt`, `refundReason`.
- **visitDeducted polje**: svaka rezervacija bilježi je li dolazak oduzet. Refund se temelji na ovom polju, NE na vremenskom pravilu.
- **Atomske operacije**: rezervacija (kreiranje + bookedSlots + remainingVisits) i otkazivanje (status update + refund + bookedSlots + waitlist promocija) koriste `runTransaction`.
- **StatusManagement refund**: koristi `writeBatch` za atomski update (user + reservation).
- **Firestore transakcije**: SVI `transaction.get()` pozivi moraju biti PRIJE bilo kojeg `set()`/`update()` poziva.

## Važni fajlovi
- `src/reservationUtils.ts` — `cancelReservation(reservationId)` utility (atomska transakcija)
- `src/ScheduleCards.tsx` — raspored + rezervacija + otkazivanje (klijent)
- `src/MyBookings.tsx` — "Moji termini" + otkazivanje (klijent)
- `src/StatusManagement.tsx` — admin pregled statusa + bulk refund čekanja
- `src/ScheduleAdmin.tsx` — admin upravljanje rasporedom
- `src/UserManagement.tsx` — admin upravljanje korisnicima
- `src/Profile.tsx` — korisnički profil + PIN
- `src/Login.tsx` — prijava (PIN ili telefon)
- `src/main.tsx` — entry point + SW auto-reload listener

## Prijava
Dva načina: PIN (4 znamenke) ili broj telefona. Oba postavljaju iste localStorage vrijednosti: `phone`, `userId`, `userName`.

## PWA auto-update
- `vite-plugin-pwa` s `registerType: 'autoUpdate'`
- SW ima `skipWaiting()` + `clientsClaim()`
- `main.tsx` ima `controllerchange` listener koji automatski reloada stranicu
- `index.html` NEMA ručni manifest link (VitePWA ga generira)

## Admin
- Admin telefon hardkodiran: `"20181804"` (može bookirati više termina dnevno)
- Admin login je zasebna komponenta (`AdminLogin.tsx`)

## Napomene
- Svi datumi su u formatu `"DD.MM.YYYY."` (s točkom na kraju)
- Vremena su u formatu `"HH:MM - HH:MM"`
- WhatsApp notifikacije idu preko server-side Firebase Function (NE direktno iz klijenta)
- 2h pravilo: korisnik ne može otkazati manje od 2h prije termina (gumb disabled u UI-ju)
- Otkazivanje je dostupno SAMO iz "Moji termini" taba (namjerno)
