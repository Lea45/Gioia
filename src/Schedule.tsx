import ScheduleCards from "./ScheduleCards";

type Props = {
  onReservationMade: () => void;
  refreshKey: number;
  onShowPopup: (message: string) => void;
};

const Schedule = ({ onReservationMade, refreshKey, onShowPopup }: Props) => {
  return (
    <ScheduleCards
      onReservationMade={onReservationMade}
      onShowPopup={onShowPopup}
    />
  );
};

export default Schedule;
