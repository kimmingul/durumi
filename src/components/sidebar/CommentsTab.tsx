import { useDocComments } from '../../hooks/useDocComments';
import { useLanguage, t } from '../../i18n/t';
import type { Comment } from '@shared/comments';

interface CommentsTabProps {
  content: string;
  onJump: (line: number) => void;
}

const KNOWN_TAGS = new Set(['ai', 'todo', 'reviewer', 'stats']);

function tagClassFragment(tag: string | null): string {
  if (!tag) return 'untagged';
  return KNOWN_TAGS.has(tag) ? tag : 'other';
}

const PREVIEW_MAX = 80;

function buildPreview(c: Comment): string {
  const text = c.text.replace(/\s+/g, ' ').trim();
  if (text.length <= PREVIEW_MAX) return text;
  return text.slice(0, PREVIEW_MAX - 1).trimEnd() + '…';
}

export function CommentsTab({ content, onJump }: CommentsTabProps) {
  const list = useDocComments(content);
  // Subscribe to language so labels re-render on switch.
  useLanguage();

  if (list.length === 0) {
    return <div className="cm-comments-empty">{t('sidebar.empty.comments')}</div>;
  }

  return (
    <div className="cm-comments" role="list">
      {list.map((c, i) => (
        <button
          key={`${c.line}-${i}`}
          className="cm-comments-row"
          role="listitem"
          onClick={() => onJump(c.line)}
        >
          <span className={`cm-comments-chip cm-comments-chip-${tagClassFragment(c.tag)}`}>
            {c.tag ? `@${c.tag}` : t('comment.untagged')}
          </span>
          <span className="cm-comments-preview">{buildPreview(c)}</span>
          <span className="cm-comments-line">L{c.line}</span>
        </button>
      ))}
    </div>
  );
}
