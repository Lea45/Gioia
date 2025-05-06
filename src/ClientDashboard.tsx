import { useState, useEffect } from "react";
import MyBookings from "./MyBookings";
import Schedule from "./Schedule";
import "./ClientDashboard.css";
import Profile from "./Profile";
import { FaCalendarAlt, FaCheckCircle, FaUser } from "react-icons/fa";

type NotificationPopupProps = {
  message: string;
  onClose: () => void;
};

function NotificationPopup({ message, onClose }: NotificationPopupProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        background: "white",
        padding: "1.5rem 2rem",
        borderRadius: "1rem",
        boxShadow: "0 0 15px rgba(0, 0, 0, 0.3)",
        zIndex: 1000,
        fontSize: "1rem",
        fontWeight: "500",
        textAlign: "center",
        animation: "fadeIn 0.3s ease-out",
      }}
    >
      {message}
    </div>
  );
}

export default function ClientDashboard() {
  const [activeTab, setActiveTab] = useState<string>("raspored");
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [popupMessage, setPopupMessage] = useState<string>("");

  const renderContent = () => {
    switch (activeTab) {
      case "raspored":
        return (
          <Schedule
            onReservationMade={() => setRefreshKey((k) => k + 1)}
            refreshKey={refreshKey}
            onShowPopup={(msg: string) => setPopupMessage(msg)}
          />
        );

      case "moji-termini":
        return (
          <MyBookings
            onChanged={(message: string) => {
              setRefreshKey((k) => k + 1);
              setPopupMessage(message);
            }}
          />
        );

      case "profil":
        return <Profile />;

      default:
        return null;
    }
  };

  return (
    <div className="client-dashboard" style={dashboardWrapper}>
      <div className="tab-bar">
        <button
          className={`tab-button ${activeTab === "raspored" ? "active" : ""}`}
          onClick={() => setActiveTab("raspored")}
        >
          <FaCalendarAlt /> Raspored
        </button>

        <button
          className={`tab-button ${
            activeTab === "moji-termini" ? "active" : ""
          }`}
          onClick={() => setActiveTab("moji-termini")}
        >
          <FaCheckCircle /> Termini
        </button>

        <button
          className={`tab-button ${activeTab === "profil" ? "active" : ""}`}
          onClick={() => setActiveTab("profil")}
        >
          <FaUser /> Profil
        </button>
      </div>

      <div style={{ marginTop: "2rem" }}>
        {renderContent()}
        {popupMessage && (
          <NotificationPopup
            message={popupMessage}
            onClose={() => setPopupMessage("")}
          />
        )}
      </div>
    </div>
  );
}

const dashboardWrapper: React.CSSProperties = {
  padding: "2rem",
};