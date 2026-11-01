import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BellRing, BellOff, Send } from 'lucide-react';

const API = 'https://tyhszzztltamrohhyykh.supabase.co/functions/v1/asy-web-push';
const KEY = 'sb_publishable_cue7psRXDt6h-1oSAwnpIw_ro8Tvecn';

type Props = { session: Session | null; authorized: boolean };
function b64ToBytes(input: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - input.length % 4) % 4);
  const raw = atob((input + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for(let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function callPush(token: string, action: string, more: Record<string, unknown> = {}) {
  const response = await fetch(API, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + token },
    body: JSON.stringify({ action, ...more }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Push service request failed');
  return data;
}
export async function disconnectStaffPush(token: string) {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  try { await callPush(token, 'unsubscribe', { endpoint: sub.endpoint }); }
  finally { await sub.unsubscribe(); }
}
export default function StaffPushSettings({ session, authorized }: Props) {
  const supported = typeof window !== 'undefined' && window.isSecureContext &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!supported || !authorized || !session) { setEnabled(false); return; }
    let cancelled = false;
    void navigator.serviceWorker.getRegistration('/').then(r => r?.pushManager.getSubscription()).then(s => {
      if (!cancelled) setEnabled(Boolean(s) && Notification.permission === 'granted');
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [supported, authorized, session?.user.id]);
  async function getSubscription() {
    if (!supported) throw new Error('Push is not supported in this browser. On iPhone, add the site to your Home Screen first.');
    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    return reg;
  }
  async function enable() {
    if (!session?.access_token || !authorized) return;
    setBusy(true); setMessage('');
    try {
      // Browser permission prompt is shown only after a user clicks Enable.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Allow notifications in your browser/site settings to enable push.');
      const reg = await getSubscription();
      const response = await fetch(API, {cache:'no-store'});
      if (!response.ok) throw new Error('Unable to retrieve server push key.');
      const { publicKey } = await response.json();
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(publicKey),
      });
      try {
        await callPush(session.access_token, 'subscribe', { subscription: sub.toJSON() });
      } catch (e) {
        if (!existing) await sub.unsubscribe().catch(() => undefined);
        throw e;
      }
      setEnabled(true);
      setMessage('Enabled on this device. Push alerts can arrive even when the website is closed.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not enable push notifications.'); }
    finally { setBusy(false); }
  }
  async function disable() {
    if (!session?.access_token) return;
    setBusy(true); setMessage('');
    try {
      await disconnectStaffPush(session.access_token);
      setEnabled(false);
      setMessage('Push notifications disabled on this device.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not disable push.'); }
    finally { setBusy(false); }
  }
  async function test() {
    if (!session?.access_token) return;
    setBusy(true); setMessage('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error('Enable push notifications first.');
      await callPush(session.access_token, 'test', { endpoint: sub.endpoint });
      setMessage('Test notification sent to the push service. Check this device’s notifications.');
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Test push failed.'); }
    finally { setBusy(false); }
  }
  if (!authorized || !session) return null;
  return <section className="panel" style={{padding:'20px',margin:'14px 0',display:'grid',gap:12}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
      <div>
        <small className="kicker">STAFF / BACKGROUND ALERTS</small>
        <h2 style={{margin:'5px 0'}}><BellRing size={20} style={{verticalAlign:'middle',marginRight:8}}/>Push notifications</h2>
        <p className="muted" style={{margin:0}}>New applications, applicant messages and screenshot submissions — even when this tab is closed.</p>
      </div>
      <span className={'pill ' + (enabled ? 'approved':'pending')}>{enabled ? 'Enabled on this device':'Not enabled'}</span>
    </div>
    <div className="actions" style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {!enabled
        ? <button type="button" className="primary" disabled={busy || !supported} onClick={() => void enable()}><BellRing size={15}/> {busy?'Enabling…':'Enable push notifications'}</button>
        : <><button type="button" className="secondary" disabled={busy} onClick={() => void test()}><Send size={15}/> Send test</button>
           <button type="button" className="secondary" disabled={busy} onClick={() => void disable()}><BellOff size={15}/> Disable on this device</button></>}
    </div>
    {!supported && <small className="muted">Requires HTTPS and a supported browser. On iOS 16.4+, add this website to Home Screen, then enable notifications from the installed web app.</small>}
    {message && <small role="status" className="muted">{message}</small>}
    <small className="muted">Only authorized recruitment staff can subscribe. Notifications contain no private applicant messages. Device notifications depend on browser/OS settings and connectivity.</small>
  </section>;
}
