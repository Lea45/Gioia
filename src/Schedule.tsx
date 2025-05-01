import { useEffect, useState } from 'react';
import ScheduleTable from './ScheduleTable';
import ScheduleCards from './ScheduleCards';

type Props = {
  onReservationMade: () => void;
  refreshKey: number;
  onShowPopup: (message: string) => void;
};

const Schedule = ({ onReservationMade, refreshKey, onShowPopup }: Props) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile ? (
    <ScheduleCards
      onReservationMade={onReservationMade}
      onShowPopup={onShowPopup}
    />
  ) : (
    <ScheduleTable
      onReservationMade={onReservationMade}
      refreshKey={refreshKey}
      onShowPopup={onShowPopup}
    />
  );
};

export default Schedule;