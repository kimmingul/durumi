/**
 * Inline SVG icon set for the Document-mode editor toolbar.
 *
 * Every icon is a small 16x16 `<svg>` that inherits color via `currentColor`,
 * so theming is automatic (the toolbar `.editor-toolbar-btn` sets `color`).
 * Stroke widths and corner radii are tuned to feel cohesive with the rest of
 * the Durumi chrome — close to lucide-react's visual weight without taking
 * the dependency.
 *
 * All icons accept a `size` prop for the rare callers that want a different
 * pixel size (e.g. a future popover header). Default is 16.
 */
import type { ReactElement } from 'react';

interface IconProps {
  size?: number;
}

function S(d: string, size = 16): ReactElement {
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
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

// Compose-helper: arbitrary inner children, same SVG envelope.
function Sg(children: ReactElement | ReactElement[], size = 16): ReactElement {
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
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconBold = ({ size }: IconProps = {}): ReactElement =>
  S('M7 4h6a3.5 3.5 0 0 1 0 7H7zM7 11h7a3.5 3.5 0 0 1 0 7H7z', size);

export const IconItalic = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="19" y1="4" x2="10" y2="4" />,
      <line key="2" x1="14" y1="20" x2="5" y2="20" />,
      <line key="3" x1="15" y1="4" x2="9" y2="20" />,
    ],
    size,
  );

export const IconStrike = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="4" y1="12" x2="20" y2="12" />,
      <path key="2" d="M16 6a4 4 0 0 0-4-2c-2.5 0-4 1.5-4 3.5 0 2 2 3 4 3.5" />,
      <path key="3" d="M8 18a4 4 0 0 0 4 2c2.5 0 4-1.5 4-3.5 0-1.2-.7-2.2-2-2.8" />,
    ],
    size,
  );

export const IconCode = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <polyline key="1" points="9 8 5 12 9 16" />,
      <polyline key="2" points="15 8 19 12 15 16" />,
    ],
    size,
  );

export const IconSuperscript = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <path key="1" d="M5 6l6 12" />,
      <path key="2" d="M11 6L5 18" />,
      <text key="3" x="15" y="9" fontSize="8" fill="currentColor" stroke="none">2</text>,
    ],
    size,
  );

export const IconSubscript = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <path key="1" d="M5 6l6 12" />,
      <path key="2" d="M11 6L5 18" />,
      <text key="3" x="15" y="21" fontSize="8" fill="currentColor" stroke="none">2</text>,
    ],
    size,
  );

export const IconBulletList = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="9" y1="6" x2="20" y2="6" />,
      <line key="2" x1="9" y1="12" x2="20" y2="12" />,
      <line key="3" x1="9" y1="18" x2="20" y2="18" />,
      <circle key="4" cx="5" cy="6" r="1.3" fill="currentColor" />,
      <circle key="5" cx="5" cy="12" r="1.3" fill="currentColor" />,
      <circle key="6" cx="5" cy="18" r="1.3" fill="currentColor" />,
    ],
    size,
  );

export const IconNumberedList = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="10" y1="6" x2="20" y2="6" />,
      <line key="2" x1="10" y1="12" x2="20" y2="12" />,
      <line key="3" x1="10" y1="18" x2="20" y2="18" />,
      <text key="4" x="3" y="9" fontSize="7" fill="currentColor" stroke="none">1.</text>,
      <text key="5" x="3" y="15" fontSize="7" fill="currentColor" stroke="none">2.</text>,
      <text key="6" x="3" y="21" fontSize="7" fill="currentColor" stroke="none">3.</text>,
    ],
    size,
  );

export const IconTaskList = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <rect key="1" x="3" y="4" width="6" height="6" rx="1" />,
      <polyline key="2" points="4.5 7 5.7 8.5 8 5.7" />,
      <rect key="3" x="3" y="14" width="6" height="6" rx="1" />,
      <line key="4" x1="12" y1="7" x2="20" y2="7" />,
      <line key="5" x1="12" y1="17" x2="20" y2="17" />,
    ],
    size,
  );

export const IconOutdent = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="11" y1="6" x2="20" y2="6" />,
      <line key="2" x1="11" y1="12" x2="20" y2="12" />,
      <line key="3" x1="11" y1="18" x2="20" y2="18" />,
      <polyline key="4" points="7 8 3 12 7 16" />,
    ],
    size,
  );

