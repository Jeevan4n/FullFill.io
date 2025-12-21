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
          if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            es.close();
            eventSourceRef.current = null;
            setUploading(false);
          }
        } catch (err) {
          console.error('SSE parse error', err);
        }
      };

      es.onerror = () => {
        setError('Lost connection while tracking progress');
        es.close();
        eventSourceRef.current = null;
        setUploading(false);
      };

    } catch (err) {
      setError('Network error. Please check your connection and try again.');
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

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
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
          if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            es.close();
            eventSourceRef.current = null;
            setUploading(false);
          }
        } catch (err) {
          setError('Failed to process progress updates');
          es.close();
          setUploading(false);
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
    await fetch(`${API_BASE}/imports/${jobId}/cancel`, { method: 'POST' });
  };

  const progressPercent = jobStatus
    ? jobStatus.total_rows > 0
      ? Math.round((jobStatus.processed_rows / jobStatus.total_rows) * 100)
      : 0
    : 0;

  const getStatusText = () => {
    switch (jobStatus?.status) {
      case 'parsing': return 'Parsing CSV file...';
      case 'processing': return 'Importing products...';
      case 'completed': return 'Import completed successfully!';
      case 'failed': return 'Import failed';
      case 'cancelled': return 'Import cancelled';
      default: return 'Preparing import...';
    }
  };

  const sampleCSV = `sku,name,description,price,active
abc123,Wireless Mouse,"Compact and ergonomic",29.99,true
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
              <p className="text-blue-100">Upload your CSV file to bulk import products</p>
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
              className={`px-6 py-3 font-bold transition-all ${
                activeTab === 'upload'
                  ? 'border-b-4 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              📤 Upload CSV
            </button>
            <button
              onClick={() => setActiveTab('guide')}
              className={`px-6 py-3 font-bold transition-all ${
                activeTab === 'guide'
                  ? 'border-b-4 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              📋 Format Guide
            </button>
          </div>

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="space-y-8">
              {/* File Upload Area */}
              <div
                className={`border-4 border-dashed rounded-2xl p-12 text-center transition-all ${
                  file
                    ? 'border-green-400 bg-gradient-to-br from-green-50 to-emerald-50'
                    : 'border-gray-300 bg-gradient-to-br from-gray-50 to-blue-50 hover:border-blue-400 hover:bg-blue-50'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <div className="mb-6">
                  <svg
                    className="mx-auto h-20 w-20 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
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
                <p className="text-gray-500 mt-3">Only .csv files are supported</p>

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
                        <p className="text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
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
                  <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white font-bold">!</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-red-800 text-lg mb-1">Error</h4>
                    <p className="text-red-700">{error}</p>
                  </div>
                </div>
              )}

              {/* Progress Section */}
              {(uploading || jobStatus) && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-8 shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                      {jobStatus?.status === 'completed' ? (
                        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : jobStatus?.status === 'failed' ? (
                        <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-2xl">!</span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      )}
                      <span className="text-xl font-bold text-gray-800">{getStatusText()}</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-600">{progressPercent}%</div>
                  </div>

                  {/* Progress Bar */}
                  <div className="relative w-full h-6 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <div
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>

                  <p className="text-center text-gray-700 text-lg font-semibold">
                    Processed <span className="text-blue-600">{jobStatus?.processed_rows || 0}</span> of{' '}
                    <span className="text-blue-600">{jobStatus?.total_rows || '?'}</span> rows
                  </p>

                  {/* Action Buttons */}
                  <div className="mt-8 flex justify-center gap-4">
                    {jobStatus?.status === 'failed' && (
                      <button
                        onClick={handleRetry}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-4 rounded-xl transition-all transform hover:scale-105 flex items-center gap-3"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry Import
                      </button>
                    )}

                    {jobStatus && ['parsing', 'processing'].includes(jobStatus.status) && (
                      <button
                        onClick={handleCancel}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-4 rounded-xl transition-all transform hover:scale-105 flex items-center gap-3"
                      >
                        <span className="text-xl">✕</span>
                        Cancel Import
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upload Button */}
              {!uploading && !jobStatus && (
                <div className="text-center">
                  <button
                    onClick={handleUpload}
                    disabled={!file}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-16 py-5 rounded-xl text-xl shadow-2xl transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  >
                    🚀 Start Import
                  </button>
                </div>
              )}

              {/* Success Results */}
              {jobStatus?.status === 'completed' && (
                <div className="mt-12 text-center">
                  <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-4xl font-bold text-gray-800 mb-8">Import Completed!</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-8 shadow-lg">
                      <div className="text-6xl font-bold text-green-700 mb-3">{jobStatus.success_count}</div>
                      <p className="text-xl font-semibold text-green-800">Products Imported</p>
                    </div>

                    {jobStatus.error_count > 0 && (
                      <div className="bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-300 rounded-2xl p-8 shadow-lg">
                        <div className="text-6xl font-bold text-red-700 mb-3">{jobStatus.error_count}</div>
                        <p className="text-xl font-semibold text-red-800">Rows with Errors</p>
                      </div>
                    )}
                  </div>

                  {jobStatus.error_message && (
                    <div className="mt-8 bg-red-50 border-2 border-red-300 rounded-xl p-6 max-w-2xl mx-auto">
                      <h4 className="font-bold text-red-800 text-lg mb-2">⚠️ Import Warnings</h4>
                      <p className="text-red-700">{jobStatus.error_message}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Format Guide Tab */}
          {activeTab === 'guide' && (
            <div className="space-y-8">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-8 shadow-lg">
                <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                  📋 CSV Format Requirements
                </h2>

                <p className="text-lg text-gray-700 mb-8">
                  Your CSV file must include these <strong>exact column headers</strong>:
                </p>

                <div className="bg-gray-900 text-gray-100 p-8 rounded-xl font-mono space-y-5">
                  <div className="flex items-center gap-4">
                    <code className="bg-orange-600 px-4 py-2 rounded-lg font-bold text-lg">sku</code>
                    <span className="text-gray-300">→ <strong>Required</strong> • Unique identifier • Lowercase letters</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <code className="bg-blue-600 px-4 py-2 rounded-lg font-bold text-lg">name</code>
                    <span className="text-gray-300">→ <strong>Required</strong> • Product name</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <code className="bg-gray-600 px-4 py-2 rounded-lg font-bold text-lg">description</code>
                    <span className="text-gray-300">→ Optional • Product description</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <code className="bg-green-600 px-4 py-2 rounded-lg font-bold text-lg">price</code>
                    <span className="text-gray-300">→ Number format (e.g., 29.99)</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <code className="bg-indigo-600 px-4 py-2 rounded-lg font-bold text-lg">active</code>
                    <span className="text-gray-300">→ true/false or 1/0</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 shadow-lg">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">📝 Sample CSV Content</h3>
                <pre className="bg-gray-900 text-gray-100 p-6 rounded-xl overflow-x-auto font-mono text-sm leading-relaxed">
                  {sampleCSV}
                </pre>
              </div>

              <div className="text-center">
                <button
                  onClick={downloadSample}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold px-10 py-4 rounded-xl text-lg shadow-xl transition-all transform hover:scale-105 flex items-center gap-3 mx-auto"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Sample CSV File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}