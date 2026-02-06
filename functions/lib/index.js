"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAdminNotification = exports.sendWhatsAppNotification = void 0;
const https_1 = require("firebase-functions/v2/https");
const app_1 = require("firebase-admin/app");
(0, app_1.initializeApp)();
// Infobip konfiguracija kroz environment variables
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL || "z3g8qx.api.infobip.com";
exports.sendWhatsAppNotification = (0, https_1.onRequest)({
    region: "europe-west1",
    cors: ["https://gioia-app.web.app", "https://gioia-app.firebaseapp.com"]
}, async (req, res) => {
    var _a, _b;
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    const { phone, templateName = "waitlist_moved" } = req.body;
    if (!phone) {
        res.status(400).json({ error: "Broj telefona je obavezan." });
        return;
    }
    // Normaliziraj broj telefona
    let normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (normalized.startsWith("0")) {
        normalized = "385" + normalized.slice(1);
    }
    const apiKey = INFOBIP_API_KEY;
    const baseUrl = INFOBIP_BASE_URL;
    if (!apiKey) {
        console.error("Infobip API ključ nije konfiguriran!");
        res.status(500).json({ error: "Infobip nije konfiguriran." });
        return;
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
            res.status(500).json({ error: "Greška pri slanju poruke." });
            return;
        }
        console.log("WhatsApp uspješno poslana na:", normalized);
        res.json({ success: true, messageId: (_b = (_a = result.messages) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.messageId });
    }
    catch (error) {
        console.error("Greška pri slanju WhatsApp-a:", error);
        res.status(500).json({ error: "Greška pri slanju poruke." });
    }
});
// Funkcija za admin obavijesti
exports.sendAdminNotification = (0, https_1.onRequest)({
    region: "europe-west1",
    cors: ["https://gioia-app.web.app", "https://gioia-app.firebaseapp.com"]
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    const { phone, message } = req.body;
    if (!phone || !message) {
        res.status(400).json({ error: "Broj i poruka su obavezni." });
        return;
    }
    let normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (normalized.startsWith("0")) {
        normalized = "385" + normalized.slice(1);
    }
    const apiKey = INFOBIP_API_KEY;
    const baseUrl = INFOBIP_BASE_URL;
    if (!apiKey) {
        res.status(500).json({ error: "Infobip nije konfiguriran." });
        return;
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
            res.status(500).json({ error: "Greška pri slanju poruke." });
            return;
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error("Greška pri slanju:", error);
        res.status(500).json({ error: "Greška pri slanju poruke." });
    }
});
//# sourceMappingURL=index.js.map