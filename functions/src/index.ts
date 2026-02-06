import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// Infobip konfiguracija - postavlja se kroz Firebase environment
// firebase functions:config:set infobip.api_key="VAŠ_KLJUČ" infobip.base_url="z3g8qx.api.infobip.com"

interface SendWhatsAppData {
  phone: string;
  templateName?: string;
}

export const sendWhatsAppNotification = functions
  .region("europe-west1")
  .https.onCall(async (data: SendWhatsAppData, context) => {
    // Provjeri je li korisnik autentificiran (opcionalno)
    // if (!context.auth) {
    //   throw new functions.https.HttpsError("unauthenticated", "Morate biti prijavljeni.");
    // }

    const { phone, templateName = "waitlist_moved" } = data;

    if (!phone) {
      throw new functions.https.HttpsError("invalid-argument", "Broj telefona je obavezan.");
    }

    // Normaliziraj broj telefona
    let normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (normalized.startsWith("0")) {
      normalized = "385" + normalized.slice(1);
    }

    // Dohvati Infobip konfiguraciju
    const config = functions.config();
    const apiKey = config.infobip?.api_key;
    const baseUrl = config.infobip?.base_url || "z3g8qx.api.infobip.com";

    if (!apiKey) {
      console.error("Infobip API ključ nije konfiguriran!");
      throw new functions.https.HttpsError("failed-precondition", "Infobip nije konfiguriran.");
    }

    try {
      const response = await fetch(`https://${baseUrl}/whatsapp/1/message/template`, {
        method: "POST",
        headers: {
          "Authorization": `App ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              from: "15557795075",
              to: normalized,
              messageId: `${templateName}-${Date.now()}`,
              content: {
                templateName: templateName,
                templateData: {
                  body: {
                    placeholders: [],
                  },
                },
                language: "hr",
              },
            },
          ],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Infobip greška:", result);
        throw new functions.https.HttpsError("internal", "Greška pri slanju poruke.");
      }

      console.log("WhatsApp uspješno poslana na:", normalized);
      return { success: true, messageId: result.messages?.[0]?.messageId };
    } catch (error) {
      console.error("Greška pri slanju WhatsApp-a:", error);
      throw new functions.https.HttpsError("internal", "Greška pri slanju poruke.");
    }
  });

// Funkcija za admin obavijesti
export const sendAdminNotification = functions
  .region("europe-west1")
  .https.onCall(async (data: { phone: string; message: string }, context) => {
    const { phone, message } = data;

    if (!phone || !message) {
      throw new functions.https.HttpsError("invalid-argument", "Broj i poruka su obavezni.");
    }

    let normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (normalized.startsWith("0")) {
      normalized = "385" + normalized.slice(1);
    }

    const config = functions.config();
    const apiKey = config.infobip?.api_key;
    const baseUrl = config.infobip?.base_url || "z3g8qx.api.infobip.com";

    if (!apiKey) {
      throw new functions.https.HttpsError("failed-precondition", "Infobip nije konfiguriran.");
    }

    try {
      const response = await fetch(`https://${baseUrl}/whatsapp/1/message/template`, {
        method: "POST",
        headers: {
          "Authorization": `App ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              from: "15557795075",
              to: normalized,
              messageId: `admin-${Date.now()}`,
              content: {
                templateName: "admin_notice",
                templateData: {
                  body: {
                    placeholders: [message],
                  },
                },
                language: "hr",
              },
            },
          ],
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Infobip greška:", result);
        throw new functions.https.HttpsError("internal", "Greška pri slanju poruke.");
      }

      return { success: true };
    } catch (error) {
      console.error("Greška pri slanju:", error);
      throw new functions.https.HttpsError("internal", "Greška pri slanju poruke.");
    }
  });
