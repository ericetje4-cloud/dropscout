// ===========================================================================
// Page Agent : conversation avec DropScout (boucle ReAct).
// =================================================================================================================================

import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { ChatMessageView } from '@/components/ChatMessage';
import { useToast } from '@/components/ui';
import { runAgent } from '@/lib/agent';
import { hasApiKey } from '@/lib/gemini';
import type { Attachment, ChatMessage } from '@/types';

const SUGGESTIONS = [
  'Trouve-moi 5 produits gagnants dans la niche "gadget cuisine"',
  'Analyse ce produit : lampe LED coucher de soleil, achat 8€, revente 29€',
  'Quelles niches sont tendance en ce moment ?',
  'Montre-moi ma watchlist',
];

export function AgentPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const built = await Promise.all(Array.from(files).map(fileToAttachment));
    setAttachments((prev) => [...prev, ...built]);
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if ((!content && attachments.length === 0) || busy) return;

    if (!hasApiKey()) {
      toast('Ajoute ta clé Gemini dans les Réglages.', 'warning');
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      createdAt: Date.now(),
      text: content,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
    const pendingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'model',
      createdAt: Date.now(),
      pending: true,
    };

    const history = messages;
    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setInput('');
    setAttachments([]);
    setBusy(true);

    try {
      const result = await runAgent({
        history,
        userText: content,
        attachments: userMsg.attachments ?? [],
        onStep: (step) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === pendingMsg.id ? { ...m, steps: [...(m.steps ?? []), step] } : m,
            ),
          );
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, pending: false, text: result.text, steps: result.steps, error: result.error }
            : m,
        ),
      );

      if (result.error) toast("L'agent a rencontré un problème.", 'error');
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id ? { ...m, pending: false, error: (e as Error).message } : m,
        ),
      );
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Agent">
      <div className="flex h-[calc(100vh-9rem)] flex-col sm:h-[calc(100vh-3.5rem)]">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-2">
          {messages.length === 0 ? (
            <Welcome onPick={(s) => void send(s)} />
          ) : (
            messages.map((m) => <ChatMessageView key={m.id} msg={m} />)
          )}
          {busy && (
            <div className="flex items-center gap-2 pl-11 text-xs text-slate-400">
              <Loader2 size={14} className="animate-spin" />
              DropScout réfléchit…
            </div>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-1 py-2 dark:border-slate-800">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative flex items-center gap-1.5 rounded-lg bg-slate-100 py-1 pl-2 pr-6 text-xs dark:bg-slate-800"
              >
                <ImageIcon size={12} />
                <span className="max-w-[140px] truncate">{a.name}</span>
                <button
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-1 rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  aria-label="Retirer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPickFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="btn-ghost shrink-0 p-2.5"
            aria-label="Joindre une image"
            title="Image du produit"
          >
            <ImageIcon size={18} />
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Trouve un produit, analyse une URL…"
            className="input max-h-32 flex-1 resize-none"
            disabled={busy}
          />

          <button
            onClick={() => void send()}
            disabled={busy || (!input.trim() && attachments.length === 0)}
            className="btn-primary shrink-0 p-2.5"
            aria-label="Envoyer"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </Layout>
  );
}

function Welcome({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-5 px-4 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white">
        <Sparkles size={30} />
      </div>
      <div>
        <h2 className="text-lg font-bold">DropScout 👋</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ton chasseur de produits gagnants. Demande-moi d'explorer une niche,
          d'analyser un produit, ou de gérer ta watchlist.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="card w-full px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700 dark:text-slate-200 dark:hover:text-brand-300"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Convertit un fichier image en Attachment (data-URL + vignette). */
async function fileToAttachment(file: File): Promise<Attachment> {
  const data = await readFileAsDataURL(file);
  return {
    id: crypto.randomUUID(),
    kind: 'image',
    name: file.name,
    mime: file.type,
    data,
    size: file.size,
    thumbnail: data,
  };
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Lecture du fichier impossible'));
    r.readAsDataURL(file);
  });
}
