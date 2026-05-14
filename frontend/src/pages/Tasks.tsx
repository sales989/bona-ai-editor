import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../utils/auth';

const TasksPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    setLoading(true);
    const result = await api.listTasks({
      type: filterType || undefined,
      status: filterStatus || undefined,
      page,
      page_size: 20,
    });
    if (result.success && result.data) {
      setTasks(result.data.tasks);
      setTotal(result.data.total);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTasks();
  }, [page, filterType, filterStatus]);

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: '等待处理', color: 'bg-yellow-100 text-yellow-700' },
    processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
    success: { label: '已完成', color: 'bg-green-100 text-green-700' },
    failed: { label: '失败', color: 'bg-red-100 text-red-700' },
  };

  const getFileUrl = (task: any) => {
    if (task.result_file_id) {
      return `/api/files/${task.result_file_id}`;
    }
    return null;
  };

  // Auto-refresh for processing tasks
  useEffect(() => {
    const hasProcessing = tasks.some(t => t.status === 'processing' || t.status === 'pending');
    if (!hasProcessing) return;

    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, [tasks]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => window.location.href = '/'} className="text-gray-600 hover:text-primary-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-800">任务中心</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.username}</span>
            {user?.role === 'admin' && (
              <button onClick={() => window.location.href = '/admin'} className="text-sm text-gray-600 hover:text-primary-600">管理后台</button>
            )}
            <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500">退出</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <select
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="">全部类型</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="">全部状态</option>
            <option value="pending">等待处理</option>
            <option value="processing">处理中</option>
            <option value="success">已完成</option>
            <option value="failed">失败</option>
          </select>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-sm text-gray-500">加载中...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-500">暂无任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task: any) => (
              <div key={task.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        task.task_type === 'image' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {task.task_type === 'image' ? '🖼 图片' : '🎬 视频'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusLabels[task.status]?.color || ''}`}>
                        {statusLabels[task.status]?.label || task.status}
                      </span>
                      {task.progress > 0 && task.progress < 100 && (
                        <div className="flex-1 max-w-[200px]">
                          <div className="bg-gray-200 rounded-full h-1.5">
                            <div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{task.ai_prompt}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(task.created_at).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {task.status === 'success' && task.result_file_id && (
                      <a
                        href={getFileUrl(task)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        查看
                      </a>
                    )}
                    {task.error_msg && task.status === 'failed' && (
                      <span className="text-xs text-red-500 max-w-[200px] truncate" title={task.error_msg}>
                        {task.error_msg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary text-sm"
            >
              上一页
            </button>
            <span className="px-4 py-2 text-sm text-gray-600">
              第 {page} 页 / 共 {Math.ceil(total / 20)} 页
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="btn-secondary text-sm"
            >
              下一页
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default TasksPage;
