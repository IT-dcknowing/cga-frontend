import type { DocumentTemplate } from '@/features/templates/api/templates-api';
import { formInput } from './api-member-records';
import { forbidden, invalid, notFound, ok, text, type ApiReply } from './api-replies';

/*
 * Modèles de documents simulés, d'après `DocumentTemplateController` (`DocumentTemplateResource`,
 * `TemplateInspector::check`) : une version déposée dont le nom contient « incomplet » manque une
 * variable ; l'activation exige la date de validation du CNCGA et désactive l'ancienne version.
 */
type Context = { allows: (permission: string) => boolean };

function template(overrides: Partial<DocumentTemplate>): DocumentTemplate {
  return {
    id: '01tpl000000000000000000001',
    type: 'membership_contract',
    type_label: 'Contrat d’adhésion',
    version: '2026.1',
    is_active: true,
    approved_by_cncga_at: '2026-01-02',
    notes: 'Modèle provisoire',
    variables: ['member_name', 'member_ncc'],
    check: { missing: [], unknown: [], valid: true },
    file: {
      id: '01fil-ctr',
      name: 'contrat.docx',
      size_bytes: 2048,
      url: 'https://files.test/contrat.docx',
    },
    documents_count: 42,
    created_at: '2026-01-01T09:00:00Z',
    can: { preview: true, activate: false },
    ...overrides,
  };
}

export function createTemplatesBackend() {
  let templates: DocumentTemplate[] = [
    template({}),
    template({
      id: '01tpl000000000000000000002',
      type: 'membership_certificate',
      type_label: 'Attestation d’adhésion',
      version: '2026.1',
      notes: null,
      file: {
        id: '01fil-att',
        name: 'attestation.docx',
        size_bytes: 2048,
        url: 'https://files.test/attestation.docx',
      },
      documents_count: 12,
    }),
  ];
  let nextId = 2;

  function upload(body: unknown): ApiReply {
    const input = formInput(body);
    const file = input.file;

    if (text(input, 'version') === '') {
      return invalid({ version: 'La version est obligatoire.' });
    }

    if (!(file instanceof File) || !/\.(docx|xlsx)$/.test(file.name)) {
      return invalid({ file: 'Le fichier doit être au format DOCX.' });
    }

    const incomplete = file.name.includes('incomplet');
    const source = templates.find((item) => item.type === input.type);
    const created = template({
      id: `01tpl9${String(++nextId).padStart(20, '0')}`,
      type: String(input.type),
      type_label: source?.type_label ?? String(input.type),
      version: text(input, 'version'),
      is_active: false,
      approved_by_cncga_at: null,
      notes: text(input, 'notes') === '' ? null : text(input, 'notes'),
      check: incomplete
        ? { missing: ['member_ncc'], unknown: ['nom_inconnu'], valid: false }
        : { missing: [], unknown: [], valid: true },
      file: {
        id: '01fil-new',
        name: file.name,
        size_bytes: file.size,
        url: `https://files.test/${file.name}`,
      },
      documents_count: 0,
      can: { preview: !incomplete, activate: !incomplete },
    });

    templates = [...templates, created];

    return ok(created, 201);
  }

  function activate(target: DocumentTemplate, body: unknown): ApiReply {
    const input = (body ?? {}) as Record<string, unknown>;

    if (typeof input.approved_by_cncga_on !== 'string' || input.approved_by_cncga_on === '') {
      return invalid({ approved_by_cncga_on: 'La date de validation est obligatoire.' });
    }

    templates = templates.map((item) =>
      item.type !== target.type
        ? item
        : item.id === target.id
          ? {
              ...item,
              is_active: true,
              approved_by_cncga_at: input.approved_by_cncga_on as string,
              can: { preview: true, activate: false },
            }
          : { ...item, is_active: false, can: { ...item.can, activate: item.check.valid } },
    );

    return ok(templates.find((item) => item.id === target.id));
  }

  /** Routes `/platform/document-templates…` ; `undefined` pour une autre route. */
  function route(
    method: string,
    path: string,
    body: unknown,
    context: Context,
  ): ApiReply | undefined {
    if (!path.startsWith('/platform/document-templates')) {
      return undefined;
    }

    if (!context.allows('platform.templates.manage')) {
      return forbidden;
    }

    if (path === '/platform/document-templates') {
      return method === 'GET' ? ok(templates) : method === 'POST' ? upload(body) : undefined;
    }

    const match = /^\/platform\/document-templates\/([^/]+)\/(preview|activate)$/.exec(path);
    const target = match === null ? undefined : templates.find((item) => item.id === match[1]);

    if (match === null || target === undefined) {
      return notFound;
    }

    return match[2] === 'preview'
      ? ok({
          file: {
            name: `apercu-${target.version}.pdf`,
            url: `https://files.test/apercu-${target.version}.pdf`,
          },
        })
      : activate(target, body);
  }

  return { route, templates: () => templates };
}
