import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../utils/auth';

interface UserItem {
  id: string;
  username: string;
  role: string;
  status: number;
  created_at: string;
}

const AdminPage: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<'users' | 'api' | 'stats'>('stats');

  // Stats
  const [stats, setStats] = useState({ totalUsers: 0, totalTasks: 0, successTasks: 0, failedTasks: 0 });

  // Users
  const [users, setUsers] = useState<UserItem[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [resetPassword, setResetPassword] = useState<{ id: string; username: string; password: string } | null>(null);

  // API Configs
  const [apiConfigs, setApiConfigs] = useState<any[]>([]);
  const [editingApi, setEditingApi] = useState<{ provider: string; api_key: string } | null>(null);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  useEffect(() => {
    loadStats();
    loadUsers();
    loadApiConfigs();
  }, []);

  const loadStats = async () => {
    const result = await api.getStats();
    if (result.success && result.data) setStats(result.data);
  };

  const loadUsers = async () => {
    const result = await api.listUsers();
    if (result.success && result.data) setUsers(result.data);
  };

  const loadApiConfigs = async () => {
    const result = await api.getApiConfigs();
    if (result.success && result.data) setApiConfigs(result.data);
  };

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.password) return;
    const result = await api.createUser(newUser.username, newUser.password, newUser.role);
    if (result.success) {
      showMessage('success', '用户创建成功');
      setShowAddUser(false);
      setNewUser({ username: '', password: '', role: 'user' });
      loadUsers();
    } else {
      showMessage('error', result.error || '创建失败');
    }
  };

  const handleToggleUser = async (userId: string, currentStatus: number) => {
    const result = await api.updateUserStatus(userId, currentStatus === 1 ? 0 : 1);
    if (result.success) {
      showMessage('success', '状态已更新');
      loadUsers();
    } else {
      showMessage('error', result.error || '更新失败');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('确定删除此用户？此操作不可撤销。')) return;
    const result = await api.deleteUser(userId);
    if (result.success) {
      showMessage('success', '用户已删除');
      loadUsers();
    } else {
      showMessage('error', result.error || '删除失败');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassword || !resetPassword.password) return;
    const result = await api.resetUserPassword(resetPassword.id, resetPassword.password);
    if (result.success) {
      showMessage('success', '密码已重置');
      setResetPassword(null);
    } else {
      showMessage('error', result.error || '重置失败');
    }
  };

  const handleSaveApiConfig = async () => {
    if (!editingApi || !editingApi.api_key) return;
    const result = await api.saveApiConfig(editingApi.provider, editingApi.api_key);
    if (result.success) {
      showMessage('success', 'API配置已保存');
      setEditingApi(null);
      loadApiConfigs();
    } else {
      showMessage('error', result.error || '保存失败');
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">需要管理员权限</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => window.location.href = '/'} className="text-gray-600 hover:text-primary-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-800">管理后台</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.username}</span>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-red-500">退出</button>
          </div>
        </div>
      </header>

      {/* Message Toast */}
      {message && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm z-50 ${
          message.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {message.text}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Nav Tabs */}
        <div className="flex gap-1 bg-white rounded-xl shadow-sm border border-gray-100 p-1 mb-6 inline-flex">
          {[
            { key: 'stats', label: '📊 数据概览' },
            { key: 'users', label: '👥 用户管理' },
            { key: 'api', label: '🔑 API配置' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSection === tab.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats Section */}
        {activeSection === 'stats' && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: '总用户数', value: stats.totalUsers, color: 'bg-blue-50 text-blue-700' },
              { label: '总任务数', value: stats.totalTasks, color: 'bg-purple-50 text-purple-700' },
              { label: '成功任务', value: stats.successTasks, color: 'bg-green-50 text-green-700' },
              { label: '失败任务', value: stats.failedTasks, color: 'bg-red-50 text-red-700' },
            ].map(s => (
              <div key={s.label} className={`card ${s.color}`}>
                <p className="text-sm opacity-80">{s.label}</p>
                <p className="text-3xl font-bold mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Users Section */}
        {activeSection === 'users' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">用户列表</h3>
              <button onClick={() => setShowAddUser(true)} className="btn-primary text-sm">
                + 新增用户
              </button>
            </div>

            {/* Add User Modal */}
            {showAddUser && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-6 w-96">
                  <h3 className="font-medium mb-4">新增用户</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="用户名"
                      value={newUser.username}
                      onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                      className="input-field"
                    />
                    <input
                      type="password"
                      placeholder="密码"
                      value={newUser.password}
                      onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                      className="input-field"
                    />
                    <select
                      value={newUser.role}
                      onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                      className="input-field"
                    >
                      <option value="user">普通用户</option>
                      <option value="admin">管理员</option>
                    </select>
                    <div className="flex gap-2">
                      <button onClick={handleCreateUser} className="btn-primary flex-1">创建</button>
                      <button onClick={() => setShowAddUser(false)} className="btn-secondary flex-1">取消</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Reset Password Modal */}
            {resetPassword && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white rounded-2xl p-6 w-96">
                  <h3 className="font-medium mb-4">重置密码 - {resetPassword.username}</h3>
                  <input
                    type="password"
                    placeholder="新密码"
                    value={resetPassword.password}
                    onChange={e => setResetPassword({ ...resetPassword, password: e.target.value })}
                    className="input-field mb-3"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleResetPassword} className="btn-primary flex-1">确认重置</button>
                    <button onClick={() => setResetPassword(null)} className="btn-secondary flex-1">取消</button>
                  </div>
                </div>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">用户名</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">角色</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">状态</th>
                  <th className="text-left py-2 px-3 text-gray-600 font-medium">创建时间</th>
                  <th className="text-right py-2 px-3 text-gray-600 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3">{u.username}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        u.status === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {u.status === 1 ? '启用' : '禁用'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-500">
                      {new Date(u.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => handleToggleUser(u.id, u.status)}
                          className={`text-xs px-2 py-1 rounded ${u.status === 1 ? 'text-yellow-600 hover:bg-yellow-50' : 'text-green-600 hover:bg-green-50'}`}
                        >
                          {u.status === 1 ? '禁用' : '启用'}
                        </button>
                        <button
                          onClick={() => setResetPassword({ id: u.id, username: u.username, password: '' })}
                          className="text-xs px-2 py-1 rounded text-blue-600 hover:bg-blue-50"
                        >
                          改密
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50"
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* API Configs Section */}
        {activeSection === 'api' && (
          <div className="space-y-6">
            {/* Atlas Cloud - 一站式聚合API */}
            <div className="card border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">⚡ Atlas Cloud — 一站式聚合API</h3>
                      <p className="text-sm text-gray-500">一个API Key调用所有主流AI模型，大幅降低开发和维护成本</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                      (() => { const c = apiConfigs.find(x => x.provider === 'atlas'); return c?.api_key ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'; })()
                    }`}>
                      {(function() { const c = apiConfigs.find(x => x.provider === 'atlas'); return c?.api_key ? '✅ 已配置' : '⚠️ 未配置'; })()}
                    </span>
                  </div>

                  {/* Supported models */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { name: '即梦AI', model: 'Seedance 2.0', emoji: '🎬' },
                      { name: '可灵AI', model: 'Kling 3.0', emoji: '🎨' },
                      { name: 'Luma', model: 'Ray 3', emoji: '✨' },
                      { name: 'ElevenLabs', model: 'v3 官方API', emoji: '🔊' },
                      { name: 'GPT Image', model: '2.0', emoji: '🖼️' },
                      { name: 'Google', model: 'Nano Banana 2', emoji: '🍌' },
                    ].map(m => (
                      <div key={m.name} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2 border border-gray-100">
                        <span>{m.emoji}</span>
                        <div>
                          <p className="text-xs font-medium text-gray-700">{m.name}</p>
                          <p className="text-[10px] text-gray-400">{m.model}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Config input */}
                  <div className="mt-4">
                    {(function() {
                      const atlasConfig = apiConfigs.find(x => x.provider === 'atlas');
                      const isEditing = editingApi?.provider === 'atlas';
                      return isEditing ? (
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="输入 Atlas Cloud API Key"
                            value={editingApi.api_key}
                            onChange={e => setEditingApi({ ...editingApi, api_key: e.target.value })}
                            className="input-field flex-1"
                          />
                          <button onClick={handleSaveApiConfig} className="btn-primary text-sm">保存</button>
                          <button onClick={() => setEditingApi(null)} className="btn-secondary text-sm">取消</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingApi({ provider: 'atlas', api_key: '' })}
                          className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                        >
                          {atlasConfig?.api_key ? '🔄 重新配置 API Key' : '🔑 配置 API Key'}
                        </button>
                      );
                    })()}
                  </div>

                  {(() => {
                    const c = apiConfigs.find(x => x.provider === 'atlas');
                    return c?.api_key ? (
                      <p className="text-xs text-green-600 mt-2">✅ Atlas Cloud 已配置，系统将自动路由各类型任务至最优AI模型</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-2">💡 配置后系统自动调用即梦AI(Seedance 2.0)、可灵AI(Kling 3.0)、Luma Ray 3、ElevenLabs v3、GPT Image 2.0、Google Nano Banana 2 等API</p>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* laozhang.ai - 一站式聚合API */}
            <div className="card border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">🧠 laozhang.ai — 一站式聚合API</h3>
                      <p className="text-sm text-gray-500">
                        通过一个 API Key 调用 Gemini 3 Pro Image 等模型
                        <a href="https://docs.laozhang.ai/api-manual" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-800 ml-1 underline">查看文档 →</a>
                      </p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                      (() => { const c = apiConfigs.find(x => x.provider === 'laozhang-ai'); return c?.api_key ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'; })()
                    }`}>
                      {(function() { const c = apiConfigs.find(x => x.provider === 'laozhang-ai'); return c?.api_key ? '✅ 已配置' : '⚠️ 未配置'; })()}
                    </span>
                  </div>

                  {/* Supported models */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { name: 'Gemini 3 Pro', model: 'Image Generation', emoji: '🖼️' },
                      { name: 'Gemini 3 Pro', model: 'Vision & OCR', emoji: '👁️' },
                      { name: 'Gemini 3 Pro', model: 'Text Generation', emoji: '💬' },
                    ].map(m => (
                      <div key={m.name} className="flex items-center gap-2 bg-white/70 rounded-lg px-3 py-2 border border-gray-100">
                        <span>{m.emoji}</span>
                        <div>
                          <p className="text-xs font-medium text-gray-700">{m.name}</p>
                          <p className="text-[10px] text-gray-400">{m.model}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Config input */}
                  <div className="mt-4">
                    {(function() {
                      const lzConfig = apiConfigs.find(x => x.provider === 'laozhang-ai');
                      const isEditing = editingApi?.provider === 'laozhang-ai';
                      return isEditing ? (
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="输入 laozhang.ai API Key"
                            value={editingApi.api_key}
                            onChange={e => setEditingApi({ ...editingApi, api_key: e.target.value })}
                            className="input-field flex-1"
                          />
                          <button onClick={handleSaveApiConfig} className="btn-primary text-sm">保存</button>
                          <button onClick={() => setEditingApi(null)} className="btn-secondary text-sm">取消</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingApi({ provider: 'laozhang-ai', api_key: '' })}
                          className="text-sm text-primary-600 hover:text-primary-800 font-medium"
                        >
                          {lzConfig?.api_key ? '🔄 重新配置 API Key' : '🔑 配置 API Key'}
                        </button>
                      );
                    })()}
                  </div>

                  {(() => {
                    const c = apiConfigs.find(x => x.provider === 'laozhang-ai');
                    return c?.api_key ? (
                      <p className="text-xs text-green-600 mt-2">✅ laozhang.ai 已配置，系统将自动调用 Gemini 3 Pro Image 等模型</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-2">💡 配置后系统通过 laozhang.ai 统一调用 Google Gemini 系列模型</p>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* 独立API配置 */}
            <div className="card">
              <h3 className="font-medium mb-1">独立API配置（可选）</h3>
              <p className="text-sm text-gray-500 mb-4">
                如已有特定厂商API Key，也可单独配置，系统将优先使用独立配置。
              </p>
              <div className="space-y-4">
                {[
                  { provider: 'picwish', name: '佐糖 PicWish', desc: '精准消除（去水印/去文字/去杂物）', link: 'https://picwish.com', icon: '🖌️' },
                  { provider: 'dashscope', name: '阿里云通义万相', desc: '人脸替换/证件照换底色/精细编辑', link: 'https://dashscope.aliyun.com', icon: '☁️' },
                ].map(cfg => {
                  const config = apiConfigs.find(c => c.provider === cfg.provider);
                  return (
                    <div key={cfg.provider} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{cfg.icon} {cfg.name}</h4>
                          <p className="text-sm text-gray-500">{cfg.desc}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          config?.api_key ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {config?.api_key ? '已配置' : '可选'}
                        </span>
                      </div>
                      {editingApi?.provider === cfg.provider ? (
                        <div className="flex gap-2 mt-2">
                          <input
                            type="password"
                            placeholder="输入API Key"
                            value={editingApi.api_key}
                            onChange={e => setEditingApi({ ...editingApi, api_key: e.target.value })}
                            className="input-field flex-1"
                          />
                          <button onClick={handleSaveApiConfig} className="btn-primary text-sm">保存</button>
                          <button onClick={() => setEditingApi(null)} className="btn-secondary text-sm">取消</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingApi({ provider: cfg.provider, api_key: '' })}
                          className="text-sm text-primary-600 hover:text-primary-800 mt-1"
                        >
                          {config?.api_key ? '重新配置' : '配置密钥'}
                        </button>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        API文档：<a href={cfg.link} target="_blank" rel="noopener noreferrer" className="text-primary-500">{cfg.link}</a>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
