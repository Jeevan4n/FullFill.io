"use client";
import { useState, useRef } from 'react';

const API_BASE = 'http://localhost:5000/api';

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
    const selectedFile = e.target.files[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a valid CSV file (.csv)');
      setFile(null);
      e.target.value = '';
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
          if (job.error) {
            setError(job.error);
            es.close();
            setUploading(false);
            return;
          }

          setJobStatus(job);

          // Close stream on final states
          if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) {
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
          if (job.error) {
            setError(job.error);
            es.close();
            setUploading(false);
            return;
          }
          setJobStatus(job);
          if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) {
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
    if (!jobId || !jobStatus) return;

    try {
      await fetch(`${API_BASE}/imports/${jobId}/cancel`, { method: 'POST' });
    } catch (err) {
      setError('Failed to cancel import');
    }
  };

  // FIXED: Progress calculation with fallback to 100% on completion
  const getProgressPercent = () => {
    if (!jobStatus) return 0;

    const finalStates = ['completed', 'completed_with_errors', 'failed', 'cancelled'];
    if (finalStates.includes(jobStatus.status)) {
      return 100; // Always show 100% when done
    }

    if (jobStatus.status === 'parsing') {
      return 15; // Visual feedback during parsing
    }

    if (jobStatus.total_rows > 0) {
      return Math.min(99, Math.round((jobStatus.processed_rows / jobStatus.total_rows) * 100));
    }

    return 30; // Fallback during early processing
  };

  const progressPercent = getProgressPercent();

  const getStatusText = () => {
    if (!jobStatus) return 'Ready to upload';

    switch (jobStatus.status) {
      case 'parsing': return 'Parsing CSV file and counting rows...';
      case 'processing': return 'Importing products...';
      case 'completed': return 'Import completed successfully!';
      case 'completed_with_errors': return 'Import completed with some warnings';
      case 'failed': return 'Import failed';
      case 'cancelled': return 'Import cancelled';
      default: return 'Preparing import...';
    }
  };

  const getStatusIcon = () => {
    if (!jobStatus) return null;

    if (jobStatus.status === 'completed') {
      return <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center text-white text-4xl">✓</div>;
    }
    if (jobStatus.status === 'completed_with_errors') {
      return <div className="w-14 h-14 bg-orange-500 rounded-full flex items-center justify-center text-white text-4xl">⚠</div>;
    }
    if (jobStatus.status === 'failed' || jobStatus.status === 'cancelled') {
      return <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center text-white text-4xl">✕</div>;
    }
    return <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>;
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">Import Products from CSV</h1>
              <p className="text-blue-100">Supports up to 500,000 products • Real-time progress • Duplicate SKUs overwritten</p>
            </div>
            <button
              onClick={() => window.location.href = '/'}
              className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-6 py-3 rounded-lg shadow-lg transition-all transform hover:scale-105 flex items-center gap-2"
            >
              ← Back to Products
            </button>
          </div>
        </div>

        <div className="p-8">
          {/* Tabs */}
          <div className="mb-8 flex gap-2 border-b-2 border-gray-200">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-3 font-bold transition-all ${activeTab === 'upload' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              Upload CSV
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-6 py-3 font-bold transition-all ${activeTab === 'guide' ? 'border-b-4 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}
            >
              Format Guide
            </button>
          </div>

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="space-y-8">
              {/* File Upload Area */}
              <div
                className={`border-4 border-dashed rounded-2xl p-12 text-center transition-all ${file ? 'border-green-400 bg-gradient-to-br from-green-50 to-emerald-50' : 'border-gray-300 bg-gradient-to-br from-gray-50 to-blue-50 hover:border-blue-400 hover:bg-blue-50'}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <div className="mb-6">
                  <svg className="mx-auto h-20 w-20 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>

                <label htmlFor="csv-upload" className="cursor-pointer">
                  <span className="text-xl font-bold text-gray-700 hover:text-blue-600 transition-colors">
                    Click to browse or drag & drop your CSV file here
                  </span>
                  <input
                    ref={fileInputRef}
                    id="csv-upload"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <p className="text-gray-500 mt-3">Maximum file size: 500MB • Supports large imports</p>

                {file && (
                  <div className="mt-8 p-6 bg-white rounded-xl border-2 border-green-300 shadow-lg flex items-center justify-between max-w-lg mx-auto">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-green-100 rounded-lg flex items-center justify-center">
                        <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-lg text-gray-800">{file.name}</p>
                        <p className="text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="w-10 h-10 rounded-full hover:bg-red-100 text-red-600 font-bold transition-all flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 flex items-start gap-4">
                  <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xl font-bold">!</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-red-800 text-lg">Import Error</h4>
                    <p className="text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              )}

              {/* Progress Section */}
              {(uploading || jobStatus) && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-8 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-5">
                      {getStatusIcon()}
                      <div>
                        <p className="text-2xl font-bold text-gray-800">{getStatusText()}</p>
                        {jobStatus?.error_message && (jobStatus.status === 'completed_with_errors' || jobStatus.status === 'failed') && (
                          <p className="text-sm text-orange-700 mt-2 max-w-2xl">{jobStatus.error_message}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-5xl font-bold text-blue-600">{progressPercent}%</div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-10 mb-8 overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-700 ease-out rounded-full flex items-center justify-end pr-6 text-white text-xl font-bold"
                      style={{ width: `${progressPercent}%` }}
                    >
                      {progressPercent > 15 && `${progressPercent}%`}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                    <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-gray-600">Processed Rows</p>
                      <p className="text-2xl font-bold text-blue-600">{jobStatus?.processed_rows?.toLocaleString() || '0'}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-gray-600">Total Rows</p>
                      <p className="text-2xl font-bold text-gray-800">{jobStatus?.total_rows?.toLocaleString() || '—'}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-gray-600">Success</p>
                      <p className="text-2xl font-bold text-green-600">{jobStatus?.success_count?.toLocaleString() || '0'}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-gray-600">Errors</p>
                      <p className="text-2xl font-bold text-red-600">{jobStatus?.error_count?.toLocaleString() || '0'}</p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-10 flex justify-center gap-6">
                    {['failed', 'completed_with_errors'].includes(jobStatus?.status) && (
                      <button
                        onClick={handleRetry}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 py-4 rounded-xl shadow-lg transition-all transform hover:scale-105 flex items-center gap-3"
                      >
                        🔄 Retry Import
                      </button>
                    )}
                    {['parsing', 'processing'].includes(jobStatus?.status) && (
                      <button
                        onClick={handleCancel}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-10 py-4 rounded-xl shadow-lg transition-all transform hover:scale-105 flex items-center gap-3"
                      >
                        ✕ Cancel Import
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upload Button */}
              {!uploading && !jobStatus && file && (
                <div className="text-center">
                  <button
                    onClick={handleUpload}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-20 py-6 rounded-2xl text-2xl shadow-2xl transition-all transform hover:scale-105"
                  >
                    🚀 Start Bulk Import
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Format Guide Tab */}
          {activeTab === 'guide' && (
            <div className="space-y-10">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-10 shadow-xl">
                <h2 className="text-4xl font-bold text-center text-gray-800 mb-8">CSV Format Guide</h2>
                <p className="text-xl text-center text-gray-700 mb-10">
                  Duplicate SKUs will be <strong>overwritten</strong> (case-insensitive). SKU uniqueness is enforced.
                </p>

                <div className="grid md:grid-cols-2 gap-10">
                  <div className="space-y-6">
                    <h3 className="text-2xl font-bold text-gray-800">Columns</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4"><code className="bg-red-600 text-white px-4 py-2 rounded font-bold">sku</code> <span className="font-semibold">Required • Unique (case-insensitive)</span></div>
                      <div className="flex items-center gap-4"><code className="bg-red-600 text-white px-4 py-2 rounded font-bold">name</code> <span className="font-semibold">Required • Product name</span></div>
                      <div className="flex items-center gap-4"><code className="bg-gray-600 text-white px-4 py-2 rounded font-bold">description</code> <span>Optional</span></div>
                      <div className="flex items-center gap-4"><code className="bg-gray-600 text-white px-4 py-2 rounded font-bold">price</code> <span>Optional • Decimal (e.g., 29.99)</span></div>
                      <div className="flex items-center gap-4"><code className="bg-gray-600 text-white px-4 py-2 rounded font-bold">active</code> <span>Optional • true/false, 1/0 (default: true)</span></div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-4">Sample CSV</h3>
                    <pre className="bg-gray-900 text-gray-100 p-6 rounded-xl overflow-x-auto font-mono text-sm">
                      {sampleCSV}
                    </pre>
                  </div>
                </div>

                <div className="text-center mt-12">
                  <button
                    onClick={downloadSample}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold px-12 py-5 rounded-2xl text-xl shadow-2xl transition-all transform hover:scale-105 flex items-center gap-4 mx-auto"
                  >
                    📥 Download Sample CSV
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}