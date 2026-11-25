import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { Textarea } from '@/components/ui/textarea';
import {
  permanentProfileApi,
  permanentProfileKeys,
  type PermanentPerson,
  type PermanentPersonInput,
  type PermanentProfile,
} from '@/features/internal/api/permanent-profile-api';
import { ApiValidationError } from '@/lib/api-errors';
import { formatAmount, formatDate } from '@/lib/format';
import { toastUnexpectedError } from '@/lib/http-error-toast';
import { fr } from '@/lib/i18n/fr';

const labels = fr.permanentProfile;

function blankPerson(): PermanentPersonInput {
  return {
    kind: 'employee', full_name: '', nationality: null, profession: null, diplomas: null,
    function_in_cga: null, start_date: null, practice_structure: null, practice_function: null,
    practice_years: null, cnps_declared: null, active: true, end_date: null,
  };
}

function PersonForm({
  person,
  onSaved,
  onCancel,
}: {
  person: PermanentPerson | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<PermanentPersonInput>(() => person === null ? blankPerson() : {
    kind: person.kind, full_name: person.full_name, nationality: person.nationality,
    profession: person.profession, diplomas: person.diplomas, function_in_cga: person.function_in_cga,
    start_date: person.start_date, practice_structure: person.practice_structure,
    practice_function: person.practice_function, practice_years: person.practice_years,
    cnps_declared: person.cnps_declared, active: person.active, end_date: person.end_date,
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const change = (key: keyof PermanentPersonInput, next: string | number | boolean | null) =>
    setValue((current) => ({ ...current, [key]: next }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await permanentProfileApi.savePerson(value, person?.id);
      await client.invalidateQueries({ queryKey: permanentProfileKeys.all });
      toast.success(person === null ? labels.added : labels.updated);
      onSaved();
    } catch (error) {
      if (error instanceof ApiValidationError) setErrors(error.fields);
      else toastUnexpectedError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-card border border-border p-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
      <label className="grid gap-1 text-label text-ink">{labels.kind}
        <select className="h-11 rounded-control border border-border bg-card px-3" value={value.kind} onChange={(event) => change('kind', event.target.value as PermanentPersonInput['kind'])}>
          {Object.entries(labels.kinds).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </label>
      <TextField id="permanent-name" label={labels.name} required value={value.full_name} error={errors.full_name} onChange={(event) => change('full_name', event.target.value)} />
      <TextField id="permanent-nationality" label={labels.nationality} value={value.nationality ?? ''} onChange={(event) => change('nationality', event.target.value || null)} />
      <TextField id="permanent-profession" label={labels.profession} value={value.profession ?? ''} onChange={(event) => change('profession', event.target.value || null)} />
      <TextField id="permanent-diplomas" label={labels.diplomas} value={value.diplomas ?? ''} onChange={(event) => change('diplomas', event.target.value || null)} />
      <TextField id="permanent-function" label={labels.function} value={value.function_in_cga ?? ''} onChange={(event) => change('function_in_cga', event.target.value || null)} />
      <TextField id="permanent-start" type="date" label={labels.startDate} value={value.start_date ?? ''} error={errors.start_date} onChange={(event) => change('start_date', event.target.value || null)} />
      <TextField id="permanent-practice-structure" label={labels.practiceStructure} value={value.practice_structure ?? ''} onChange={(event) => change('practice_structure', event.target.value || null)} />
      <TextField id="permanent-practice-function" label={labels.practiceFunction} value={value.practice_function ?? ''} onChange={(event) => change('practice_function', event.target.value || null)} />
      <TextField id="permanent-practice-years" type="number" min={0} max={80} label={labels.practiceYears} value={value.practice_years ?? ''} error={errors.practice_years} onChange={(event) => change('practice_years', event.target.value === '' ? null : Number(event.target.value))} />
      <label className="flex items-center gap-2 text-label text-ink"><input type="checkbox" checked={value.cnps_declared ?? false} onChange={(event) => change('cnps_declared', event.target.checked)} />{labels.cnps}</label>
      <label className="flex items-center gap-2 text-label text-ink"><input type="checkbox" checked={value.active} onChange={(event) => change('active', event.target.checked)} />{labels.active}</label>
      {!value.active && <TextField id="permanent-end" type="date" label={labels.endDate} required value={value.end_date ?? ''} error={errors.end_date} onChange={(event) => change('end_date', event.target.value || null)} />}
      <div className="flex gap-2 md:col-span-2"><Button type="submit" loading={busy}>{labels.save}</Button><Button type="button" variant="secondary" onClick={onCancel}>{fr.common.cancel}</Button></div>
    </form>
  );
}

function PersonRow({ person, canManage }: { person: PermanentPerson; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <PersonForm person={person} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-3 last:border-0">
      <div><p className="font-semibold">{person.full_name}</p><p className="text-note text-muted">{person.kind_label}{person.function_in_cga ? ` · ${person.function_in_cga}` : ''} · {person.active ? labels.statuses.active : labels.statuses.inactive}</p>
        <p className="text-note text-muted">{[person.nationality, person.profession, person.diplomas].filter(Boolean).join(' · ') || fr.common.notProvided}</p>
        {person.start_date && <p className="text-note text-muted">{labels.startDate} : {formatDate(person.start_date)}{person.end_date ? ` · ${labels.endDate} : ${formatDate(person.end_date)}` : ''}</p>}
      </div>
      {canManage && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />{labels.edit}</Button>}
    </li>
  );
}

function ResourceForm({ resource, canManage }: { resource: PermanentProfile['resources'][number]; canManage: boolean }) {
  const [quantity, setQuantity] = useState(String(resource.entry?.quantity ?? 0));
  const [description, setDescription] = useState(resource.entry?.description ?? '');
  const [need, setNeed] = useState(resource.entry?.need ?? '');
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await permanentProfileApi.saveResource(resource.category, { quantity: Number(quantity), description: description || null, need: need || null });
      await client.invalidateQueries({ queryKey: permanentProfileKeys.all });
      toast.success(labels.saved);
    } catch (error) { toastUnexpectedError(error); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-3 border-b border-border py-3 last:border-0 md:grid-cols-[minmax(10rem,1fr)_8rem_1fr_1fr_auto] md:items-end" onSubmit={(event) => void submit(event)}>
    <h3 className="font-semibold">{resource.category_label}</h3>
    <TextField id={`resource-quantity-${resource.category}`} type="number" min={0} max={100000} label={labels.quantity} value={quantity} disabled={!canManage} onChange={(event) => setQuantity(event.target.value)} />
    <TextField id={`resource-description-${resource.category}`} label={labels.description} value={description} disabled={!canManage} onChange={(event) => setDescription(event.target.value)} />
    <TextField id={`resource-need-${resource.category}`} label={labels.need} value={need} disabled={!canManage} onChange={(event) => setNeed(event.target.value)} />
    {canManage && <Button type="submit" size="sm" loading={busy}><Save aria-hidden="true" />{labels.save}</Button>}
  </form>;
}

export function PermanentProfileTab() {
  const query = useQuery({ queryKey: permanentProfileKeys.all, queryFn: () => permanentProfileApi.get() });
  if (query.isPending) return <div className="grid gap-3"><Skeleton className="h-28" /><Skeleton className="h-40" /></div>;
  if (query.isError) return <Card><CardContent><p role="alert" className="text-danger">{labels.loadError}</p><Button variant="secondary" onClick={() => void query.refetch()}>{fr.common.retry}</Button></CardContent></Card>;
  return <PermanentProfileContent profile={query.data} />;
}

function PermanentProfileContent({ profile }: { profile: PermanentProfile }) {
  const [adding, setAdding] = useState(false);
  const [history, setHistory] = useState(profile.presentation.history_text ?? '');
  const [revenue, setRevenue] = useState(profile.presentation.previous_year_revenue === null ? '' : String(profile.presentation.previous_year_revenue));
  const [savingPresentation, setSavingPresentation] = useState(false);
  const client = useQueryClient();

  async function savePresentation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPresentation(true);
    try {
      await permanentProfileApi.savePresentation({ history_text: history.trim() || null, previous_year_revenue: revenue === '' ? null : Number(revenue) });
      await client.invalidateQueries({ queryKey: permanentProfileKeys.all });
      toast.success(labels.saved);
    } catch (error) { toastUnexpectedError(error); }
    finally { setSavingPresentation(false); }
  }

  const canManage = profile.can.manage;

  return <div className="grid gap-4">
    {!canManage && <p className="text-note text-muted">{labels.noAccess}</p>}
    <Card><CardHeader><CardTitle>{labels.identity}</CardTitle></CardHeader><CardContent className="grid gap-2 text-body sm:grid-cols-2">
      <p><strong>{profile.presentation.name}</strong>{profile.presentation.sigle ? ` (${profile.presentation.sigle})` : ''}</p>
      <p>{profile.presentation.legal_form ?? fr.common.notProvided}</p>
      <p>{profile.presentation.ncc}</p><p>{profile.presentation.agreement_number ?? fr.common.notProvided}</p>
      <p>{profile.presentation.regional_directorate?.name ?? fr.common.notProvided}</p><p>{profile.presentation.said ?? fr.common.notProvided}</p>
      <p>{profile.presentation.address ?? fr.common.notProvided}{profile.presentation.city ? ` · ${profile.presentation.city}` : ''}</p>
      <p>{profile.presentation.manager_name ?? fr.common.notProvided} · {profile.presentation.expert_name ?? fr.common.notProvided}</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{labels.people}</CardTitle>{canManage && <Button size="sm" onClick={() => setAdding((open) => !open)}><Plus aria-hidden="true" />{labels.addPerson}</Button>}</CardHeader><CardContent className="grid gap-3">
      {adding && <PersonForm person={null} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />}
      {profile.people.length === 0 && !adding ? <EmptyState icon={Pencil}>{labels.emptyPeople}</EmptyState> : <ul aria-label={labels.people}>{profile.people.map((person) => <PersonRow key={person.id} person={person} canManage={canManage} />)}</ul>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{labels.resources}</CardTitle></CardHeader><CardContent>{profile.resources.map((resource) => <ResourceForm key={resource.category} resource={resource} canManage={canManage} />)}</CardContent></Card>
    <Card><CardHeader><CardTitle>{labels.presentation}</CardTitle></CardHeader><CardContent><form className="grid gap-3" onSubmit={(event) => void savePresentation(event)}>
      <label className="grid gap-1 text-label text-ink">{labels.history}<Textarea value={history} disabled={!canManage} onChange={(event) => setHistory(event.target.value)} /></label>
      <TextField id="previous-year-revenue" type="number" min={0} label={labels.revenue} value={revenue} disabled={!canManage} onChange={(event) => setRevenue(event.target.value)} />
      {profile.presentation.previous_year_revenue !== null && <p className="text-note text-muted">{formatAmount(profile.presentation.previous_year_revenue)}</p>}
      {canManage && <div><Button type="submit" loading={savingPresentation}><Save aria-hidden="true" />{labels.save}</Button></div>}
    </form></CardContent></Card>
  </div>;
}
