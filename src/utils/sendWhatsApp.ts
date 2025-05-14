export const sendWhatsAppMessage = async (rawPhone: string) => {
  const normalized = rawPhone.startsWith("0")
    ? "385" + rawPhone.slice(1)
    : rawPhone;

  try {
    const response = await fetch(
      "https://z3g8qx.api.infobip.com/whatsapp/1/message/template",
      {
        method: "POST",
        headers: {
          Authorization:
            "App a0c43ce9d5d14a83e05b1d09e8088860-21c77bf5-0311-49e3-8d62-01c20e94b9f3",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              from: "15557795075",
              to: normalized,
              messageId: "waitlist-" + Date.now(),
              content: {
                templateName: "waitlist_moved",
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
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("❌ WhatsApp error:", data);
    } else {
      console.log("✅ WhatsApp sent:", data);
    }
  } catch (err) {
    console.error("❌ WhatsApp fetch error:", err);
  }
};
