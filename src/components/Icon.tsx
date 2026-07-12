// ===========================================================================
// Composant Icon : rend une icône Lucide-react à partir de son nom.
// ===========================================================================

import { icons, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';

export interface IconProps extends LucideProps {
  /** Nom de l'icône Lucide, ex. "ShoppingCart", "TrendingUp". */
  name: string;
  /** Fallback si le nom est introuvable. */
  fallback?: string;
}

export function Icon({ name, fallback = 'Circle', ...props }: IconProps) {
  const key = resolveIconKey(name) ?? resolveIconKey(fallback) ?? 'Circle';
  const Cmp = (icons as Record<string, ComponentType<LucideProps>>)[key] ?? icons.Circle;
  return <Cmp {...props} />;
}

/** Vérifie qu'un nom d'icône existe dans Lucide. */
export function iconExists(name: string): boolean {
  return !!resolveIconKey(name);
}

function resolveIconKey(name: string): string | undefined {
  if (!name) return undefined;
  if (name in icons) return name;
  const pascal = toPascalCase(name);
  if (pascal in icons) return pascal;
  return undefined;
}

function toPascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}
