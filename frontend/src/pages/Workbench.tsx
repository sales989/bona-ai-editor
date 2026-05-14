import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../utils/auth';
import { api } from '../api';

type TabType = 'image' | 'video';

const QUICK_TEMPLATES = [
  { label: '去除水印', prompt: '请去除图片中的水印和LOGO文字', type: 'image' },
  { label: '高清修复', prompt: '请将图片高清修复，提升清晰度', type: 'image' },
  { label: '换背景', prompt: '请替换图片背景为纯白色', type: 'image' },
  { label: '证件照换底色', prompt: '请将证件照底色更换为蓝色', type: 'image' },
  { label: '人脸修复', prompt: '请修复图片中的人脸，提升五官清晰度', type: 'image' },
  { label: '去文字杂物', prompt: '请去除图片中所有多余文字和杂物', type: 'image' },
];

const WorkbenchPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('image');
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ taskId: string; fileId?: string } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup preview URLs
  useEffect(() => {
    return () => filePreviews.forEach(url => URL.revokeObjectURL(url));
  }, [filePreviews]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    // Validate type
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];

    const validTypes = activeTab === 'image' ? validImageTypes : [...validImageTypes, ...validVideoTypes];
    const invalidFiles = selected.filter(f => !validTypes.includes(f.type));

    if (invalidFiles.length > 0) {
      setError(`不支持的文件格式: ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    // Size check (50MB limit)
    const oversized = selected.filter(f => f.size > 50 * 1024 * 1024);
    if (oversized.length > 0) {
      setError(`文件超过50MB限制: ${oversized.map(f => f.name).join(', ')}`);
      return;
    }

    setFiles(prev => [...prev, ...selected]);
    setError('');

    // Generate previews
    const newPreviews = selected.map(f => URL.createObjectURL(f));
    setFilePreviews(prev => [...prev, ...newPreviews]);
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(filePreviews[index]);
    setFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError('请先上传文件');
      return;
    }
    if (!prompt.trim()) {
      setError('请输入编辑指令');
      return;
    }

    setError('');
    setProcessing(true);

    try {
      // Step 1: Upload files
      setUploading(true);
      const uploadResult = await api.uploadFiles(files);
      setUploading(false);

      if (!uploadResult.success || !uploadResult.data) {
        setError(uploadResult.error || '上传失败');
        setProcessing(false);
        return;
      }

      // Step 2: Create task
      const taskResult = await api.createTask(
        activeTab,
        uploadResult.data.file_ids,
        prompt
      );

      if (!taskResult.success || !taskResult.data) {
        setError(taskResult.error || '创建任务失败');
        setProcessing(false);
        return;
      }

      // Step 3: Poll for result
      const taskId = taskResult.data.task_id;
      await pollTaskResult(taskId);

    } catch (err) {
      setError('处理失败: ' + (err instanceof Error ? err.message : '未知错误'));
      setProcessing(false);
    }
  };

  const pollTaskResult = async (taskId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max

    const poll = async (): Promise<void> => {
      attempts++;
      const result = await api.getTask(taskId);

      if (!result.success || !result.data) {
        setError('获取任务状态失败');
        setProcessing(false);
        return;
      }

      const task = result.data;

      if (task.status === 'success') {
        setResult({ taskId: task.id, fileId: task.result_file_id });
        setProcessing(false);
        return;
      }

      if (task.status === 'failed') {
        setError(task.error_msg || '处理失败');
        setProcessing(false);
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        setError('处理超时，请稍后查看任务中心');
        setProcessing(false);
      }
    };

    await poll();
  };

  const handleQuickTemplate = (template: typeof QUICK_TEMPLATES[0]) => {
    setActiveTab(template.type as TabType);
    setPrompt(template.prompt);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">BONA</h1>
              <p className="text-xs text-gray-500">AI图文编辑平台</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user?.role === 'admin' && (
              <button
                onClick={() => window.location.hash = '#/admin'}
                className="text-sm text-gray-600 hover:text-primary-600"
              >
                管理后台
              </button>
            )}
            <button
              onClick={() => window.location.hash = '#/tasks'}
              className="text-sm text-gray-600 hover:text-primary-600"
            >
              任务中心
            </button>
            <span className="text-sm text-gray-500">{user?.username}</span>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500">
              退出
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Tab Switcher */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 inline-flex items-center">
            <button
              onClick={() => setActiveTab('image')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'image'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🖼 图片编辑
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'video'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🎬 视频编辑
            </button>
            <a
              href="https://0519i.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 px-6 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 transition-all inline-flex items-center gap-1.5"
            >
              🌐 外贸图床
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>

          {/* Quick Templates */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-700 mb-3">快捷指令模板</h3>
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickTemplate(t)}
                  className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-600 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload Area */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {activeTab === 'image' ? '上传图片' : '上传视频'}
            </h3>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all"
            >
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-500">
                点击上传或拖拽文件到此处
              </p>
              <p className="text-xs text-gray-400 mt-1">
                支持 {activeTab === 'image' ? 'JPG/PNG/WebP/GIF' : 'MP4/MOV/AVI'}，单文件最大50MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={activeTab === 'image' ? 'image/*' : 'video/*,image/*'}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* File Previews */}
            {files.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {files.map((file, i) => (
                  <div key={i} className="relative group">
                    {file.type.startsWith('video/') ? (
                      <video src={filePreviews[i]} className="w-full h-24 object-cover rounded-lg" />
                    ) : (
                      <img src={filePreviews[i]} alt="" className="w-full h-24 object-cover rounded-lg" />
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      ×
                    </button>
                    <p className="text-xs text-gray-500 mt-1 truncate">{file.name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prompt Input */}
          <div className="card">
            <h3 className="text-sm font-medium text-gray-700 mb-3">编辑指令</h3>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="请输入自然语言编辑指令，例如：请去除图片中的所有文字和水印..."
              className="input-field min-h-[100px] resize-none"
              rows={4}
            />
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={uploading || processing}
              className="btn-primary px-8 py-3 text-base"
            >
              {uploading ? '上传中...' : processing ? '处理中...' : '开始处理'}
            </button>
            {error && (
              <span className="text-sm text-red-500">{error}</span>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className="card border-green-200 bg-green-50">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">处理完成！</span>
              </div>
              {result.fileId && (
                <div className="flex gap-3">
                  <a
                    href={`/api/files/${result.fileId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-sm"
                  >
                    预览成品
                  </a>
                  <a
                    href={`/api/files/${result.fileId}`}
                    download
                    className="btn-secondary text-sm"
                  >
                    下载文件
                  </a>
                  <button
                    onClick={() => {
                      setResult(null);
                      setPrompt('');
                      setFiles([]);
                      setFilePreviews([]);
                    }}
                    className="btn-secondary text-sm"
                  >
                    继续编辑
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default WorkbenchPage;
