import { db } from "../firebase";
import { collection, addDoc } from "firebase/firestore";
import fs from "fs";
import csv from "csv-parser";

const usersRef = collection(db, "users");

fs.createReadStream("klijenti.csv")
  .pipe(csv())
  .on("data", async (row) => {
    const name = row["IME I PREZIME"];
    const phone = row["KONTAKT"];

    if (name && phone) {
      try {
        await addDoc(usersRef, {
          name: name.trim(),
          phone: phone.trim(),
          remainingVisits: 0,
          validUntil: null,
        });
        console.log(`✅ Dodan: ${name}`);
      } catch (error) {
        console.error(`❌ Greška za ${name}:`, error);
      }
    }
  })
  .on("end", () => {
    console.log("🎉 Gotovo s unosom testnih klijenata.");
  });
