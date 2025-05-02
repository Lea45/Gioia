import ScheduleAdmin from "./ScheduleAdmin";
import "./CalendarManagement.css";

export default function CalendarManagement() {
  return (
    <div className="calendar-management-container">
      {" "}
      <div className="calendar-schedule">
        <ScheduleAdmin />
      </div>
    </div>
  );
}
