import { Lock, Paperclip } from 'lucide-react';
import type { ConcernMessage } from '@/features/concerns/api/concerns-api';
import { formatTimestamp } from '@/lib/format';
import { fr } from '@/lib/i18n/fr';
import { cn } from '@/lib/utils';

/*
 * `ConversationThread` (04-UX-UI §6) : messages en bulles — demandeur à gauche (fond blanc),
 * organisation à droite (fond `primary-soft`) ; notes internes sur fond `accent-soft` avec un cadenas
 * « Note interne » ; messages système en note centrée ; pièces jointes en liens de téléchargement.
 */
const labels = fr.concerns.thread;

export function ConversationThread({ messages }: { messages: ConcernMessage[] }) {
  return (
    <ol aria-label={labels.caption} className="grid gap-3">
      {messages.map((message) => {
        if (message.system) {
          return (
            <li key={message.id} className="text-center text-note text-muted">
              {message.body} · {formatTimestamp(message.created_at)}
            </li>
          );
        }

        const handler = message.side === 'handler';
        const internal = message.internal === true;

        return (
          <li key={message.id} className={cn('flex', handler ? 'justify-end' : 'justify-start')}>
            <article
              aria-label={`${message.author.name}, ${formatTimestamp(message.created_at)}`}
              className={cn(
                'grid max-w-[85%] gap-1 rounded-card border px-3 py-2',
                internal
                  ? 'border-accent bg-accent-soft'
                  : handler
                    ? 'border-primary-soft bg-primary-soft'
                    : 'border-border bg-card',
              )}
            >
              <span className="flex flex-wrap items-center gap-2 text-note text-muted">
                {internal ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-accent-text">
                    <Lock className="size-3.5" aria-hidden="true" />
                    {labels.internal}
                  </span>
                ) : null}
                {message.copied ? <span className="font-semibold">{labels.copied}</span> : null}
                <span className="font-semibold text-ink">{message.author.name}</span>
                <span>{formatTimestamp(message.created_at)}</span>
              </span>
              <p className="whitespace-pre-line text-body">{message.body}</p>
              {message.attachments.length === 0 ? null : (
                <ul className="grid gap-0.5">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-note text-primary underline"
                        aria-label={labels.attachment(attachment.name)}
                      >
                        <Paperclip className="size-3.5" aria-hidden="true" />
                        {attachment.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
