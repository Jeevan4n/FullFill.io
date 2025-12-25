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
import { Plus, Trash2, Edit, Send, ArrowLeft, Webhook } from 'lucide-react';
import Link from 'next/link';

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
    const url = editing ? `${API_BASE}/webhooks/${editing.id}` : `${API_BASE}/webhooks`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save webhook');
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
      alert(err.message || 'Error saving webhook');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this webhook?')) return;

    try {
      const res = await fetch(`${API_BASE}/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchWebhooks();
    } catch (err) {
      alert('Failed to delete webhook');
    }
  };

  const handleTest = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/webhooks/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult((prev) => ({ ...prev, [id]: data }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { success: false, error: 'Network error' },
      }));
    }
  };

  const openEdit = (wh) => {
    setEditing(wh);
    setForm({
      url: wh.url,
      event_type: wh.event_type,
      enabled: wh.enabled,
      secret: wh.secret || '',
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Card className="shadow-2xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Webhook className="w-9 h-9" />
                <div>
                  <CardTitle className="text-3xl font-bold">Webhook Management</CardTitle>
                  <p className="text-indigo-100 mt-1">Configure real-time product event notifications</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={openCreate}
                  size="lg"
                  className="bg-white text-indigo-600 hover:bg-gray-100 font-semibold shadow-lg"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add Webhook
                </Button>

                <Link href="/">
                  <Button
                    variant="outline"
                    size="lg"
                    className="bg-white/10 text-white hover:bg-white/20 border-white/30"
                  >
                    <ArrowLeft className="w-5 h-5 mr-2" />
                    Back to Products
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-600 text-lg">Loading webhooks...</p>
              </div>
            ) : webhooks.length === 0 ? (
              <div className="text-center py-20">
                <Webhook className="w-16 h-16 text-gray-300 mx-auto mb-6" />
                <h3 className="text-xl font-semibold text-gray-600 mb-2">No webhooks yet</h3>
                <p className="text-gray-500 mb-6">Start receiving real-time product updates</p>
                <Button onClick={openCreate} size="lg">
                  Create First Webhook
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold">URL</TableHead>
                        <TableHead className="font-semibold">Event Type</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Last Test</TableHead>
                        <TableHead className="text-right font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {webhooks.map((wh) => (
                        <TableRow key={wh.id} className="hover:bg-gray-50 transition-colors">
                          <TableCell className="font-mono text-sm max-w-md truncate">{wh.url}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {wh.event_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={wh.enabled ? 'default' : 'secondary'}
                              className={wh.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'}
                            >
                              {wh.enabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {testResult[wh.id] ? (
                              testResult[wh.id].success ? (
                                <span className="text-emerald-600 font-medium">
                                  OK {testResult[wh.id].status_code && `(${testResult[wh.id].status_code})`}
                                </span>
                              ) : (
                                <span className="text-red-600 font-medium">
                                  Failed
                                  {testResult[wh.id].error && ` - ${testResult[wh.id].error}`}
                                </span>
                              )
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button size="sm" variant="outline" onClick={() => handleTest(wh.id)}>
                              <Send className="w-4 h-4 mr-1" />
                              Test
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openEdit(wh)}>
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create / Edit Dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-indigo-700">
                {editing ? 'Edit Webhook' : 'Create New Webhook'}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-5 py-4">
              <div className="space-y-2">
                <Label htmlFor="url" className="font-medium">
                  Webhook URL *
                </Label>
                <Input
                  id="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://example.com/webhook"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-medium">Event Type *</Label>
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
                <Label className="font-medium">Status</Label>
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
                <Label className="font-medium">Secret (optional)</Label>
                <Input
                  value={form.secret}
                  onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  placeholder="For payload verification (HMAC)"
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