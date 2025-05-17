import { useState, useEffect } from "react";
import { FaUser, FaUserShield, FaArrowCircleDown } from "react-icons/fa";
import Login from "./Login";
import AdminLogin from "./AdminLogin";
import "./App.css";
import logo from "./assets/logo-login.webp";
import ClientDashboard from "./ClientDashboard";
import "animate.css";
import AdminDashboard from "./AdminDashboard";

type View = "home" | "client" | "clientDashboard" | "admin" | "adminDashboard";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      console.log("💡 PWA install prompt je spreman!");
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          console.log("✅ Korisnik je prihvatio instalaciju");
        } else {
          console.log("❌ Korisnik je odbio instalaciju");
        }
        setDeferredPrompt(null);
      });
    }
  };

  const handleSelectRole = (role: "client" | "admin") => {
    setView(role);
  };

  const handleClientLoginSuccess = () => {
    setView("clientDashboard");
  };

  const handleAdminLoginSuccess = () => {
    setView("adminDashboard");
  };

  const renderHome = () => (
    <>
      <div className="app-wrapper" role="region" aria-labelledby="card-title">
        <div className="card-container">
          <div className="header">
            <img
              src={logo}
              alt="Gioia Pilates Studio logo"
              className="logo"
              loading="lazy"
            />
            <p className="tagline">
              Dobrodošli u Gioia Reformer Pilates Studio
            </p>
          </div>

          <hr className="divider" />

          <div className="button-grid">
            <button
              className="role-button"
              onClick={() => handleSelectRole("client")}
              aria-label="Prijava kao klijent"
            >
              <FaUser className="icon" />
              Klijent
            </button>
            <button
              className="role-button"
              onClick={() => handleSelectRole("admin")}
              aria-label="Prijava kao administrator"
            >
              <FaUserShield className="icon" />
              Admin
            </button>
          </div>

          {deferredPrompt && (
            <button className="install-button" onClick={handleInstallClick}>
              <FaArrowCircleDown style={{ marginRight: "8px" }} />
              Instaliraj aplikaciju
            </button>
          )}
        </div>
      </div>
      <footer className="app-footer">
        <a
          href="https://www.lematech-digital.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          LeMatech-Digital
        </a>{" "}
        © 2025
      </footer>
    </>
  );

  const renderClientLogin = () => (
    <div className="app-wrapper" role="region" aria-labelledby="client-login">
      <div className="card-container">
        <h2 id="client-login" className="title2">
          Klijent prijava
        </h2>
        <Login
          onLoginSuccess={handleClientLoginSuccess}
          onBackToHome={() => setView("home")}
        />
      </div>
    </div>
  );

  const renderAdminLogin = () => (
    <div className="app-wrapper" role="region" aria-labelledby="admin-login">
      <div className="card-container">
        <h2 id="admin-login" className="title2">
          Admin prijava
        </h2>
        <p
          className="adminlog"
          style={{
            color: "#ccc",
            fontSize: "0.9rem",
            marginTop: "15px",
            marginBottom: "1rem",
          }}
        >
          Ova sekcija je namijenjena samo za admina.
        </p>

        <AdminLogin
          onAdminLoginSuccess={handleAdminLoginSuccess}
          onBackToHome={() => setView("home")}
        />
      </div>
    </div>
  );

  return (
    <>
      {view === "home" && renderHome()}
      {view === "client" && renderClientLogin()}
      {view === "clientDashboard" && <ClientDashboard />}
      {view === "admin" && renderAdminLogin()}
      {view === "adminDashboard" && <AdminDashboard />}
    </>
  );
}

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }
}
