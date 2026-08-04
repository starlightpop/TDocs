// 内联 SVG 图标库
const p = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export const Icons = {
  plus: (
    <svg viewBox="0 0 24 24" {...p}><path d="M12 5v14M5 12h14" /></svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" {...p}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" /></svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" {...p}><path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z" /></svg>
  ),
  monitor: (
    <svg viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M9 21h6M12 17v4" /></svg>
  ),
  outline: (
    <svg viewBox="0 0 24 24" {...p}><path d="M4 6h16M8 12h12M8 18h12" /><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
  ),
  chevronDown: (
    <svg viewBox="0 0 24 24" {...p}><path d="m6 9 6 6 6-6" /></svg>
  ),
  sparkle: (
    <svg viewBox="0 0 24 24" {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" /></svg>
  ),
  folder: (
    <svg viewBox="0 0 24 24" {...p}><path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
  ),
  sidebar: (
    <svg viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
  ),
  undo: (
    <svg viewBox="0 0 24 24" {...p}><path d="M8 5 3 10l5 5" /><path d="M3 10h11a6 6 0 0 1 0 12h-4" /></svg>
  ),
  redo: (
    <svg viewBox="0 0 24 24" {...p}><path d="m16 5 5 5-5 5" /><path d="M21 10H10a6 6 0 0 0 0 12h4" /></svg>
  ),
  bold: (
    <svg viewBox="0 0 24 24" {...p}><path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z" /></svg>
  ),
  italic: (
    <svg viewBox="0 0 24 24" {...p}><path d="M19 4h-9M14 20H5M15 4 9 20" /></svg>
  ),
  underline: (
    <svg viewBox="0 0 24 24" {...p}><path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16" /></svg>
  ),
  strike: (
    <svg viewBox="0 0 24 24" {...p}><path d="M4 12h16M17.5 7.5c-.8-2-2.8-3-5.4-3C9.3 4.5 7.5 6 7.5 8c0 1.2.6 2 1.8 2.8M6.5 16.5c.8 2 2.9 3 5.6 3 2.8 0 4.6-1.5 4.6-3.5 0-1-.4-1.8-1.3-2.5" /></svg>
  ),
  highlight: (
    <svg viewBox="0 0 24 24" {...p}><path d="m9 11-6 6v3h3l6-6M9 11l7-7 4 4-7 7M9 11l5.5 5.5" /></svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" {...p}><path d="M10 14a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1l-1.4 1.4" /><path d="M14 10a5 5 0 0 0-7.1 0l-2.8 2.8a5 5 0 0 0 7.1 7.1l1.4-1.4" /></svg>
  ),
  alignLeft: (
    <svg viewBox="0 0 24 24" {...p}><path d="M4 6h16M4 12h10M4 18h13" /></svg>
  ),
  alignCenter: (
    <svg viewBox="0 0 24 24" {...p}><path d="M4 6h16M7 12h10M5.5 18h13" /></svg>
  ),
  alignRight: (
    <svg viewBox="0 0 24 24" {...p}><path d="M4 6h16M10 12h10M7 18h13" /></svg>
  ),
  bulletList: (
    <svg viewBox="0 0 24 24" {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" /></svg>
  ),
  orderedList: (
    <svg viewBox="0 0 24 24" {...p}><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.8 11.2c.4-.8 2.4-.9 2.4.2 0 .9-2.4 1.3-2.4 2.6h2.7M4 16.5h2c.8 0 .8 2-.5 2 1.3 0 1.3 2 .4 2H4" /></svg>
  ),
  taskList: (
    <svg viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="7" height="7" rx="1.5" /><path d="m4.8 7.5 1.4 1.4 2.3-2.6" /><rect x="3" y="13" width="7" height="7" rx="1.5" /><path d="M14 7h7M14 17h7" /></svg>
  ),
  quote: (
    <svg viewBox="0 0 24 24" {...p}><path d="M8 6C5.8 6 4 7.8 4 10c0 3 1.8 5.5 4.5 7l.9-1.3C7.6 14.5 6.8 13.4 6.6 12H9V6zM18 6c-2.2 0-4 1.8-4 4 0 3 1.8 5.5 4.5 7l.9-1.3c-1.8-1.2-2.6-2.3-2.8-3.7H19V6z" fill="currentColor" stroke="none" /></svg>
  ),
  codeBlock: (
    <svg viewBox="0 0 24 24" {...p}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14" /></svg>
  ),
  hr: (
    <svg viewBox="0 0 24 24" {...p}><path d="M3 12h18" /></svg>
  ),
  table: (
    <svg viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="9.5" r="1.6" /><path d="m4 18 5-5 3 3 4-4 4 4" /></svg>
  ),
  eraser: (
    <svg viewBox="0 0 24 24" {...p}><path d="m7 20 -4-4L13.5 5.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L9 20h-2zM7 20h14" /></svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" {...p}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
  ),
  dots: (
    <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8" fill="currentColor" /><circle cx="12" cy="12" r="1.8" fill="currentColor" /><circle cx="19" cy="12" r="1.8" fill="currentColor" /></svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3.2" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.07-.4.1-.8.1-1.2z" /></svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" {...p}><path d="M6 2h8l5 5v15H6z" /><path d="M14 2v5h5M9 12h7M9 16h7" /></svg>
  ),
}

export function Icon({ name, size = 18, style }) {
  return (
    <span style={{ display: 'inline-flex', width: size, height: size, ...style }} aria-hidden>
      {Icons[name]}
    </span>
  )
}
