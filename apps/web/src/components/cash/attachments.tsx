'use client';

import { removeAttachmentAction, uploadAttachmentAction } from '@/app/cash/actions';
import { ct, type CashKey } from '@/lib/cash/i18n';
import type { Lang } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';

/**
 * Pièces jointes on New Count (App.html handleFileSelect / renderAttachmentsList):
 * up to 5 photos or PDFs, each uploaded at once and staged on the server, then linked
 * to the count when it is submitted. A failed upload can be retried or removed.
 *
 * New: a phone photo is shrunk before it is sent (longest side 2400 px, JPEG). The
 * pilot expected photos over 4 MB (PILOT §5), and Vercel refuses any request over
 * 4.5 MB. A PDF is sent as it is.
 */

export interface Uploaded {
  id: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
}
interface Pending {
  key: string;
  fileName: string;
  fileSize: number;
  file: File;
  error: CashKey | null;
}

const MAX_FILES = 5;
const MAX_BYTES = 4 * 1024 * 1024;
const LONG_SIDE = 2400;

const sizeOf = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** A smaller JPEG of a photo, or the file itself if it cannot be read or is already small. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type !== 'image/heic') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

const REFUSALS: Record<string, CashKey> = {
  too_large: 'file_too_large',
  type_not_allowed: 'file_type_not_allowed',
  too_many: 'max_attachments_reached',
  expired: 'session_expired_title',
  denied: 'err_denied',
};

export function Attachments(props: {
  lang: Lang;
  restaurantId: string;
  items: Uploaded[];
  onChange: (fn: (items: Uploaded[]) => Uploaded[]) => void;
  /** How many are still uploading, so the form can hold Soumettre. */
  onBusy: (n: number) => void;
  /** Uploads that failed and were neither retried nor removed. */
  onFailed: (n: number) => void;
}) {
  const { lang, items } = props;
  const L = (k: CashKey) => ct(lang, k);
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<CashKey | null>(null);

  // The form holds Soumettre while anything uploads, and asks before leaving failures behind.
  const { onBusy, onFailed } = props;
  useEffect(() => {
    onBusy(uploading.size);
    onFailed(pending.filter((x) => x.error).length);
  }, [pending, uploading, onBusy, onFailed]);

  async function upload(p: Pending) {
    setUploading((u) => new Set(u).add(p.key));
    setPending((list) => list.map((x) => (x.key === p.key ? { ...x, error: null } : x)));
    const file = await shrink(p.file);
    let error: CashKey | null = null;
    let done: Uploaded | null = null;
    if (file.size > MAX_BYTES) error = 'file_too_large';
    else {
      const form = new FormData();
      form.set('restaurantId', props.restaurantId);
      form.set('file', file);
      const res = await uploadAttachmentAction(form).catch(() => ({ outcome: 'upload_failed' as const }));
      if (res.outcome === 'done' && 'attachment' in res) done = res.attachment;
      else error = REFUSALS[res.outcome] ?? 'upload_failed';
    }
    if (done) {
      const added = done;
      props.onChange((list) => [...list, added]);
      setPending((list) => list.filter((x) => x.key !== p.key));
    } else setPending((list) => list.map((x) => (x.key === p.key ? { ...x, error } : x)));
    setUploading((u) => {
      const n = new Set(u);
      n.delete(p.key);
      return n;
    });
  }

  function pick(files: FileList | null) {
    setNotice(null);
    const room = MAX_FILES - items.length - pending.length;
    const chosen = [...(files ?? [])];
    if (chosen.length > room) setNotice('max_attachments_reached');
    const added: Pending[] = [];
    for (const f of chosen.slice(0, Math.max(0, room))) {
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
        setNotice('file_type_not_allowed');
        continue;
      }
      if (f.type === 'application/pdf' && f.size > MAX_BYTES) {
        setNotice('file_too_large');
        continue;
      }
      added.push({ key: `${Date.now()}-${Math.random()}`, fileName: f.name, fileSize: f.size, file: f, error: null });
    }
    setPending((list) => [...list, ...added]);
    added.forEach((p) => void upload(p));
    if (input.current) input.current.value = '';
  }

  async function remove(id: number) {
    const res = await removeAttachmentAction(id).catch(() => ({ outcome: 'error' as const }));
    // Already gone on the server, or never ours: either way it leaves this draft.
    if (res.outcome === 'done' || res.outcome === 'not_found' || res.outcome === 'not_yours') props.onChange((list) => list.filter((x) => x.id !== id));
    else setNotice('error_generic');
  }

  const count = items.length + pending.length;
  return (
    <section>
      <h2 className="cb-sec">{L('section_attachments')}</h2>
      <div className="card cb-att">
        {items.map((a) => (
          <div key={a.id} className="cb-attitem">
            {a.mimeType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element -- a private file served by the app, not a static asset
              <img className="cb-thumb" src={`/cash/files/${a.id}`} alt="" />
            ) : (
              <span className="cb-fileicon" aria-hidden="true">
                PDF
              </span>
            )}
            <span className="cb-attinfo">
              <a href={`/cash/files/${a.id}`} target="_blank" rel="noopener">
                {a.fileName}
              </a>
              <small>{sizeOf(a.fileSize)}</small>
            </span>
            <button type="button" className="cb-attbtn danger" onClick={() => remove(a.id)}>
              {L('remove_file')}
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.key} className="cb-attitem">
            <span className="cb-fileicon" aria-hidden="true">
              …
            </span>
            <span className="cb-attinfo">
              <b>{p.fileName}</b>
              <small>{sizeOf(p.fileSize)}</small>
            </span>
            {uploading.has(p.key) ? (
              <span className="cb-uploading">{L('uploading_file')}</span>
            ) : (
              <span className="cb-attacts">
                <span className="cb-atterr">{L(p.error ?? 'upload_failed')}</span>
                <button type="button" className="cb-attbtn" onClick={() => void upload(p)}>
                  {L('retry_upload')}
                </button>
                <button
                  type="button"
                  className="cb-attbtn danger"
                  onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}
                >
                  {L('remove_file')}
                </button>
              </span>
            )}
          </div>
        ))}
        {notice && <p className="cb-atterr">{L(notice)}</p>}
        {count < MAX_FILES && (
          <>
            <input ref={input} type="file" multiple accept="image/*,application/pdf" hidden onChange={(e) => pick(e.target.files)} />
            <button type="button" className="cb-ghost" onClick={() => input.current?.click()}>
              + {L('add_files')}
            </button>
          </>
        )}
        {count > 0 && (
          <small className="cb-attcount">
            {count} / {MAX_FILES}
          </small>
        )}
      </div>
    </section>
  );
}
