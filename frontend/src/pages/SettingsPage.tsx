import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Copy, Key, Link2, Plug, Plus, Trash2, XCircle } from 'lucide-react';
import { AppLayout } from '../components/AppLayout';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { TextField } from '../components/FormField';
import { Skeleton } from '../components/Skeleton';
import { jiraApi } from '../api/jira';
import { apiKeysApi } from '../api/api-keys';
import type { ApiKey, JiraStatus } from '../types';

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jira, setJira] = useState<JiraStatus | null>(null);
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadJira() {
    setJira(await jiraApi.status());
  }
  async function loadKeys() {
    setKeys(await apiKeysApi.list());
  }

  useEffect(() => {
    loadJira();
    loadKeys();
  }, []);

  useEffect(() => {
    if (searchParams.get('jira_connected')) {
      setBanner({ tone: 'success', text: 'Jira connected successfully.' });
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('jira_error')) {
      setBanner({ tone: 'error', text: 'Failed to connect Jira. Please try again.' });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect() {
    if (!confirm('Disconnect Jira? You will need to reconnect to create new tickets.')) return;
    setDisconnecting(true);
    try {
      await jiraApi.disconnect();
      await loadJira();
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleCreateKey() {
    setCreating(true);
    try {
      const key = await apiKeysApi.create(label);
      setRevealedKey(key.key);
      setLabel('');
      await loadKeys();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? Requests using it will stop working immediately.')) return;
    await apiKeysApi.revoke(id);
    await loadKeys();
  }

  function closeCreateModal(open: boolean) {
    setCreateOpen(open);
    if (!open) {
      setRevealedKey(null);
      setCopied(false);
    }
  }

  return (
    <AppLayout title="Settings">
      <div className="mx-auto max-w-2xl space-y-6">
        {banner && (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              banner.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {banner.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {banner.text}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <Plug className="h-5 w-5 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900">Jira Integration</h2>
          </div>

          {!jira ? (
            <Skeleton className="h-16 w-full" />
          ) : jira.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Connected
                </span>
                <span className="text-gray-500">{jira.site_url}</span>
              </div>
              {jira.created_at && (
                <p className="text-xs text-gray-400">Connected {new Date(jira.created_at).toLocaleString()}</p>
              )}
              <Button variant="secondary" onClick={handleDisconnect} loading={disconnecting}>
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  <XCircle className="h-3.5 w-3.5" /> Not connected
                </span>
                {jira.status === 'expired' && (
                  <span className="text-xs text-amber-600">Your connection expired — reconnect below.</span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Connect your Jira Cloud workspace to create tickets directly from findings.
              </p>
              <Button onClick={() => jiraApi.connect()}>
                <Link2 className="h-4 w-4" />
                Connect to Jira
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">API Keys</h2>
            </div>
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Generate new key
            </Button>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Used by the external REST API (<code className="rounded bg-gray-100 px-1 py-0.5 text-xs">X-API-Key</code> header)
            for scanners and CI/CD pipelines to create findings programmatically.
          </p>

          {!keys ? (
            <Skeleton className="h-12 w-full" />
          ) : keys.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
              No API keys yet. Generate one to use the external API.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {keys.map((k) => (
                <li key={k.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{k.label}</p>
                    <p className="text-xs text-gray-400">Created {new Date(k.created_at).toLocaleDateString()}</p>
                  </div>
                  <Button variant="ghost" onClick={() => handleRevoke(k.id)} aria-label={`Revoke ${k.label}`}>
                    <Trash2 className="h-4 w-4 text-gray-400" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal open={createOpen} onOpenChange={closeCreateModal} title="Generate API Key">
        {revealedKey ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Copy this key now — for your security, it won&apos;t be shown again.
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap text-xs text-gray-800">{revealedKey}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(revealedKey);
                  setCopied(true);
                }}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600"
                aria-label="Copy key"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            {copied && <p className="text-xs text-emerald-600">Copied to clipboard.</p>}
            <div className="flex justify-end pt-2">
              <Button onClick={() => closeCreateModal(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <TextField
              id="key-label"
              label="Label"
              placeholder="CI pipeline scanner"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => closeCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateKey} loading={creating} disabled={!label.trim()}>
                Generate
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
