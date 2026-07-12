// ===========================================================================
// ChatMessage : rendu d'un message de conversation (user ou model).
// Inclut pièces jointes (user), texte, trace ReAct (model).
// ===========================================================================

import { Sparkles, User, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '@/types';
import { AgentTrace } from './AgentTrace';
import { formatTime } from '@/lib/format';

export function ChatMessageView({ msg }: { msg: ChatMessageType }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200'
            : 'bg-brand-600 text-white'
        }`}
      >
        {isUser ? <User size={16} /> : <Sparkles size={16} />}
      </div>

      <div className={`min-w-0 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Pièces jointes (user) */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {msg.attachments.map((a) =>
              a.kind === 'image' && a.thumbnail ? (
                <img
                  key={a.id}
                  src={a.thumbnail}
                  alt={a.name}
                  className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                />
              ) : (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  <ImageIcon size={14} />
                  <span className="max-w-[120px] truncate">{a.name}</span>
                </div>
              ),
            )}
          </div>
        )}

        {/* Texte */}
        {msg.text && (
          <div
            className={`rounded-2xl px-3.5 py-2.5 text-sm ${
              isUser
                ? 'bg-brand-600 text-white'
                : 'bg-white shadow-card dark:bg-slate-900 dark:text-slate-100'
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
          </div>
        )}

        {/* Trace ReAct (model) */}
        {!isUser && msg.steps && msg.steps.length > 0 && <AgentTrace steps={msg.steps} />}

        {/* Erreur */}
        {msg.error && (
          <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <AlertTriangle size={14} />
            <span>{msg.error}</span>
          </div>
        )}

        <div className={`mt-1 flex items-center gap-2 text-[10px] text-slate-400 ${isUser ? 'justify-end' : ''}`}>
          <span>{formatTime(msg.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
