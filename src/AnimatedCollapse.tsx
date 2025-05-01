import { useRef, useEffect, useState } from 'react';

const AnimatedCollapse = ({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: React.ReactNode;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [isOpen, children]);

  return (
    <div
      style={{
        maxHeight: isOpen ? height : 0,
        overflow: 'hidden',
        transition: 'max-height 0.3s ease',
        opacity: isOpen ? 1 : 0,
      }}
    >
      <div ref={contentRef} style={{ paddingTop: isOpen ? '10px' : '0' }}>
        {children}
      </div>
    </div>
  );
};

export default AnimatedCollapse;
