// app/imports/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Upload } from 'lucide-react';

const API_BASE_URL = 'http://localhost:5000/api'; // Adjust if backend is on different port/host

export default function ImportsPage() {
  const [file, setFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [processedRows, setProcessedRows] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    resetState();
  };

  const resetState = () => {
    setJobId(null);
    setStatus(null);
    setProcessedRows(0);
    setTotalRows(0);
    setErrorMessage(null);
    setUploadProgress(0);
    setIsUploading(false);
    setIsPolling(false);
    if (pollingRef.current) clearInterval(pollingRef.current);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    resetState(); // Clear previous states but keep file

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/imports`, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsUploading(false);
      if (xhr.status === 202) {
        const response = JSON.parse(xhr.responseText);
        setJobId(response.job_id);
        setStatus(response.status);
        startPolling(response.job_id);
      } else {
        setErrorMessage('Upload failed. Please try again.');
      }
    };

    xhr.onerror = () => {
      setIsUploading(false);
      setErrorMessage('Upload error. Check your connection.');
    };

    xhr.send(formData);
  };

  const startPolling = (id) => {
    setIsPolling(true);
    pollingRef.current = setInterval(() => fetchStatus(id), 1000); // Poll every 1 second
  };

  const fetchStatus = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/imports/${id}/status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
        setProcessedRows(data.processed_rows || 0);
        setTotalRows(data.total_rows || 0);
        setErrorMessage(data.error_message || null);

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          clearInterval(pollingRef.current);
          setIsPolling(false);
        }
      } else {
        setErrorMessage('Failed to fetch status.');
        clearInterval(pollingRef.current);
        setIsPolling(false);
      }
    } catch (error) {
      setErrorMessage('Error fetching status.');
      clearInterval(pollingRef.current);
      setIsPolling(false);
    }
  };

  const handleRetry = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/imports/${jobId}/retry`, { method: 'POST' });
      if (response.ok) {
        setStatus('queued');
        setErrorMessage(null);
        startPolling(jobId);
      } else {
        setErrorMessage('Retry failed.');
      }
    } catch (error) {
      setErrorMessage('Error during retry.');
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;

    try {
      const response = await fetch(`${API_BASE_URL}/imports/${jobId}/cancel`, { method: 'POST' });
      if (response.ok) {
        setStatus('cancelled');
        clearInterval(pollingRef.current);
        setIsPolling(false);
      } else {
        setErrorMessage('Cancel failed.');
      }
    } catch (error) {
      setErrorMessage('Error during cancel.');
    }
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const getProgress = () => {
    if (totalRows === 0) return 0;
    return Math.round((processedRows / totalRows) * 100);
  };

  const getStatusMessage = () => {
    if (isUploading) return 'Uploading file...';
    switch (status) {
      case 'queued': return 'Job queued...';
      case 'parsing': return 'Parsing CSV...';
      case 'importing': return `Importing products (${processedRows}/${totalRows})`;
      case 'completed': return 'Import completed successfully!';
      case 'failed': return 'Import failed.';
      case 'cancelled': return 'Import cancelled.';
      default: return 'Ready to upload.';
    }
  };

  const showProgressBar = isUploading || (status === 'importing');
  const progressValue = isUploading ? uploadProgress : getProgress();
  const isProcessing = status === 'queued' || status === 'parsing' || status === 'importing';
  const canCancel = isProcessing && !isUploading;
  const showRetry = status === 'failed';

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">Product Importer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">
              Select CSV File
            </label>
            <Input
              id="file-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full"
            />
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || isUploading || isProcessing}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" /> Upload and Import
          </Button>

          {showProgressBar && (
            <div className="space-y-2">
              <Progress value={progressValue} className="w-full" />
              <p className="text-sm text-center text-gray-600">{progressValue}%</p>
            </div>
          )}

          <p className="text-center font-medium">{getStatusMessage()}</p>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {status === 'completed' && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Products imported successfully.</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-between">
            {canCancel && (
              <Button variant="destructive" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            {showRetry && (
              <Button variant="outline" onClick={handleRetry}>
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}