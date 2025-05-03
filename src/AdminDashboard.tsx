import { useState } from 'react';
import CalendarManagement from './CalendarManagement';
import UserManagement from './UserManagement';
import StatusManagement from './StatusManagement';
import './AdminDashboard.css';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'status' | 'users'>('calendar');

  const handleLogout = () => {
    localStorage.removeItem('admin');
    window.location.reload();
  };

  return (
    <div className="admin-dashboard">

      <div className="tab-buttons">
        <button className={`tab-button ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
          Termini
        </button>
        <button className={`tab-button ${activeTab === 'status' ? 'active' : ''}`} onClick={() => setActiveTab('status')}>
          Status
        </button>
        <button className={`tab-button ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          Korisnici
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'calendar' && <CalendarManagement />}
        {activeTab === 'status' && <StatusManagement />}
        {activeTab === 'users' && <UserManagement />}
      </div>

      <button onClick={handleLogout} className="logout-button">
        Odjavi se
      </button>
    </div>
  );
}
