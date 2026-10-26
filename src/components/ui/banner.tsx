import { cva, type VariantProps } from 'class-variance-authority';
import { CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// 04-UX-UI §6 (Banner) : pleine largeur, bordure gauche de 4 px, icône + texte + action éventuelle.
const bannerVariants = cva(
  'flex w-full items-start gap-3 rounded-card border border-border border-l-4 px-4 py-3 text-body',
  {
    variants: {
      tone: {
        warning: 'border-l-accent bg-accent-soft text-accent-text',
        danger: 'border-l-danger bg-danger-soft text-danger',
        success: 'border-l-primary bg-primary-soft text-primary-dark',
      },
    },
    defaultVariants: {
      tone: 'warning',
    },
  },
);

const icons = {
  warning: TriangleAlert,
  danger: OctagonAlert,
  success: CircleCheck,
} as const;

type BannerProps = ComponentProps<'div'> &
  VariantProps<typeof bannerVariants> & {
    /** Action facultative affichée à droite du texte (un bouton, un lien). */
    action?: ComponentProps<'div'>['children'];
  };

export function Banner({ className, tone, action, children, ...props }: BannerProps) {
  const Icon = icons[tone ?? 'warning'];

  return (
    <div data-slot="banner" className={cn(bannerVariants({ tone }), className)} {...props}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">{children}</p>
      {action}
    </div>
  );
}