export const IconIndent = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="11" y1="6" x2="20" y2="6" />,
      <line key="2" x1="11" y1="12" x2="20" y2="12" />,
      <line key="3" x1="11" y1="18" x2="20" y2="18" />,
      <polyline key="4" points="3 8 7 12 3 16" />,
    ],
    size,
  );

export const IconLink = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <path key="1" d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />,
      <path key="2" d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />,
    ],
    size,
  );

export const IconImage = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <rect key="1" x="3" y="4" width="18" height="16" rx="2" />,
      <circle key="2" cx="8.5" cy="9.5" r="1.5" />,
      <polyline key="3" points="21 16 15 10 5 20" />,
    ],
    size,
  );

export const IconTable = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <rect key="1" x="3" y="4" width="18" height="16" rx="1" />,
      <line key="2" x1="3" y1="10" x2="21" y2="10" />,
      <line key="3" x1="3" y1="15" x2="21" y2="15" />,
      <line key="4" x1="9" y1="4" x2="9" y2="20" />,
      <line key="5" x1="15" y1="4" x2="15" y2="20" />,
    ],
    size,
  );

export const IconMath = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <polyline key="1" points="20 4 8 4 14 12 8 20 20 20" />,
    ],
    size,
  );

export const IconMathInline = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <text key="1" x="2" y="18" fontSize="20" fontStyle="italic" fontFamily="serif" fill="currentColor" stroke="none">x</text>,
      <text key="2" x="14" y="11" fontSize="9" fill="currentColor" stroke="none">2</text>,
    ],
    size,
  );

export const IconFootnote = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <text key="1" x="3" y="16" fontSize="12" fontFamily="serif" fill="currentColor" stroke="none">f</text>,
      <text key="2" x="11" y="11" fontSize="9" fill="currentColor" stroke="none">1</text>,
      <line key="3" x1="4" y1="20" x2="20" y2="20" />,
    ],
    size,
  );

export const IconCitation = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <circle key="1" cx="12" cy="12" r="9" />,
      <text key="2" x="7" y="16" fontSize="11" fontFamily="serif" fill="currentColor" stroke="none">@</text>,
    ],
    size,
  );

export const IconHighlight = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <path key="1" d="M4 19l4-1 9-9-3-3-9 9-1 4z" />,
      <line key="2" x1="12" y1="6" x2="18" y2="12" />,
    ],
    size,
  );

export const IconMemo = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <path key="1" d="M21 12a8 8 0 1 1-3.5-6.6L21 4l-1 4.5A8 8 0 0 1 21 12z" />,
    ],
    size,
  );

export const IconCmInsert = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="12" y1="5" x2="12" y2="19" />,
      <line key="2" x1="5" y1="12" x2="19" y2="12" />,
    ],
    size,
  );

export const IconCmDelete = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="5" y1="12" x2="19" y2="12" />,
    ],
    size,
  );

export const IconCmSubstitute = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <polyline key="1" points="4 8 18 8 14 4" />,
      <polyline key="2" points="20 16 6 16 10 20" />,
    ],
    size,
  );

export const IconCmComment = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <path key="1" d="M21 5h-18v12h6l3 3 3-3h6z" />,
    ],
    size,
  );

export const IconHorizontalRule = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="3" y1="12" x2="21" y2="12" />,
    ],
    size,
  );

export const IconMermaid = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <circle key="1" cx="5" cy="6" r="2" />,
      <circle key="2" cx="19" cy="6" r="2" />,
      <circle key="3" cx="12" cy="18" r="2" />,
      <line key="4" x1="6.5" y1="7.3" x2="10.7" y2="16.5" />,
      <line key="5" x1="17.5" y1="7.3" x2="13.3" y2="16.5" />,
    ],
    size,
  );

export const IconToc = ({ size }: IconProps = {}): ReactElement =>
  Sg(
    [
      <line key="1" x1="4" y1="6" x2="20" y2="6" />,
      <line key="2" x1="8" y1="11" x2="20" y2="11" />,
      <line key="3" x1="8" y1="16" x2="16" y2="16" />,
      <text key="4" x="3" y="13" fontSize="8" fill="currentColor" stroke="none">#</text>,
    ],
    size,
  );
