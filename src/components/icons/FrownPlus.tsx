import React from "react";

interface FrownPlusProps {
  size?: number;
  className?: string;
}

export const FrownPlus: React.FC<FrownPlusProps> = ({ size = 24, className = "" }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 9.05v-.1" />
      <path d="M16 9.05v-.1" />
      <path d="M16 16c-.5-1.5-1.79-3-4-3s-3.5 1.5-4 3" />
      <path d="M12 13v6" />
      <path d="M9 16h6" />
    </svg>
  );
};