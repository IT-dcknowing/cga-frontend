import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/shared/form-dialog';
import { TextField } from '@/components/ui/text-field';
import { httpMembersApi as membersApi, type Sector } from '@/features/members/api/members-api';
import { useSectorProposed } from '@/features/members/api/queries';
import { ApiBusinessError } from '@/lib/api-errors';
import { showValidationErrors } from '@/lib/form-errors';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * « Proposer un secteur » (F-ADH-02, RG-REF-01) : le nom seul ; le serveur attribue le code et le
 * statut « proposé ». Le secteur rejoint la liste et devient celui du dossier.
 */
const labels = fr.members.create.sector;

const schema = z.object({
  name: z.string().trim().min(1, fr.members.create.errors.required),
});

export function ProposeSectorDialog({
  onClose,
  onProposed,
}: {
  onClose: () => void;
  onProposed: (sector: Sector) => void;
}) {
  const proposed = useSectorProposed();
  const [conflict, setConflict] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  const submit = handleSubmit(async ({ name }) => {
    setConflict(null);

    try {
      const sector = await membersApi.proposeSector(name);

      proposed(sector);
      toast.success(labels.done);
      onProposed(sector);
    } catch (error) {
      if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else if (!showValidationErrors(error, setError, { name: 'name' })) {
        toastUnexpectedError(error);
      }
    }
  });

  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={labels.title}
      description={labels.description}
      submitLabel={labels.submit}
      submitting={isSubmitting}
      onSubmit={submit}
      conflict={conflict}
    >
      <TextField
        id="sector-name"
        label={labels.name}
        required
        error={errors.name?.message}
        {...register('name')}
      />
    </FormDialog>
  );
}
