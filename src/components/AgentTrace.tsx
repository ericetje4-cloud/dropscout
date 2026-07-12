// ===========================================================================
// AgentTrace : affiche la trace de raisonnement ReAct (Thought / Action /
// Observation) d'un message modèle. Repliable.
// ===========================================================================

import { useState } from 'react';
import { ChevronRight, ChevronDown, Brain, Wrench, Eye, Lightbulb } from 'lucide-react';
import type { AgentStep } from '@/types';

export function AgentTrace({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  // On n'affiche pas la réponse finale dans la trace (déjà dans le corps).
  const inner = steps.filter((s) => s.type !== 'answer');
  if (inner.length === 0) return null;

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Brain size={14} />
        <span>
          Raisonnement ({inner.length} étape{inner.length > 1 ? 's' : ''})
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {inner.map((step, i) => (
            <StepLine key={i} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepLine({ step }: { step: AgentStep }) {
  if (step.type === 'thought') {
    return (
      <div className="flex gap-2 text-xs">
        <Brain size={13} className="mt-0.5 shrink-0 text-brand-500" />
        <div>
          <span className="font-semibold text-brand-600 dark:text-brand-400">Pensée</span>
          {step.text && (
            <p className="mt-0.5 text-slate-600 dark:text-slate-300">{step.text}</p>
          )}
        </div>
      </div>
    );
  }
  if (step.type === 'action') {
    return (
      <div className="flex gap-2 text-xs">
        <Wrench size={13} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="min-w-0">
          <span className="font-semibold text-amber-600 dark:text-amber-400">
            Action : {step.toolName}
          </span>
          {step.args && Object.keys(step.args).length > 0 && (
            <pre className="mt-0.5 overflow-x-auto rounded bg-slate-100 p-1.5 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              {JSON.stringify(step.args, null, 0)}
            </pre>
          )}
        </div>
      </div>
    );
  }
  if (step.type === 'observation') {
    return (
      <div className="flex gap-2 text-xs">
        <Eye size={13} className="mt-0.5 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <span className="font-semibold text-slate-500">Observation : {step.toolName}</span>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">
            {step.result}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2 text-xs">
      <Lightbulb size={13} className="mt-0.5 shrink-0 text-green-500" />
      <span className="text-slate-600 dark:text-slate-300">{step.text}</span>
    </div>
  );
}
