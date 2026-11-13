import type React from "react";

export function CommunityIcon(): React.ReactElement {
  return (
    <span className="community-icon" aria-hidden="true">
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 17 10 11 14 15 20 6" />
        <path d="M14 6h6v6" />
      </svg>
    </span>
  );
}
