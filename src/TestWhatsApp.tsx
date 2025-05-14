import React from "react";

const TestWhatsApp: React.FC = () => {
  const testWhatsApp = async () => {
    const rawPhone = "0911529422";
    const normalized = rawPhone.replace(/^\+/, "").replace(/^0/, "385");

    console.log("📤 Šaljem test WhatsApp poruku na:", normalized);

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
                messageId: "test-" + Date.now(),
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
      console.log("📬 Odgovor s Infobip API-ja:", data);

      if (!response.ok) {
        alert("❌ Neuspješno slanje poruke");
      } else {
        alert("✅ Poruka uspješno poslana!");
      }
    } catch (error) {
      console.error("❌ Greška prilikom fetch-a:", error);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <button onClick={testWhatsApp} style={{ padding: "1rem" }}>
        Testiraj WhatsApp poruku
      </button>
    </div>
  );
};

export default TestWhatsApp;
