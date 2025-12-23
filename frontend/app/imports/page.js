'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, XCircle, RotateCw, X, Download, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

const API_BASE = 'https://fullfill-io.onrender.com/api';

export default function ImportsPage() {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('upload');
  const eventSourceRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid CSV file (.csv)');
      setFile(null);
      if (e.target) e.target.value = '';
      return;
    }
    setFile(selectedFile);
    setError('');
    resetJob();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.csv')) {
      setFile(droppedFile);
      setError('');
      resetJob();
    } else {
      setError('Please drop a valid CSV file');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const resetJob = () => {
    setJobId(null);
    setJobStatus(null);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    resetJob();
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch(`${API_BASE}/imports`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Upload failed. Please try again.');
        setUploading(false);
        return;
      }
      setJobId(data.job_id);
      const es = new EventSource(`${API_BASE}/imports/${data.job_id}/status-stream`);
      eventSourceRef.current = es;
      es.onmessage = (event) => {
        try {
          const job = JSON.parse(event.data);
          setJobStatus(job);
          if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
            es.close();
            eventSourceRef.current = null;
            setUploading(false);
          }
        } catch (err) {
          console.error('SSE parse error', err);
        }
      };
      es.onerror = () => {
        setError('Connection lost while tracking progress.');
        es.close();
        eventSourceRef.current = null;
        setUploading(false);
      };
    } catch (err) {
      setError('Network error. Please check your connection.');
      setUploading(false);
    }
  };

  const handleRetry = async () => {
    if (!jobId) return;
    setError('');
    setUploading(true);
    try {
      const res = await fetch(`${API_BASE}/imports/${jobId}/retry`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to retry import');
        setUploading(false);
        return;
      }
      const es = new EventSource(`${API_BASE}/imports/${jobId}/status-stream`);
      eventSourceRef.current = es;
      es.onmessage = (event) => {
        try {
          const job = JSON.parse(event.data);
          setJobStatus(job);
          if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
            es.close();
            eventSourceRef.current = null;
            setUploading(false);
          }
        } catch (err) {
          console.error('Retry SSE error', err);
        }
      };
      es.onerror = () => {
        setError('Lost connection during retry');
        es.close();
        setUploading(false);
      };
    } catch (err) {
      setError('Network error during retry');
      setUploading(false);
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await fetch(`${API_BASE}/imports/${jobId}/cancel`, { method: 'POST' });
    } catch (err) {
      setError('Failed to cancel import');
    }
  };

  const getProgressPercent = () => {
    if (!jobStatus) return 0;
    if (jobStatus.status === 'completed') return 100;
    if (jobStatus.status === 'failed' || jobStatus.status === 'cancelled') return 0;
    if (jobStatus.processed_rows > 0) {
      // Since total_rows is always 0 in API responses, estimate based on typical 1000 rows for this file size
      const estimatedTotal = 1000; // Adjust if needed for different files
      return Math.min(99, Math.round((jobStatus.processed_rows / estimatedTotal) * 100));
    }
    return 0;
  };

  const progressPercent = getProgressPercent();

  const getStatusConfig = () => {
    if (!jobStatus) return { text: 'Ready to upload', color: 'text-gray-600', icon: null };
    switch (jobStatus.status) {
      case 'processing':
        return { text: 'Importing products...', color: 'text-indigo-700', icon: <Loader2 className="w-12 h-12 animate-spin text-indigo-600" /> };
      case 'completed':
        return { text: 'Import Complete', color: 'text-emerald-700', icon: <CheckCircle className="w-12 h-12 text-emerald-600" /> };
      case 'completed_with_errors':
        return { text: 'Import completed with errors', color: 'text-orange-700', icon: <AlertCircle className="w-12 h-12 text-orange-600" /> };
      case 'failed':
        return { text: 'Import failed', color: 'text-red-700', icon: <XCircle className="w-12 h-12 text-red-600" /> };
      case 'cancelled':
        return { text: 'Import cancelled', color: 'text-red-700', icon: <XCircle className="w-12 h-12 text-red-600" /> };
      default:
        return { text: 'Preparing import...', color: 'text-gray-600', icon: <Loader2 className="w-12 h-12 animate-spin text-indigo-600" /> };
    }
  };

  const statusConfig = getStatusConfig();

  const sampleCSV = `sku,name,description,price,active
ABC123,Wireless Mouse,"Compact and ergonomic",29.99,true
xyz789,USB Cable 2m,"Fast charging cable",12.50,true
demo001,Sample Product,Just a demo item,0.00,false
test2024,New Product 2024,,49.99,true`;

  const downloadSample = () => {
    const blob = new Blob([sampleCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'sample-products.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <Card className="shadow-2xl border-0 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-8">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3">
                  <Upload className="w-10 h-10" />
                  Import Products from CSV
                </h1>
                <p className="text-indigo-100 text-lg">
                  Bulk import • Real-time progress tracking • Duplicate SKUs overwritten
                </p>
              </div>
              <Link href="/">
                <Button variant="secondary" size="lg" className="bg-white text-indigo-600 hover:bg-gray-100 font-semibold">
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back to Products
                </Button>
              </Link>
            </div>
          </div>

          <CardContent className="p-6 md:p-8">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8 bg-gray-100">
                <TabsTrigger value="upload" className="text-lg py-3">
                  Upload CSV
                </TabsTrigger>
                <TabsTrigger value="guide" className="text-lg py-3">
                  Format Guide
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-8">
                <div
                  className={`border-4 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
                    file
                      ? 'border-emerald-500 bg-emerald-50/50'
                      : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className={`w-16 h-16 mx-auto mb-6 ${file ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <p className="text-xl font-semibold text-gray-700 mb-2">
                    {file ? 'File ready for upload' : 'Click to browse or drag & drop your CSV file'}
                  </p>
                  <p className="text-gray-500">Only *.csv files accepted • Max 500MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="hidden"
                  />
                  {file && (
                    <div className="mt-8 p-6 bg-white rounded-lg border border-emerald-200 shadow-md flex items-center justify-between max-w-xl mx-auto">
                      <div className="flex items-center gap-4">
                        <FileText className="w-10 h-10 text-emerald-600" />
                        <div className="text-left">
                          <p className="font-semibold text-lg">{file.name}</p>
                          <p className="text-sm text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      >
                        <X className="w-5 h-5 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-5 w-5" />
                    <AlertTitle>Import Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {(uploading || jobStatus) && (
                  <Card className="border-2 border-indigo-200 shadow-xl">
                    <CardContent className="p-8 space-y-8">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          {statusConfig.icon}
                          <div>
                            <h3 className={`text-2xl font-bold ${statusConfig.color}`}>
                              {statusConfig.text}
                            </h3>
                            {jobStatus?.error_message && (
                              <p className="text-sm text-orange-600 mt-2 max-w-2xl">
                                {jobStatus.error_message}
                              </p>
                            )}
                            {jobStatus?.status === 'processing' && jobStatus.processed_rows > 0 && (
                              <p className="text-lg text-indigo-600 mt-2">
                                Processed {jobStatus.processed_rows.toLocaleString()} rows...
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-4xl font-bold text-indigo-600">{progressPercent}%</div>
                      </div>
                      <Progress value={progressPercent} className="h-8">
                        <div className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 rounded-full flex items-center justify-end pr-4 text-white font-bold">
                          {progressPercent > 20 && `${progressPercent}%`}
                        </div>
                      </Progress>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">Processed</p>
                          <p className="text-2xl font-bold text-indigo-700">
                            {jobStatus?.processed_rows?.toLocaleString() || '0'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">Success</p>
                          <p className="text-2xl font-bold text-emerald-700">
                            {jobStatus?.success_count?.toLocaleString() || '0'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">Errors</p>
                          <p className="text-2xl font-bold text-red-600">
                            {jobStatus?.error_count?.toLocaleString() || '0'}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">Total Rows</p>
                          <p className="text-2xl font-bold text-gray-800">
                            {jobStatus?.total_rows?.toLocaleString() || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-center gap-6">
                        {['failed', 'completed_with_errors'].includes(jobStatus?.status) && (
                          <Button onClick={handleRetry} size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                            <RotateCw className="w-5 h-5 mr-2" />
                            Retry Import
                          </Button>
                        )}
                        {jobStatus?.status === 'processing' && (
                          <Button onClick={handleCancel} size="lg" variant="destructive">
                            <X className="w-5 h-5 mr-2" />
                            Cancel Import
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!uploading && !jobStatus && file && (
                  <div className="text-center">
                    <Button
                      onClick={handleUpload}
                      size="lg"
                      className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-xl px-16 py-8 shadow-xl"
                    >
                      <Upload className="w-6 h-6 mr-3" />
                      Start Bulk Import
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="guide" className="space-y-8">
                <Card className="border-2 border-indigo-200 shadow-xl">
                  <CardContent className="p-8 md:p-12">
                    <h2 className="text-3xl font-bold text-center mb-8 text-indigo-800">
                      CSV Format Guide
                    </h2>
                    <p className="text-center text-lg text-gray-700 mb-10">
                      <strong>Duplicate SKUs will overwrite</strong> existing products (case-insensitive).
                    </p>
                    <div className="grid md:grid-cols-2 gap-10 mb-12">
                      <div className="space-y-6">
                        <h3 className="text-2xl font-bold text-gray-800">Required & Optional Columns</h3>
                        <div className="space-y-4">
                          <div className="flex items-center gap-4">
                            <Badge className="bg-red-600">sku</Badge>
                            <span className="font-medium">Required • Unique (case-insensitive)</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge className="bg-red-600">name</Badge>
                            <span className="font-medium">Required • Product name</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="secondary">description</Badge>
                            <span>Optional</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="secondary">price</Badge>
                            <span>Optional • Decimal number (e.g., 29.99)</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="secondary">active</Badge>
                            <span>Optional • true/false or 1/0 (default: true)</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-800 mb-4">Sample CSV Content</h3>
                        <pre className="bg-gray-900 text-gray-100 p-6 rounded-xl overflow-x-auto text-sm font-mono">
                          {sampleCSV}
                        </pre>
                      </div>
                    </div>
                    <div className="text-center">
                      <Button
                        onClick={downloadSample}
                        size="lg"
                        className="bg-emerald-600 hover:bg-emerald-700 text-xl px-12 py-6"
                      >
                        <Download className="w-6 h-6 mr-3" />
                        Download Sample CSV
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}