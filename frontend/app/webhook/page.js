// app/webhooks/page.jsx
'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Edit, Send } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:5000/api';

const EVENT_TYPES = [
  'product.created',
  'product.updated',
  'product.deleted',
  'product.bulk_deleted',
];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    url: '',
    event_type: 'product.created',
    enabled: true,
    secret: '',
  });
  const [testResult, setTestResult] = useState({});

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/webhooks`);
      const data = await res.json();
      setWebhooks(data || []);
    } catch (err) {
      console.error('Failed to load webhooks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleSave = async () => {
    if (!form.url.trim()) {
      alert('Webhook URL is required');
      return;
    }

    const payload = {
      url: form.url.trim(),
      event_type: form.event_type,
      enabled: form.enabled,
      secret: form.secret || null,
    };

    const method = editing ? 'PUT' : 'POST';
    const url = editing
      ? `${API_BASE}/webhooks/${editing.id}`
      : `${API_BASE}/webhooks`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Failed to save webhook');
      }

      setOpen(false);
      setEditing(null);
      setForm({
        url: '',
        event_type: 'product.created',
        enabled: true,
        secret: '',
      });
      fetchWebhooks();
    } catch (err) {
      alert('Error saving webhook');
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const res = await fetch(`${API_BASE}/webhooks/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Delete failed');
      fetchWebhooks();
    } catch (err) {
      alert('Failed to delete webhook');
      console.error(err);
    }
  };

  const handleTest = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/webhooks/${id}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { success: false, error: 'Network error' },
      }));
      console.error(err);
    }
  };

  const openEdit = (webhook) => {
    setEditing(webhook);
    setForm({
      url: webhook.url,
      event_type: webhook.event_type,
      enabled: webhook.enabled,
      secret: webhook.secret || '',
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      url: '',
      event_type: 'product.created',
      enabled: true,
      secret: '',
    });
    setOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <Card className="shadow-2xl border-0">
          <CardHeader className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-t-xl">
            <div className="flex items-center justify-between">
              <CardTitle className="text-3xl font-bold flex items-center gap-3">
                Webhook Management
              </CardTitle>
              <Button
                onClick={openCreate}
                className="bg-white text-indigo-700 hover:bg-gray-100"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Webhook
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-600">Loading webhooks...</p>
              </div>
            ) : webhooks.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <p className="text-xl mb-4">No webhooks configured yet</p>
                <Button onClick={openCreate}>Create your first webhook</Button>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>URL</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Test Result</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.map((wh) => (
                      <TableRow key={wh.id} className="hover:bg-gray-50">
                        <TableCell className="font-mono text-sm max-w-md truncate">
                          {wh.url}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{wh.event_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={wh.enabled ? 'default' : 'secondary'}>
                            {wh.enabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {testResult[wh.id] ? (
                            testResult[wh.id].success ? (
                              <span className="text-emerald-600 text-sm">
                                OK ({testResult[wh.id].status_code || '200'})
                              </span>
                            ) : (
                              <span className="text-red-600 text-sm">
                                Failed
                                {testResult[wh.id].error && ` - ${testResult[wh.id].error}`}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTest(wh.id)}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            Test
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(wh)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(wh.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-indigo-700">
                {editing ? 'Edit Webhook' : 'Create Webhook'}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="url">Webhook URL *</Label>
                <Input
                  id="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://example.com/webhook"
                />
              </div>

              <div className="space-y-2">
                <Label>Event Type *</Label>
                <Select
                  value={form.event_type}
                  onValueChange={(v) => setForm({ ...form, event_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>
                        {et}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={form.enabled.toString()}
                  onValueChange={(v) => setForm({ ...form, enabled: v === 'true' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Enabled</SelectItem>
                    <SelectItem value="false">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Secret (optional - for signing)</Label>
                <Input
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  placeholder="secret-key-for-verification"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {editing ? 'Update Webhook' : 'Create Webhook'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}