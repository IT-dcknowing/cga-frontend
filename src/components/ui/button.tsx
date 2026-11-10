import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/*
 * Bouton (maquette v4.1 & 04-UX-UI §6) :
 * - default/primary : fond green (#1E6A4E), texte blanc, hover opacity .9
 * - outline/ghost : fond transparent, contour 1px green, texte green
 * - danger : contour 1px orange (#E5732A), texte orange
 * - taille md : 13.5px / 700, padding 9x16 ; sm : 12px, padding 5x10 ; rayon 6px ; désactivé à 50%
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-bold transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:opacity-90',
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'border border-border bg-card text-ink hover:bg-neutral-soft',
        ghost: 'border border-primary bg-transparent text-primary hover:bg-primary-soft/40',
        outline: 'border border-primary bg-transparent text-primary hover:bg-primary-soft/40',
        danger: 'bg-danger text-danger-foreground hover:bg-danger/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        md: 'h-11 px-4 py-2 text-[13.5px] md:h-10',
        sm: 'h-11 px-2.5 py-1 text-[12px] md:h-8',
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
export { buttonVariants };
