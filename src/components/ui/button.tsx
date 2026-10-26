import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// 04-UX-UI §6 : primary, secondary (fond blanc, bordure), danger, link ; md 40 px, sm 32 px,
// 44 px sous 768 px pour les cibles tactiles (04-UX-UI §4).
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-dark',
        secondary: 'border border-border bg-card text-ink hover:bg-neutral-soft',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        md: 'h-11 px-4 text-table md:h-10',
        sm: 'h-11 px-3 text-label md:h-8',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 md:h-auto' }],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Applique le style au seul enfant (un lien, par exemple) au lieu d'un <button>. */
    asChild?: boolean;
    /** Opération en cours : indicateur, libellé conservé, bouton désactivé. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : (type ?? 'button')}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}
