import { createClient } from '@supabase/supabase-js';

type EvidenceAction = 'create-upload' | 'finalize-upload';
type RequestBody = {
  action?: EvidenceAction;
  application_code?: string;
  contact_email?: string;
  requirement_key?: string;
  file_name?: string;
  content_type?: string;
  file_size_bytes?: number;
  path?: string;
};
type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};
type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
};

const BUCKET = 'asy-recruitment-private';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const allowedTypes: Record<string,string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const stageByWorkflow: Record<string,number> = {
  tag_proofs: 1,
  membership_proofs: 2,
  discord_roster: 3,
};

function env() {
  const runtime = globalThis as typeof globalThis & { process?: { env?: Record<string,string|undefined> } };
  return runtime.process?.env ?? {};
}
function getClient() {
  const values = env();
  const url = values.SUPABASE_URL || 'https://tyhszzztltamrohhyykh.supabase.co';
  const key = values.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value || '').trim();
}
function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'evidence';
}
function sendError(res: ApiResponse, status: number, error: string) {
  return res.status(status).json({ error });
}

async function findApplication(client: ReturnType<typeof createClient>, code: string, email: string) {
  const { data, error } = await client
    .from('asy_clan_applications')
    .select('id,application_code,ign,contact_email,status,workflow_step,application_type,submitted_at')
    .eq('application_code', code.toUpperCase())
    .eq('contact_email', email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error('Could not verify this tracking code. Please retry.');
  return data;
}
function currentStage(workflowStep: string): number | null {
  return stageByWorkflow[workflowStep] ?? null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const client = getClient();
  if (!client) return sendError(res, 503, 'Private evidence upload is not configured yet. Please contact ASY Management.');

  if (req.method === 'GET') {
    const code = one(req.query?.application_code);
    const email = one(req.query?.contact_email);
    if (!code || !email) return sendError(res, 400, 'Tracking code and application email are required.');
    try {
      const application = await findApplication(client, code, email);
      if (!application) return sendError(res, 404, 'Application not found. Check the tracking code and application email.');
      const { data: evidence, error } = await client
        .from('asy_recruitment_evidence')
        .select('requirement_key,requirement_label,stage_number,status,file_name,applicant_note,reviewer_notes,submitted_at,reviewed_at')
        .eq('application_id', application.id)
        .order('stage_number')
        .order('requirement_label');
      if (error) throw error;
      return res.status(200).json({
        configured: true,
        application: {
          application_code: application.application_code,
          ign: application.ign,
          status: application.status,
          workflow_step: application.workflow_step,
          application_type: application.application_type,
          submitted_at: application.submitted_at,
        },
        evidence: evidence ?? [],
      });
    } catch {
      return sendError(res, 500, 'Could not load screening progress right now.');
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendError(res, 405, 'Method not allowed.');
  }

  const body = (req.body ?? {}) as RequestBody;
  const code = (body.application_code ?? '').trim();
  const email = (body.contact_email ?? '').trim();
  const key = (body.requirement_key ?? '').trim();
  if (!code || !email || !key) return sendError(res, 400, 'Tracking code, application email, and requirement are required.');

  try {
    const application = await findApplication(client, code, email);
    if (!application) return sendError(res, 404, 'Application not found. Check the tracking code and application email.');
    if (application.status === 'rejected' || application.status === 'waitlisted' || application.workflow_step === 'complete') {
      return sendError(res, 409, 'This application is not currently open for requirement uploads.');
    }

    const { data: requirement, error: requirementError } = await client
      .from('asy_recruitment_evidence')
      .select('id,requirement_key,stage_number,status')
      .eq('application_id', application.id)
      .eq('requirement_key', key)
      .maybeSingle();
    if (requirementError || !requirement) return sendError(res, 404, 'This requirement was not found for your application.');

    const activeStage = currentStage(application.workflow_step);
    if (!activeStage || activeStage !== requirement.stage_number) {
      return sendError(res, 409, 'This step is locked until a recruiter approves the previous step.');
    }
    if (requirement.status === 'locked') return sendError(res, 409, 'This requirement is locked until the previous step is approved.');
    if (requirement.status === 'pending' || requirement.status === 'approved') {
      return sendError(res, 409, 'This requirement is already submitted or approved. Wait for recruiter review.');
    }

    if (body.action === 'create-upload') {
      const contentType = body.content_type ?? '';
      const fileSize = Number(body.file_size_bytes);
      if (!Object.prototype.hasOwnProperty.call(allowedTypes, contentType)) {
        return sendError(res, 415, 'Upload a JPG, PNG, or WEBP screenshot only.');
      }
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > MAX_FILE_BYTES) {
        return sendError(res, 413, 'Each screenshot must be smaller than 8 MB.');
      }
      const extension = allowedTypes[contentType];
      const path = application.id + '/' + key + '-' + crypto.randomUUID() + '.' + extension;
      const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token) return sendError(res, 500, 'Could not create a private upload link. Please retry.');
      return res.status(200).json({ configured: true, path, token: data.token, content_type: contentType, file_size_bytes: fileSize });
    }

    if (body.action === 'finalize-upload') {
      const path = body.path ?? '';
      const contentType = body.content_type ?? '';
      const fileSize = Number(body.file_size_bytes);
      const rawName = body.file_name ?? 'evidence';
      if (!Object.prototype.hasOwnProperty.call(allowedTypes, contentType)) return sendError(res, 415, 'Upload a JPG, PNG, or WEBP screenshot only.');
      if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > MAX_FILE_BYTES) return sendError(res, 413, 'Each screenshot must be smaller than 8 MB.');
      if (!path.startsWith(application.id + '/' + key + '-') || !path.endsWith('.' + allowedTypes[contentType])) {
        return sendError(res, 400, 'The upload reference does not match this application requirement.');
      }
      const folder = application.id;
      const basename = path.slice(folder.length + 1);
      const { data: objects, error: listError } = await client.storage.from(BUCKET).list(folder, { search: basename, limit: 100 });
      if (listError || !objects?.some((object) => object.name === basename)) {
        return sendError(res, 400, 'The screenshot upload could not be verified. Please upload it again.');
      }
      const { data: saved, error } = await client
        .from('asy_recruitment_evidence')
        .update({
          storage_path: path,
          file_name: safeFileName(rawName),
          content_type: contentType,
          file_size_bytes: fileSize,
          status: 'pending',
          submitted_at: new Date().toISOString(),
          applicant_note: null,
          reviewer_notes: null,
          reviewed_at: null,
          reviewed_by_email: null,
          updated_at: new Date().toISOString(),
        })
        .eq('application_id', application.id)
        .eq('requirement_key', key)
        .in('status', ['not_submitted', 'needs_correction'])
        .select('requirement_key,status,file_name,submitted_at')
        .maybeSingle();
      if (error || !saved) return sendError(res, 409, 'This requirement changed while you were uploading. Refresh your progress and retry.');
      return res.status(200).json({ configured: true, evidence: saved });
    }

    return sendError(res, 400, 'Unknown evidence action.');
  } catch {
    return sendError(res, 500, 'The screening service is temporarily unavailable. Please retry.');
  }
}
