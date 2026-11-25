import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { trainingKeys, type Training } from '@/features/trainings/api/trainings-api';
import { ApiBusinessError, ApiValidationError } from '@/lib/api-errors';
import { formatNumber } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

/*
 * Outils partagés des écrans de formations (étape 7.5) : libellés d'un public, lieu ou lien, places,
 * session à venir, envoi d'une modale (422 par champ, 409 en bandeau, autre erreur en toast).
 */
const labels = fr.trainings;

export function audienceLabel(audience: Training['audiences'][number]): string {
  return audience.regime === null
    ? (labels.audiences[audience.type] ?? audience.label)
    : labels.regime(audience.regime);
}

export function placeOf(training: Pick<Training, 'location' | 'online_url'>): string | null {
  return training.location ?? training.online_url;
}

/** Places : « 12 / 30 inscrits », liste d'attente et inscriptions à valider. */
export function seatsLine(training: Training): string {
  const { seats } = training;
  const parts = [
    training.capacity === null
      ? labels.list.unlimited(formatNumber(seats.registered))
      : labels.list.seats(formatNumber(seats.registered), formatNumber(training.capacity)),
  ];

  if (seats.waitlisted > 0) {
    parts.push(labels.list.waitlisted(formatNumber(seats.waitlisted)));
  }
  if (seats.pending > 0) {
    parts.push(labels.list.pending(formatNumber(seats.pending)));
  }

  return parts.join(' · ');
}

/**
 * Session publiée qui n'a pas commencé : inscriptions et désinscriptions proposées (le serveur refait le
 * contrôle, délai J-n compris, RG-FOR-04).
 */
export function upcoming(training: { status: string; starts_at: string }): boolean {
  return training.status === 'published' && new Date(training.starts_at).getTime() > Date.now();
}

export function closeOn(onClose: () => void) {
  return (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
}

type Errors = Record<string, string | undefined>;

/** Erreurs de champ (422), conflit (409) ou toast ; les formations sont relues après succès. */
export function useTrainingSubmit() {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Errors>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setConflict(null);
    setSubmitting(true);
    try {
      const result = await action();

      await queryClient.invalidateQueries({ queryKey: trainingKeys.all });

      return result;
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setErrors(error.fields);
      } else if (error instanceof ApiBusinessError) {
        setConflict(error.message);
      } else {
        toastUnexpectedError(error);
      }

      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return { errors, setErrors, conflict, submitting, run };
}
