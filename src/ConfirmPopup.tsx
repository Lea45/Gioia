import { useEffect } from "react";
import { ReactNode } from "react";
import "./ConfirmPopup.css";

type ConfirmPopupProps = {
  message: ReactNode;
  onConfirm?: () => void;
  onCancel: () => void;
  infoOnly?: boolean;
};

export default function ConfirmPopup({
  message,
  onConfirm,
  onCancel,
  infoOnly = false,
}: ConfirmPopupProps) {
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [onCancel]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          background: "#848B78",
          color: "white",
          padding: "2rem",
          borderRadius: "1rem",
          boxShadow: "0 0 15px rgba(0, 0, 0, 0.3)",
          fontSize: "23px",
          fontWeight: 500,
          textAlign: "center",
          maxWidth: "90%",
          animation: "fadeIn 0.3s ease-out",
        }}
      >
        <p style={{ marginBottom: "1rem", whiteSpace: "pre-line" }}>
          {message}
        </p>

        <div
          style={{ display: "flex", justifyContent: "center", gap: "1rem" }}
        >
          {infoOnly ? (
            <button
              onClick={onCancel}
              style={{
                backgroundColor: "#dbe4d0",
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                margin: "10px",
              }}
            >
              U redu
            </button>
          ) : (
            <>
              <button
                onClick={onCancel}
                style={{
                  backgroundColor: "#dbe4d0",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  margin: "10px",
                }}
              >
                Odustani
              </button>
              <button
                onClick={onConfirm}
                style={{
                  backgroundColor: "#4caf50",
                  color: "white",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  margin: "10px",
                }}
              >
                Potvrdi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
