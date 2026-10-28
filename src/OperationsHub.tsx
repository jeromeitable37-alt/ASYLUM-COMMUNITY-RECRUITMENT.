import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Activity, Bell, CalendarClock, Check, Download, Flag, RefreshCw, Search, ShieldCheck, Swords, Users, X } from 'lucide-react';
import './operations.css';

const OPS_API_URL = 'https://tyhszzztltamrohhyykh.supabase.co/functions/v1/asy-operations';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cue7psRXDt6h-1oSAwnpIw_ro8Tvecn';

type Props = { mode: 'public' | 'staff'; session: Session | null; authorized: boolean; onNotify: (message: string, isError?: boolean) => void };
type TeamMember = { team_id: string; roster_id: string; team_position: string; member: { id: string; ign: string; main_role: string; rank: string; member_status: string } | null };
type Team = { id: string; name: string; division: string; description: string; captain_roster_id: string | null; is_active: boolean; members: TeamMember[] };
type Scrim = { id: string; title: string; opponent: string; game_mode: string; team_id: string | null; starts_at: string; visibility: string; status: string; details: string; asy_teams?: { name: string; division: string } | null };
type Member = { id: string; ign: string; main_role: string; rank: string; member_status: string; joined_at: string; clan_name?: string | null };
type Notice = { id: string; application_id: string | null; title: string; body: string; notification_type: string; is_read: boolean; created_at: string };
type Report = { id: string; message_id: string | null; reporter_name: string; reason: string; details: string | null; status: string; created_at: string };
type AuditLog = { id: string; actor_email: string; action: string; entity_type: string; entity_id: string | null; summary: string; created_at: string };

