'use client'

import { useState, useRef } from 'react'
import { 
  Upload, FileText, CheckCircle, AlertCircle, XCircle, 
  RotateCw, X, Download, ArrowLeft, Loader2 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'

const API_BASE = 'http://127.0.0.1:5000/api'

export default function ImportsPage() {
  const [file, setFile] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  
  const eventSourceRef = useRef(null)
  const fileInputRef = useRef(null)

  // Reliable progress (frontend calculation as fallback)
  const progressPercent = jobStatus?.total_rows > 0
    ? Math.min(100, Math.round((jobStatus.processed_rows / jobStatus.total_rows) * 100))
    : jobStatus?.progress ?? 0

  const resetJob = () => {
    setJobId(null)
    setJobStatus(null)
    setErrorMsg('')
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (!selected?.name.toLowerCase().endsWith('.csv')) {
      setErrorMsg('Please select a .csv file')
      setFile(null)
      e.target.value = ''
      return
    }
    setFile(selected)
    setErrorMsg('')
    resetJob()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.toLowerCase().endsWith('.csv')) {
      setFile(dropped)
      setErrorMsg('')
      resetJob()
    } else {
      setErrorMsg('Please drop a .csv file')
    }
  }

  const startSSE = (jid) => {
    const es = new EventSource(`${API_BASE}/imports/${jid}/status-stream`)
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        setJobStatus(data)
        if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(data.status)) {
          es.close()
          eventSourceRef.current = null
          setUploading(false)
        }
      } catch (err) {
        console.error('SSE parse error:', err)
      }
    }

    es.onerror = () => {
      setErrorMsg('Lost connection to progress updates')
      es.close()
      eventSourceRef.current = null
      setUploading(false)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setErrorMsg('')
    resetJob()

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/imports`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')

      setJobId(data.job_id)
      startSSE(data.job_id)
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start import')
      setUploading(false)
    }
  }

  const handleRetry = async () => {
    if (!jobId) return
    setIsRetrying(true)
    setErrorMsg('')

    try {
      const res = await fetch(`${API_BASE}/imports/${jobId}/retry`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Retry failed')
      }
      startSSE(jobId)
    } catch (err) {
      setErrorMsg(err.message || 'Could not retry import')
    } finally {
      setIsRetrying(false)
    }
  }

  const handleCancel = async () => {
    if (!jobId) return
    setIsCancelling(true)

    try {
      const res = await fetch(`${API_BASE}/imports/${jobId}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error('Cancel request failed')
    } catch (err) {
      setErrorMsg('Failed to cancel import')
    } finally {
      setIsCancelling(false)
    }
  }

  const getStatusInfo = () => {
    if (!jobStatus) return { text: 'Ready', color: 'text-gray-600', icon: null }

    const states = {
      processing: { text: 'Processing...', color: 'text-indigo-700', icon: <Loader2 className="w-12 h-12 animate-spin text-indigo-600" /> },
      completed: { text: 'Success!', color: 'text-emerald-700', icon: <CheckCircle className="w-12 h-12 text-emerald-600" /> },
      'completed_with_errors': { text: 'Finished with Errors', color: 'text-amber-700', icon: <AlertCircle className="w-12 h-12 text-amber-600" /> },
      failed: { text: 'Failed', color: 'text-red-700', icon: <XCircle className="w-12 h-12 text-red-600" /> },
      cancelled: { text: 'Cancelled', color: 'text-red-700', icon: <XCircle className="w-12 h-12 text-red-600" /> },
    }

    return states[jobStatus.status] || { text: 'Unknown', color: 'text-gray-600', icon: null }
  }

  const status = getStatusInfo()

  const sampleCsv = `sku,name,description,price,active
PROD001,Wireless Mouse,"Ergonomic 2.4GHz mouse",29.99,true
CBL-USB,USB-C Cable 1m,"Fast charging",12.50,true
DEMO-01,Sample Item,,0.00,false`

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto">
        <Card className="shadow-2xl border-0">
          <div className="bg-gradient-to-r from-indigo-600 to-violet-700 text-white p-10">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-4xl font-bold flex items-center gap-3">
                  <Upload className="w-10 h-10" />
                  CSV Product Import
                </h1>
                <p className="text-indigo-100 mt-2 text-lg">
                  Bulk upload • Real-time progress • Price required • Duplicates update existing products
                </p>
              </div>
              <Link href="/">
                <Button variant="secondary" className="bg-white/90 text-indigo-700 hover:bg-white">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Products
                </Button>
              </Link>
            </div>
          </div>

          <CardContent className="p-8">
            <Tabs defaultValue="upload">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="guide">Format Guide</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-10">
                {/* Drop Zone */}
                <div
                  className={`border-4 border-dashed rounded-2xl p-16 text-center transition-all ${
                    file ? 'border-emerald-500 bg-emerald-50/60' : 'border-gray-300 hover:border-indigo-400 bg-gray-50/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className={`w-20 h-20 mx-auto mb-6 ${file ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <p className="text-2xl font-semibold mb-2">
                    {file ? 'File Selected' : 'Drop CSV here or click to browse'}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {file && (
                    <div className="mt-8 inline-flex items-center gap-4 bg-white p-4 rounded-lg shadow-sm border">
                      <FileText className="w-10 h-10 text-emerald-600" />
                      <div className="text-left">
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </div>

                {errorMsg && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-5 w-5" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}

                {(uploading || jobStatus) && (
                  <Card className="border-indigo-200 shadow-xl">
                    <CardContent className="p-10 space-y-8">
                      <div className="flex items-center justify-between gap-6">
                        {status.icon}
                        <div className="flex-1">
                          <h3 className={`text-3xl font-bold ${status.color}`}>
                            {status.text}
                          </h3>
                          {jobStatus?.processed_rows > 0 && (
                            <p className="mt-2 text-indigo-600">
                              {jobStatus.processed_rows.toLocaleString()} of{' '}
                              {jobStatus.total_rows?.toLocaleString() || '?'} rows processed
                            </p>
                          )}
                        </div>
                        <div className="text-5xl font-extrabold text-indigo-600">
                          {progressPercent}%
                        </div>
                      </div>

                      <Progress value={progressPercent} className="h-10" />

                      {jobStatus?.status === 'completed_with_errors' && jobStatus.error_message && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-5 w-5" />
                          <AlertTitle>Import Completed with Errors</AlertTitle>
                          <AlertDescription className="mt-2 whitespace-pre-wrap text-sm">
                            {jobStatus.error_message}
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                        <div>
                          <p className="text-gray-600 text-sm">Processed</p>
                          <p className="text-3xl font-bold">{jobStatus?.processed_rows?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Success</p>
                          <p className="text-3xl font-bold text-emerald-700">{jobStatus?.success_count?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Errors</p>
                          <p className="text-3xl font-bold text-red-600">{jobStatus?.error_count?.toLocaleString() || '0'}</p>
                        </div>
                        <div>
                          <p className="text-gray-600 text-sm">Total</p>
                          <p className="text-3xl font-bold">{jobStatus?.total_rows?.toLocaleString() || '—'}</p>
                        </div>
                      </div>

                      <div className="flex justify-center gap-6 flex-wrap">
                        {['failed', 'completed_with_errors'].includes(jobStatus?.status) && (
                          <Button
                            onClick={handleRetry}
                            disabled={isRetrying}
                            size="lg"
                            className="min-w-[180px]"
                          >
                            {isRetrying ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <RotateCw className="mr-2 h-5 w-5" />}
                            Retry Import
                          </Button>
                        )}

                        {jobStatus?.status === 'processing' && (
                          <Button
                            variant="destructive"
                            size="lg"
                            onClick={handleCancel}
                            disabled={isCancelling}
                            className="min-w-[180px]"
                          >
                            {isCancelling ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <X className="mr-2 h-5 w-5" />}
                            Cancel Import
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!uploading && !jobStatus && file && (
                  <div className="text-center pt-6">
                    <Button
                      onClick={handleUpload}
                      size="lg"
                      className="h-16 px-12 text-xl bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-700 hover:to-violet-800"
                    >
                      <Upload className="mr-3 h-6 w-6" />
                      Start Import
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="guide">
                <div className="prose max-w-none">
                  <h2 className="text-3xl font-bold text-center mb-8">CSV Import Format Guide</h2>
                  
                  <p className="text-center text-lg mb-8">
                    <strong>Required columns:</strong> sku, name, price<br/>
                    <strong>Optional:</strong> description, active (defaults to true)
                  </p>

                  <div className="bg-gray-900 text-gray-100 p-6 rounded-xl font-mono text-sm overflow-x-auto mb-8">
                    <pre>{sampleCsv}</pre>
                  </div>

                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-xl font-semibold mb-4">Rules</h3>
                      <ul className="list-disc pl-6 space-y-2">
                        <li>SKU is unique (case-insensitive)</li>
                        <li>Existing products with same SKU will be updated</li>
                        <li>Price must be a positive number</li>
                        <li>Active can be: true/false, 1/0, yes/no</li>
                      </ul>
                    </div>
                    <div className="text-center">
                      <Button
                        onClick={() => {
                          const blob = new Blob([sampleCsv], { type: 'text/csv' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = 'sample-import.csv'
                          a.click()
                          URL.revokeObjectURL(url)
                        }}
                        size="lg"
                        className="mt-4"
                      >
                        <Download className="mr-2 h-5 w-5" />
                        Download Sample CSV
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}