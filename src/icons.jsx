import React from 'react';

const Icon = ({ children, size = 18, stroke = 'currentColor', strokeWidth = 1.75, fill = 'none', ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={stroke}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const Plus = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const Sidebar = (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></Icon>;
export const Edit = (p) => <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>;
export const Search = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>;
export const Globe = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>;
export const Settings = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></Icon>;
export const ChevronDown = (p) => <Icon {...p}><polyline points="6 9 12 15 18 9" /></Icon>;
export const ChevronRight = (p) => <Icon {...p}><polyline points="9 18 15 12 9 6" /></Icon>;
export const X = (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
export const Check = (p) => <Icon {...p}><polyline points="20 6 9 17 4 12" /></Icon>;
export const Send = (p) => <Icon {...p}><path d="M5 12h14M13 5l7 7-7 7" /></Icon>;
export const ArrowUp = (p) => <Icon {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Icon>;
export const Stop = (p) => <Icon {...p} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" /></Icon>;
export const Image = (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></Icon>;
export const Paperclip = (p) => <Icon {...p}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.83l-8.59 8.57a2 2 0 1 1-2.83-2.83l8.49-8.48" /></Icon>;
export const Sparkle = (p) => <Icon {...p}><path d="M12 3 13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /></Icon>;
export const Brain = (p) => <Icon {...p}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44A2.5 2.5 0 0 1 4 17.5a2.5 2.5 0 0 1-1.98-2.65A2.5 2.5 0 0 1 4 10a2.5 2.5 0 0 1 1.04-3.84A2.5 2.5 0 0 1 9.5 2zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44A2.5 2.5 0 0 0 20 17.5a2.5 2.5 0 0 0 1.98-2.65A2.5 2.5 0 0 0 20 10a2.5 2.5 0 0 0-1.04-3.84A2.5 2.5 0 0 0 14.5 2z" /></Icon>;
export const Trash = (p) => <Icon {...p}><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M10 11v6M14 11v6" /></Icon>;
export const Pin = (p) => <Icon {...p}><path d="M12 17v5M9 10.76l-3.42 3.42a1 1 0 0 0 0 1.41l1.41 1.41a1 1 0 0 0 1.41 0L11.83 13.6M14.5 8.5l-7 7M14.83 9.17l4.95-4.95a2 2 0 0 0-2.83-2.83l-4.95 4.95" /></Icon>;
export const PinFilled = (p) => <Icon {...p} fill="currentColor"><path d="M12 17v5" /><path d="M14.83 2.17l7 7-5 5L12 9l-2.5 2.5-2.5-2.5L12 4.5z" /></Icon>;
export const More = (p) => <Icon {...p}><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></Icon>;
export const Copy = (p) => <Icon {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Icon>;
export const Refresh = (p) => <Icon {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" /></Icon>;
export const ThumbUp = (p) => <Icon {...p}><path d="M7 11v9a1 1 0 0 0 1 1h2l3-3v-9l-1-7H10a3 3 0 0 0-3 3zM7 11H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3" /></Icon>;
export const ThumbDown = (p) => <Icon {...p}><path d="M17 13V4a1 1 0 0 0-1-1h-2l-3 3v9l1 7h2a3 3 0 0 0 3-3zM17 13h3a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-3" /></Icon>;
export const User = (p) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
export const Users = (p) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
export const Logout = (p) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Icon>;
export const Eye = (p) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const EyeOff = (p) => <Icon {...p}><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A11 11 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20" /></Icon>;
export const Code = (p) => <Icon {...p}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></Icon>;
export const FileText = (p) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></Icon>;
export const BarChart = (p) => <Icon {...p}><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></Icon>;
export const Key = (p) => <Icon {...p}><circle cx="8" cy="15" r="4" /><path d="m10.85 12.15 8.65-8.65M19 7l2 2M14 12l2 2" /></Icon>;
export const Cube = (p) => <Icon {...p}><path d="m21 16-9 5-9-5V8l9-5 9 5z" /><path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12" /></Icon>;
export const Bot = (p) => <Icon {...p}><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4M8 16h.01M16 16h.01" /></Icon>;
export const Power = (p) => <Icon {...p}><path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10" /></Icon>;
export const Link = (p) => <Icon {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Icon>;
export const Loader = (p) => <Icon {...p}><path d="M21 12a9 9 0 1 1-6.22-8.56" /></Icon>;
export const Sun = (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Icon>;
export const Moon = (p) => <Icon {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Icon>;
export const Shield = (p) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Icon>;
export const Database = (p) => <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4 3 9 3s9-1.34 9-3" /></Icon>;