const emptyTeam = { id: '', name: '', division: 'Mixed', description: '', captain_roster_id: '', is_active: true };
const emptyScrim = { id: '', title: '', opponent: '', game_mode: 'MP', team_id: '', starts_at: '', visibility: 'public', status: 'scheduled', details: '' };
const when = (value: string) => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const pretty = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export function OperationsHub({ mode, session, authorized, onNotify }: Props) {
  const [tab, setTab] = useState(mode === 'public' ? 'teams' : 'dashboard');
  const [summary, setSummary] = useState<any>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<Scrim[]>([]);
  const [roster, setRoster] = useState<Member[]>([]);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [teamDraft, setTeamDraft] = useState(emptyTeam);
  const [scrimDraft, setScrimDraft] = useState(emptyScrim);
  const [teamMemberDraft, setTeamMemberDraft] = useState({ team_id: '', roster_id: '', team_position: 'Player' });
  const [memberSearch, setMemberSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [directorySyncBusy, setDirectorySyncBusy] = useState(false);

  async function request(payload: Record<string, unknown>) {
    const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = 'Bearer ' + session.access_token;
    const response = await fetch(OPS_API_URL, { method: 'POST', headers, body: JSON.stringify(payload), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'The ASY operations service is temporarily unavailable.');
    return data;
  }

  async function loadPublic() {
    setLoading(true);
    try {
      const [teamData, eventData] = await Promise.all([request({ action: 'team-list' }), request({ action: 'scrim-list' })]);
      setTeams(Array.isArray(teamData.teams) ? teamData.teams : []);
      setEvents(Array.isArray(eventData.events) ? eventData.events : []);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not load public team information.', true);
    } finally { setLoading(false); }
  }

  async function loadDashboard() {
    if (!authorized) return;
    try {
      const data = await request({ action: 'dashboard-summary' });
      setSummary(data);
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not load the operations dashboard.', true); }
  }
  async function loadRoster() {
    try {
      const data = await request({ action: 'directory-list' });
      setRoster(Array.isArray(data.members) ? data.members : []);
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not load the member list.', true); }
  }
  async function loadNotifications() {
    try {
      const data = await request({ action: 'notifications-list' });
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not load notifications.', true); }
  }
  async function loadReports() {
    try {
      const data = await request({ action: 'report-list' });
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not load community reports.', true); }
  }
  async function loadAudit() {
    try {
      const data = await request({ action: 'audit-list' });
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not load activity history.', true); }
  }

  useEffect(() => { void loadPublic(); void loadRoster(); }, []);
  useEffect(() => {
    if (mode !== 'staff' || !authorized || !session) return;
    if (tab === 'dashboard') void loadDashboard();
    if (tab === 'notifications') void loadNotifications();
    if (tab === 'reports') void loadReports();
    if (tab === 'activity') void loadAudit();
    if (tab === 'teams' || tab === 'scrims') { void loadPublic(); void loadRoster(); }
  }, [mode, tab, authorized, session?.access_token]);

  const filteredRoster = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return q ? roster.filter(m => [m.ign, m.rank, m.main_role, m.clan_name || ''].some(v => String(v).toLowerCase().includes(q))) : roster;
  }, [roster, memberSearch]);

  async function saveTeam(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await request({ action: 'team-save', ...teamDraft, captain_roster_id: teamDraft.captain_roster_id || null });
      setTeamDraft(emptyTeam); await loadPublic(); onNotify('Team saved.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not save team.', true); }
    finally { setBusy(false); }
  }
  async function deleteTeam(team: Team) {
    if (!window.confirm('Delete ' + team.name + '? Team members assigned to it will be unlinked.')) return;
    setBusy(true);
    try { await request({ action: 'team-delete', id: team.id }); await loadPublic(); onNotify('Team deleted.'); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Could not delete team.', true); }
    finally { setBusy(false); }
  }
  async function saveTeamMember(event: FormEvent) {
    event.preventDefault(); if (!teamMemberDraft.team_id || !teamMemberDraft.roster_id) return;
    setBusy(true);
    try {
      await request({ action: 'team-member-save', ...teamMemberDraft });
      setTeamMemberDraft(old => ({ ...old, roster_id: '' })); await loadPublic(); onNotify('Member assigned to team.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not assign member.', true); }
    finally { setBusy(false); }
  }
  async function removeTeamMember(teamId: string, rosterId: string) {
    if (!window.confirm('Remove this member from the team?')) return;
    try { await request({ action: 'team-member-remove', team_id: teamId, roster_id: rosterId }); await loadPublic(); onNotify('Team membership removed.'); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Could not remove team member.', true); }
  }
  async function saveScrim(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const startsAt = new Date(scrimDraft.starts_at).toISOString();
      await request({ action: 'scrim-save', ...scrimDraft, starts_at: startsAt, team_id: scrimDraft.team_id || null });
      setScrimDraft(emptyScrim); await loadPublic(); onNotify('Scrim event saved.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not save scrim event.', true); }
    finally { setBusy(false); }
  }
  async function deleteScrim(eventItem: Scrim) {
    if (!window.confirm('Delete scrim event "' + eventItem.title + '"?')) return;
    try { await request({ action: 'scrim-delete', id: eventItem.id }); await loadPublic(); onNotify('Scrim event deleted.'); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Could not delete event.', true); }
  }
  async function updateReport(report: Report, status: 'reviewed' | 'dismissed') {
    try { await request({ action: 'report-resolve', id: report.id, status }); await loadReports(); onNotify('Report marked ' + status + '.'); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Could not update report.', true); }
  }
  async function readNotification(note: Notice) {
    try { await request({ action: 'notification-read', id: note.id }); await loadNotifications(); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Could not mark notification read.', true); }
  }
  async function syncMemberDirectory() {
    if (!authorized || !session?.access_token) { onNotify('Sign in with an authorized staff account first.', true); return; }
    if (!window.confirm('Sync the public member directory from the latest Google Sheet? Only IGN, CODM UID (stored privately), clan name, and form timestamp are used. Birthdates and social links are ignored. Existing members missing from the sheet will not be deleted.')) return;
    setDirectorySyncBusy(true);
    try {
      const response = await fetch('https://tyhszzztltamrohhyykh.supabase.co/functions/v1/asy-member-directory-sync', {
        method: 'POST',
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-directory' }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not sync the member spreadsheet.');
      await loadPublic();
      await loadRoster();
      await loadDashboard();
      onNotify('Member directory synced: ' + data.unique_members + ' unique members (' + data.duplicate_uids_merged + ' duplicate UID row(s) merged).');
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'Could not sync the member directory.', true);
    } finally { setDirectorySyncBusy(false); }
  }

  async function downloadBackup() {
    setBusy(true);
    try {
      const data = await request({ action: 'backup-export' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = href; link.download = 'asy-recruitment-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
      onNotify('Backup downloaded. Store it securely; it contains private recruitment records.');
    } catch (error) { onNotify(error instanceof Error ? error.message : 'Could not create backup.', true); }
    finally { setBusy(false); }
  }

  if (mode === 'public') {
    return <section className="page ops-page">
      <div className="heading"><small>ASY COMMUNITY / COMPETITIVE</small><h1>TEAMS &amp; <em>SCRIMS.</em></h1><p>Browse active teams and upcoming public scrim schedules. Staff-only events and internal notes stay private.</p></div>
      <div className="ops-public-grid">
        <section className="panel ops-panel"><div className="ops-section-title"><div><small className="kicker">ROSTER GROUPS</small><h2>Official teams</h2></div><button type="button" className="secondary compact-button" onClick={() => void loadPublic()}><RefreshCw size={14}/> Refresh</button></div>
          {loading && <p className="muted">Loading teams…</p>}
          {!loading && teams.filter(t => t.is_active).length === 0 && <p className="message-empty">No official teams have been published yet.</p>}
          <div className="ops-team-grid">{teams.filter(t => t.is_active).map(team => <article className="ops-team-card" key={team.id}><span className="ops-chip">{team.division}</span><h3>{team.name}</h3><p>{team.description || 'An official ASY team.'}</p><div className="ops-team-members">{team.members.filter(m => m.member).map(m => <span key={m.roster_id}>{m.member?.ign}<small>{m.team_position}</small></span>)}</div><small className="ops-muted">{team.members.length} roster slot(s) assigned</small></article>)}</div>
        </section>
        <section className="panel ops-panel"><div className="ops-section-title"><div><small className="kicker">UPCOMING MATCHES</small><h2>Scrim schedule</h2></div></div>
          {events.filter(e => e.visibility === 'public' && e.status === 'scheduled').length === 0 && <p className="message-empty">No upcoming public scrims are scheduled right now.</p>}
          <div className="ops-event-list">{events.filter(e => e.visibility === 'public' && e.status === 'scheduled').map(eventItem => <article className="ops-event-card" key={eventItem.id}><div className="ops-event-date"><CalendarClock size={18}/><strong>{new Date(eventItem.starts_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</strong><small>{new Date(eventItem.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><div className="ops-event-copy"><span className="ops-chip">{eventItem.game_mode}</span><h3>{eventItem.title}</h3><p>{eventItem.opponent ? 'vs ' + eventItem.opponent : 'ASY community scrim'}{eventItem.asy_teams?.name ? ' · ' + eventItem.asy_teams.name : ''}</p>{eventItem.details && <small>{eventItem.details}</small>}</div></article>)}</div>
        </section>
      </div>
    </section>;
  }

  if (!session || !authorized) return <section className="page ops-page"><div className="heading"><small>RESTRICTED AREA</small><h1>OPERATIONS <em>CONTROL.</em></h1><p>Sign in with an authorized ASY staff account to use these tools.</p></div><div className="panel empty"><ShieldCheck size={34}/><h2>Staff access required</h2><p>Use Recruiter login, then open Operations again.</p></div></section>;

  const nav = [
    ['dashboard', 'Overview', Activity], ['teams', 'Teams', Users], ['scrims', 'Scrims', CalendarClock],
    ['notifications', 'Notifications', Bell], ['reports', 'Reports', Flag], ['activity', 'Audit log', ShieldCheck],
  ] as const;
  const total = summary?.totals || {};
  const unread = notifications.filter(n => !n.is_read).length;
  const pendingReports = reports.filter(r => r.status === 'pending').length;

  return <section className="page ops-page">
    <div className="heading"><small>ASY COMMUNITY / STAFF WORKSPACE</small><h1>OPERATIONS <em>CONTROL.</em></h1><p>Review workload, community reports, notifications, teams, scrims, and staff activity in one place.</p></div>
    <div className="ops-shell">
      <aside className="ops-sidebar">{nav.map(([id, label, Icon]) => <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16}/>{label}{id === 'notifications' && unread > 0 && <b>{unread}</b>}{id === 'reports' && pendingReports > 0 && <b>{pendingReports}</b>}</button>)}
        <button type="button" className="ops-refresh" onClick={() => { void loadPublic(); void loadRoster(); if (tab === 'dashboard') void loadDashboard(); if (tab === 'notifications') void loadNotifications(); if (tab === 'reports') void loadReports(); if (tab === 'activity') void loadAudit(); }}><RefreshCw size={14}/> Refresh data</button>
      </aside>
      <div className="ops-content">
        {tab === 'dashboard' && <div className="ops-workspace">
          <div className="ops-workspace-head"><div><small className="kicker">LIVE WORKLOAD</small><h2>Recruitment overview</h2><p>Updated {summary?.refreshedAt ? when(summary.refreshedAt) : 'when loaded'}.</p></div><button className="secondary compact-button" onClick={() => void loadDashboard()}><RefreshCw size={14}/> Refresh</button></div>
          <div className="ops-kpi-grid">
            {[
              ['Total applications', total.applications ?? '—', 'applications'],
              ['Pending review', total.pending ?? '—', 'awaiting first review'],
              ['Evidence to review', total.evidencePending ?? '—', 'submitted by applicants'],
              ['Unread applicant messages', total.unreadApplicantMessages ?? '—', 'private conversations'],
              ['Unread notifications', total.unreadNotifications ?? '—', 'staff inbox'],
              ['Community reports', total.openReports ?? '—', 'awaiting moderation'],
              ['New this week', total.newThisWeek ?? '—', 'applications'],
              ['Accepted', total.accepted ?? '—', 'successful applications'],
            ].map(([label, value, sub]) => <article className="ops-kpi" key={label}><small>{label}</small><strong>{value}</strong><span>{sub}</span></article>)}
          </div>
          <div className="ops-status-row">{[['In review', total.reviewing], ['Interview', total.interviews], ['Tryout', total.tryouts], ['Waitlisted', total.waitlisted], ['Rejected', total.rejected]].map(([label, value]) => <span key={String(label)}>{label}<b>{value ?? '—'}</b></span>)}</div>
          <div className="ops-action-row"><button className="primary" onClick={() => setTab('teams')}><Users size={15}/> Manage teams</button><button className="secondary" onClick={() => setTab('scrims')}><CalendarClock size={15}/> Plan a scrim</button><button className="secondary" onClick={() => setTab('reports')}><Flag size={15}/> Review reports</button></div>
          <div className="ops-backup panel"><div><strong>Data export &amp; recovery</strong><p>Download a structured JSON backup of applications, roster, teams, scrims, and evidence metadata. Private screenshot files are excluded.</p></div><button disabled={busy} className="secondary" onClick={() => void downloadBackup()}><Download size={15}/>{busy ? 'Preparing…' : 'Download backup'}</button></div>
          <p className="ops-security-note">Keep backups in a private location. They may contain applicant contact details and review notes.</p>
        </div>}

        {tab === 'teams' && <div className="ops-workspace">
          <div className="ops-workspace-head"><div><small className="kicker">ROSTER MANAGEMENT</small><h2>Teams &amp; players</h2><p>Manage teams and sync the current member list. Private form fields are excluded from the public directory.</p></div><button type="button" className="secondary compact-button" disabled={directorySyncBusy} onClick={() => void syncMemberDirectory()}><RefreshCw size={14}/>{directorySyncBusy ? 'Syncing…' : 'Sync member sheet'}</button></div>
          <form className="panel ops-form" onSubmit={saveTeam}><div className="ops-form-head"><strong>{teamDraft.id ? 'Edit team' : 'Create a team'}</strong><button type="button" className="text-button" onClick={() => setTeamDraft(emptyTeam)}>Clear</button></div><div className="ops-form-grid"><label className="field"><span>Team name</span><input required minLength={2} maxLength={80} value={teamDraft.name} onChange={e => setTeamDraft({ ...teamDraft, name: e.target.value })}/></label><label className="field"><span>Division</span><select value={teamDraft.division} onChange={e => setTeamDraft({ ...teamDraft, division: e.target.value })}><option>Mixed</option><option>BR</option><option>MP</option><option>Academy</option></select></label><label className="field ops-full"><span>Description</span><textarea maxLength={1000} rows={2} value={teamDraft.description} onChange={e => setTeamDraft({ ...teamDraft, description: e.target.value })}/></label><label className="field"><span>Captain (optional)</span><select value={teamDraft.captain_roster_id} onChange={e => setTeamDraft({ ...teamDraft, captain_roster_id: e.target.value })}><option value="">No captain selected</option>{roster.map(m => <option key={m.id} value={m.id}>{m.ign}</option>)}</select></label><label className="field"><span>Status</span><select value={teamDraft.is_active ? 'true' : 'false'} onChange={e => setTeamDraft({ ...teamDraft, is_active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></label></div><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : teamDraft.id ? 'Save changes' : 'Create team'}</button></form>
          <div className="ops-team-admin-list">{teams.map(team => <article className="panel ops-admin-card" key={team.id}><div className="ops-section-title"><div><span className="ops-chip">{team.division}</span><h3>{team.name}</h3><p>{team.description || 'No description.'} · {team.is_active ? 'Active' : 'Inactive'}</p></div><div className="ops-inline-actions"><button type="button" className="secondary compact-button" onClick={() => setTeamDraft({ id: team.id, name: team.name, division: team.division, description: team.description, captain_roster_id: team.captain_roster_id || '', is_active: team.is_active })}>Edit</button><button type="button" className="danger compact-button" onClick={() => void deleteTeam(team)}>Delete</button></div></div><div className="ops-team-members">{team.members.filter(m => m.member).map(m => <span key={m.roster_id}>{m.member?.ign}<small>{m.team_position}</small><button title="Remove member" onClick={() => void removeTeamMember(team.id, m.roster_id)}><X size={12}/></button></span>)}</div></article>)}</div>
          <form className="panel ops-form" onSubmit={saveTeamMember}><div className="ops-form-head"><strong>Assign a player</strong></div><div className="ops-form-grid"><label className="field"><span>Team</span><select required value={teamMemberDraft.team_id} onChange={e => setTeamMemberDraft({ ...teamMemberDraft, team_id: e.target.value })}><option value="">Choose team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="field"><span>Member</span><select required value={teamMemberDraft.roster_id} onChange={e => setTeamMemberDraft({ ...teamMemberDraft, roster_id: e.target.value })}><option value="">Choose member</option>{roster.map(m => <option key={m.id} value={m.id}>{m.ign}</option>)}</select></label><label className="field"><span>Team position</span><select value={teamMemberDraft.team_position} onChange={e => setTeamMemberDraft({ ...teamMemberDraft, team_position: e.target.value })}><option>Player</option><option>Captain</option><option>Substitute</option><option>Coach</option></select></label></div><button className="primary" type="submit" disabled={busy}>Assign member</button></form>
        </div>}

        {tab === 'scrims' && <div className="ops-workspace">
          <div className="ops-workspace-head"><div><small className="kicker">SCRIM PLANNER</small><h2>Schedules &amp; attendance</h2><p>Use local Philippine time when scheduling events.</p></div></div>
          <form className="panel ops-form" onSubmit={saveScrim}><div className="ops-form-head"><strong>{scrimDraft.id ? 'Edit scrim event' : 'Schedule a scrim'}</strong><button type="button" className="text-button" onClick={() => setScrimDraft(emptyScrim)}>Clear</button></div><div className="ops-form-grid"><label className="field"><span>Event title</span><input required minLength={3} maxLength={120} value={scrimDraft.title} onChange={e => setScrimDraft({ ...scrimDraft, title: e.target.value })}/></label><label className="field"><span>Opponent (optional)</span><input maxLength={100} value={scrimDraft.opponent} onChange={e => setScrimDraft({ ...scrimDraft, opponent: e.target.value })}/></label><label className="field"><span>Game mode</span><select value={scrimDraft.game_mode} onChange={e => setScrimDraft({ ...scrimDraft, game_mode: e.target.value })}><option>MP</option><option>BR</option><option>Mixed</option></select></label><label className="field"><span>Assigned team</span><select value={scrimDraft.team_id} onChange={e => setScrimDraft({ ...scrimDraft, team_id: e.target.value })}><option value="">Community-wide</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="field"><span>Date and time</span><input required type="datetime-local" value={scrimDraft.starts_at} onChange={e => setScrimDraft({ ...scrimDraft, starts_at: e.target.value })}/></label><label className="field"><span>Visibility</span><select value={scrimDraft.visibility} onChange={e => setScrimDraft({ ...scrimDraft, visibility: e.target.value })}><option value="public">Public schedule</option><option value="staff">Staff only</option></select></label><label className="field"><span>Status</span><select value={scrimDraft.status} onChange={e => setScrimDraft({ ...scrimDraft, status: e.target.value })}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label><label className="field ops-full"><span>Details</span><textarea rows={2} maxLength={1000} value={scrimDraft.details} onChange={e => setScrimDraft({ ...scrimDraft, details: e.target.value })}/></label></div><button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : scrimDraft.id ? 'Save changes' : 'Schedule event'}</button></form>
          <div className="ops-event-list">{events.map(eventItem => <article className="panel ops-event-admin" key={eventItem.id}><div className="ops-event-copy"><span className="ops-chip">{eventItem.game_mode} · {eventItem.visibility} · {eventItem.status}</span><h3>{eventItem.title}</h3><p>{when(eventItem.starts_at)}{eventItem.opponent ? ' · vs ' + eventItem.opponent : ''}</p>{eventItem.details && <small>{eventItem.details}</small>}</div><div className="ops-inline-actions"><button type="button" className="secondary compact-button" onClick={() => setScrimDraft({ id: eventItem.id, title: eventItem.title, opponent: eventItem.opponent, game_mode: eventItem.game_mode, team_id: eventItem.team_id || '', starts_at: new Date(eventItem.starts_at).toISOString().slice(0, 16), visibility: eventItem.visibility, status: eventItem.status, details: eventItem.details })}>Edit</button><button type="button" className="danger compact-button" onClick={() => void deleteScrim(eventItem)}>Delete</button></div></article>)}</div>
        </div>}

        {tab === 'notifications' && <div className="ops-workspace"><div className="ops-workspace-head"><div><small className="kicker">STAFF INBOX</small><h2>Notifications</h2><p>{unread} unread notification(s).</p></div><button className="secondary compact-button" onClick={() => void loadNotifications()}><RefreshCw size={14}/> Refresh</button></div>{notifications.length === 0 && <p className="message-empty">No notifications yet. New submissions and applicant messages will show here.</p>}<div className="ops-notice-list">{notifications.map(note => <article className={'ops-notice ' + (!note.is_read ? 'unread' : '')} key={note.id}><div><span className="ops-chip">{pretty(note.notification_type)}</span><h3>{note.title}</h3><p>{note.body}</p><small>{when(note.created_at)}</small></div>{!note.is_read && <button type="button" className="secondary compact-button" onClick={() => void readNotification(note)}><Check size={14}/> Mark read</button>}</article>)}</div></div>}

        {tab === 'reports' && <div className="ops-workspace"><div className="ops-workspace-head"><div><small className="kicker">COMMUNITY SAFETY</small><h2>Reported messages</h2><p>{pendingReports} report(s) need review.</p></div><button className="secondary compact-button" onClick={() => void loadReports()}><RefreshCw size={14}/> Refresh</button></div>{reports.length === 0 && <p className="message-empty">No reports in the moderation queue.</p>}<div className="ops-report-list">{reports.map(report => <article className="ops-report-card" key={report.id}><div><span className="ops-chip">{pretty(report.reason)} · {pretty(report.status)}</span><h3>{report.reporter_name}</h3><p>{report.details || 'No extra details supplied.'}</p><small>{when(report.created_at)} · Message ID: {report.message_id || 'unavailable'}</small></div>{report.status === 'pending' && <div className="ops-inline-actions"><button className="secondary compact-button" onClick={() => void updateReport(report, 'reviewed')}>Mark reviewed</button><button className="danger compact-button" onClick={() => void updateReport(report, 'dismissed')}>Dismiss</button></div>}</article>)}</div></div>}

        {tab === 'activity' && <div className="ops-workspace"><div className="ops-workspace-head"><div><small className="kicker">ACCOUNTABILITY</small><h2>Audit trail</h2><p>Latest 100 recorded system actions.</p></div><button className="secondary compact-button" onClick={() => void loadAudit()}><RefreshCw size={14}/> Refresh</button></div>{logs.length === 0 && <p className="message-empty">No audit entries recorded yet.</p>}<div className="ops-audit-list">{logs.map(log => <article className="ops-audit-item" key={log.id}><span><Activity size={15}/></span><div><strong>{pretty(log.action)}</strong><p>{log.summary}</p><small>{log.actor_email} · {when(log.created_at)}</small></div></article>)}</div><p className="ops-security-note">Audit history is staff-only. Avoid placing passwords, login codes, or private screenshot URLs into reviewer notes.</p></div>}
      </div>
    </div>
  </section>;
}

export function ApplicantNotificationPanel({ applicationCode, contactEmail, onNotify }: { applicationCode: string; contactEmail: string; onNotify: (message: string, isError?: boolean) => void }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  async function request(payload: Record<string, unknown>) {
    const response = await fetch(OPS_API_URL, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not load notifications.');
    return data;
  }
  async function load() {
    try { const data = await request({ action: 'notifications-list', application_code: applicationCode, contact_email: contactEmail }); setItems(Array.isArray(data.notifications) ? data.notifications : []); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Could not load applicant notifications.', true); }
  }
  useEffect(() => { void load(); }, [applicationCode, contactEmail]);
  const unread = items.filter(item => !item.is_read).length;
  async function markRead(item: Notice) {
    try { await request({ action: 'notification-read', application_code: applicationCode, contact_email: contactEmail, id: item.id }); await load(); }
    catch (error) { onNotify(error instanceof Error ? error.message : 'Could not mark notification read.', true); }
  }
  return <section className="panel applicant-notifications"><div className="ops-section-title"><div><small className="kicker">TRACKING UPDATES</small><h2>Notifications {unread > 0 && <span className="ops-count">{unread}</span>}</h2></div><button type="button" className="secondary compact-button" onClick={() => { setOpen(v => !v); if (!open) void load(); }}>{open ? 'Hide' : 'Show updates'}</button></div>{open && (items.length ? <div className="ops-notice-list">{items.map(item => <article className={'ops-notice ' + (!item.is_read ? 'unread' : '')} key={item.id}><div><span className="ops-chip">{pretty(item.notification_type)}</span><h3>{item.title}</h3><p>{item.body}</p><small>{when(item.created_at)}</small></div>{!item.is_read && <button type="button" className="secondary compact-button" onClick={() => void markRead(item)}><Check size={14}/> Mark read</button>}</article>)}</div> : <p className="message-empty">No notifications yet.</p>)}</section>;
}
