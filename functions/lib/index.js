"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendAdminNotification = exports.sendWhatsAppNotification = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
exports.sendWhatsAppNotification = functions
    .region("europe-west1")
    .https.onCall(async (data, context) => {
    // Provjeri je li korisnik autentificiran (opcionalno)
    // if (!context.auth) {
    //   throw new functions.https.HttpsError("unauthenticated", "Morate biti prijavljeni.");
    // }
    var _a, _b, _c, _d;
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
    const apiKey = (_a = config.infobip) === null || _a === void 0 ? void 0 : _a.api_key;
    const baseUrl = ((_b = config.infobip) === null || _b === void 0 ? void 0 : _b.base_url) || "z3g8qx.api.infobip.com";
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
        return { success: true, messageId: (_d = (_c = result.messages) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.messageId };
    }
    catch (error) {
        console.error("Greška pri slanju WhatsApp-a:", error);
        throw new functions.https.HttpsError("internal", "Greška pri slanju poruke.");
    }
});
// Funkcija za admin obavijesti
exports.sendAdminNotification = functions
    .region("europe-west1")
    .https.onCall(async (data, context) => {
    var _a, _b;
    const { phone, message } = data;
    if (!phone || !message) {
        throw new functions.https.HttpsError("invalid-argument", "Broj i poruka su obavezni.");
    }
    let normalized = phone.replace(/\s+/g, "").replace(/^\+/, "");
    if (normalized.startsWith("0")) {
        normalized = "385" + normalized.slice(1);
    }
    const config = functions.config();
    const apiKey = (_a = config.infobip) === null || _a === void 0 ? void 0 : _a.api_key;
    const baseUrl = ((_b = config.infobip) === null || _b === void 0 ? void 0 : _b.base_url) || "z3g8qx.api.infobip.com";
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
    }
    catch (error) {
        console.error("Greška pri slanju:", error);
        throw new functions.https.HttpsError("internal", "Greška pri slanju poruke.");
    }
});
//# sourceMappingURL=index.js.map