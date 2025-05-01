import ScheduleAdmin from "./ScheduleAdmin";
import "./CalendarManagement.css";

export default function CalendarManagement() {
  return (
    <div className="calendar-management-container">
      <h2>Upravljanje Terminima</h2>{" "}
      <div className="calendar-schedule">
        <ScheduleAdmin />
      </div>
    </div>
  );
}
