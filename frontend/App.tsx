
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ProductionStage, Status, Project, Episode } from './types';
import { STAGE_CONFIG } from './constants';
import { StageWrapper } from './components/StageWrapper';
import { ScriptEditor } from './components/ScriptEditor';
import { DeliverReview } from './components/DeliverReview';
import { StoryboardEditor } from './components/StoryboardEditor';
import { AnimationEditor } from './components/AnimationEditor';
import { AudioEditor } from './components/AudioEditor';
import { ImportBookModal } from './components/ImportBookModal';
import { authApi, authStorage, bookApi, booksToProjects, BookType, CreateBookRequest, AuthResponse } from './api';
import { AuthPage } from './components/AuthPage';
import {
  Bell,
  Settings,
  LayoutGrid,
  Search,
  ChevronRight,
  Monitor,
  Activity,
  Filter,
  BookOpen,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Grid,
  PlusCircle,
  MoreVertical,
  Play,
  Loader2,
  AlertCircle,
  RefreshCw,
  Pencil,
  Trash2
} from 'lucide-react';

const STATUS_MAP: Record<Status, string> = {
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  REVIEWING: '审核中',
  REVISING: '修改中',
  COMPLETED: '已完成'
};

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<'DASHBOARD' | 'PRODUCTION'>('DASHBOARD');
  const [currentStage, setCurrentStage] = useState<ProductionStage>(ProductionStage.SCRIPT);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthResponse['user'] | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(() => authStorage.getToken());

  const [filterType, setFilterType] = useState<'ALL' | 'NOVEL' | 'COMIC'>('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<CreateBookRequest | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);

  // 项目列表状态
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 导入弹窗状态
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleAuthSuccess = (auth: AuthResponse) => {
    setAuthToken(auth.token);
    setCurrentUser(auth.user);
  };

  const handleLogout = () => {
    authStorage.clear();
    setAuthToken(null);
    setCurrentUser(null);
    setSelectedProject(null);
    setViewMode('DASHBOARD');
  };

  // 防抖处理搜索关键词
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    if (!authToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const params: { type?: BookType; keyword?: string; size?: number } = { size: 100 };
      if (filterType !== 'ALL') {
        params.type = filterType;
      }
      if (debouncedKeyword.trim()) {
        params.keyword = debouncedKeyword.trim();
      }
      const response = await bookApi.list(params);
      setProjects(booksToProjects(response.data));
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError(err instanceof Error ? err.message : '加载失败，请检查网络连接');
    } finally {
      setIsLoading(false);
    }
  }, [filterType, debouncedKeyword, authToken]);

  // 初始加载和筛选变化时重新加载
  useEffect(() => {
    if (authToken) {
      loadProjects();
    } else {
      setIsLoading(false);
    }
  }, [loadProjects, authToken]);

  // 如果有 token，获取当前用户信息，失效则清空
  useEffect(() => {
    const fetchMe = async () => {
      if (!authToken) return;
      try {
        const user = await authApi.me();
        setCurrentUser(user);
      } catch (err) {
        console.error('Failed to fetch user, clearing auth', err);
        handleLogout();
      }
    };
    fetchMe();
  }, [authToken]);

  // 监听点击关闭下拉菜单
  useEffect(() => {
    const handleClick = () => setActiveMenuId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // 创建新作品
  const handleCreateBook = async (data: CreateBookRequest) => {
    await bookApi.create(data);
    // 重新加载列表
    await loadProjects();
  };

  // 进入项目
  const enterProject = (project: Project) => {
    setSelectedProject({ ...project, episodes: project.episodes || [] });
    setViewMode('PRODUCTION');
    setCurrentStage(ProductionStage.SCRIPT);
  };

  const handleEpisodesChange = (episodes: Episode[]) => {
    setSelectedProject(prev => (prev ? { ...prev, episodes } : prev));
    setProjects(prev => prev.map(p => (p.id === selectedProject?.id ? { ...p, episodes } : p)));
  };

  const handleDeleteBook = async (projectId: string) => {
    if (!window.confirm('确定删除该作品吗？此操作不可撤销。')) return;
    setDeletingId(projectId);
    try {
      await bookApi.delete(Number(projectId));
      await loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('删除失败，请稍后再试');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditBook = async (project: Project) => {
    setEditingBookId(project.id);
    setIsEditModalOpen(true);
    setIsEditLoading(true);
    try {
      const book = await bookApi.getById(Number(project.id));
      setEditingData({
        title: book.title,
        author: book.author,
        cover: book.cover || '',
        type: book.type,
        description: book.description || '',
      });
    } catch (err) {
      console.error('Failed to load book detail:', err);
      setEditingData({
        title: project.title,
        author: project.author,
        cover: project.cover,
        type: project.originalWorkType,
        description: '',
      });
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleUpdateBook = async (data: CreateBookRequest) => {
    if (!editingBookId) return;
    await bookApi.update(Number(editingBookId), data);
    await loadProjects();
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingBookId(null);
    setEditingData(null);
    setIsEditLoading(false);
  };

  if (!authToken || !currentUser) {
    return <AuthPage onSuccess={handleAuthSuccess} />;
  }

  const filteredProjects = projects;

  const renderDashboard = () => (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* 媒体库顶栏 */}
      <nav className="h-16 border-b border-white/5 bg-[#0f0f0f] px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-black text-xl italic shadow-lg shadow-blue-900/40">M</div>
            <h1 className="font-bold text-white tracking-tighter text-lg">ManjuFlow</h1>
          </div>
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
            <button 
              onClick={() => setFilterType('ALL')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${filterType === 'ALL' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >全部</button>
            <button 
              onClick={() => setFilterType('NOVEL')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${filterType === 'NOVEL' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >小说库</button>
            <button 
              onClick={() => setFilterType('COMIC')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${filterType === 'COMIC' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
            >漫画库</button>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold uppercase">
              {(currentUser.nickname || currentUser.username || '?')[0]}
            </div>
            <div>
              <div className="font-semibold leading-tight">{currentUser.nickname || currentUser.username}</div>
              <div className="text-white/40 text-xs">{currentUser.username}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/50 text-sm hover:text-white underline underline-offset-4"
          >
            退出登录
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
            <input
              className="bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
              placeholder="搜索书名、作者..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-500 transition-all"
          >
            <PlusCircle size={16} /> 导入新作品
          </button>
        </div>
      </nav>

      {/* 媒体库内容区 */}
      <div className="flex-1 overflow-y-auto p-12">
        <div className="max-w-7xl mx-auto">
          <header className="mb-10">
            <h2 className="text-3xl font-bold text-white mb-2">欢迎回来</h2>
            <p className="text-white/30 text-sm">
              {isLoading ? '正在加载...' : `共有 ${filteredProjects.length} 个作品`}
            </p>
          </header>

          {/* 加载状态 */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 size={40} className="text-blue-500 animate-spin mb-4" />
              <p className="text-white/40 text-sm">正在加载作品列表...</p>
            </div>
          )}

          {/* 错误状态 */}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle size={40} className="text-red-400 mb-4" />
              <p className="text-red-400 text-sm mb-4">{error}</p>
              <button
                onClick={loadProjects}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg text-sm hover:bg-white/10 transition-all"
              >
                <RefreshCw size={16} /> 重新加载
              </button>
            </div>
          )}

          {/* 空状态 */}
          {!isLoading && !error && filteredProjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <BookOpen size={40} className="text-white/20 mb-4" />
              <p className="text-white/40 text-sm mb-4">
                {searchKeyword ? '没有找到匹配的作品' : '暂无作品，点击上方按钮导入'}
              </p>
              {!searchKeyword && (
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-500 transition-all"
                >
                  <PlusCircle size={16} /> 导入新作品
                </button>
              )}
            </div>
          )}

          {/* 作品列表 */}
          {!isLoading && !error && filteredProjects.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-10">
              {filteredProjects.map(p => (
                <div
                  key={p.id}
                  onClick={() => enterProject(p)}
                  className="group relative flex flex-col cursor-pointer"
                >
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 relative shadow-2xl transition-all duration-500 group-hover:-translate-y-2 group-hover:border-blue-500/50">
                    <img src={p.cover} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={p.title} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-12 bg-white text-black rounded-xl flex items-center justify-center font-bold text-sm tracking-widest gap-2">
                          <Play size={16} fill="currentColor" /> 进入制作
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(activeMenuId === p.id ? null : p.id);
                            }}
                            className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/20 hover:bg-white/20"
                          >
                            <MoreVertical size={20} />
                          </button>
                          {activeMenuId === p.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 bottom-14 w-40 bg-[#101010] border border-white/10 rounded-xl shadow-2xl py-1 z-30"
                            >
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/5 flex items-center gap-2 transition-colors"
                                onClick={() => {
                                  setActiveMenuId(null);
                                  handleEditBook(p);
                                }}
                              >
                                <Pencil size={16} />
                                <span>编辑</span>
                              </button>
                              <button
                                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={deletingId === p.id}
                                onClick={() => {
                                  setActiveMenuId(null);
                                  handleDeleteBook(p.id);
                                }}
                              >
                                {deletingId === p.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Trash2 size={16} />
                                )}
                                <span>{deletingId === p.id ? '删除中...' : '删除'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 状态标 */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase text-white tracking-widest">
                        {p.originalWorkType}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${
                        p.productionStatus === 'IN_PROGRESS' ? 'bg-blue-600/40 border-blue-500 text-blue-100' :
                        p.productionStatus === 'COMPLETED' ? 'bg-green-600/40 border-green-500 text-green-100' :
                        'bg-zinc-600/40 border-zinc-500 text-zinc-100'
                      }`}>
                        {STATUS_MAP[p.productionStatus]}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 px-1">
                    <h4 className="text-white font-bold text-lg group-hover:text-blue-400 transition-colors truncate">{p.title}</h4>
                    <p className="text-white/30 text-xs font-medium uppercase tracking-wider">{p.author}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 导入作品弹窗 */}
      <ImportBookModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSubmit={handleCreateBook}
      />
      <ImportBookModal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        onSubmit={handleUpdateBook}
        initialData={editingData || undefined}
        mode="edit"
        isLoading={isEditLoading}
      />
    </div>
  );

  const renderProduction = () => {
    if (!selectedProject) return null;

    const renderContent = () => {
      const episode = selectedProject.episodes[0];
      switch (currentStage) {
        case ProductionStage.SCRIPT:
          return (
            <ScriptEditor
              episodes={selectedProject.episodes}
              onEpisodesChange={handleEpisodesChange}
            />
          );
        case ProductionStage.ART:
          return episode ? <StoryboardEditor episode={episode} /> : <div className="p-20 text-center text-white/20">暂无剧本</div>;
        case ProductionStage.ANIMATE:
          return episode ? <AnimationEditor episode={episode} /> : <div className="p-20 text-center text-white/20">暂无分镜</div>;
        case ProductionStage.AUDIO:
          return episode ? <AudioEditor episode={episode} /> : <div className="p-20 text-center text-white/20">暂无动画</div>;
        case ProductionStage.REVIEW:
          return <DeliverReview videoUrl={episode?.scenes[0]?.clipUrl} />;
        default:
          return null;
      }
    };

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* 生产区顶栏 */}
        <nav className="h-14 bg-[#1a1a1a] border-b border-white/10 flex items-center justify-between px-6 z-20 shadow-xl">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setViewMode('DASHBOARD')}
              className="p-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all flex items-center gap-2 group"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-xs font-bold uppercase tracking-widest">返回书库</span>
            </button>
            <div className="h-6 w-[1px] bg-white/10" />
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
                <span className="text-white">{selectedProject.title}</span>
                <ChevronRight size={14} className="opacity-30" />
                <span className="text-blue-400">第一话 制作中</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 px-3 py-1.5 bg-white/5 rounded-full border border-white/10">
               <Activity size={14} className="text-green-500" />
               <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">云端实时同步</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden">
              <img src="https://picsum.photos/seed/avatar/40" alt="user" />
            </div>
          </div>
        </nav>

        {/* 模块主视图 */}
        <div className="flex-1 overflow-hidden">
          <StageWrapper title={`${STAGE_CONFIG.find(s => s.stage === currentStage)?.label}`}>
            {renderContent()}
          </StageWrapper>
        </div>

        {/* DaVinci 风格底部导航 */}
        <footer className="h-20 bg-[#161616] border-t border-white/10 flex items-center justify-center z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 backdrop-blur-md">
            {STAGE_CONFIG.map(({ stage, label, icon }) => (
              <button
                key={stage}
                onClick={() => setCurrentStage(stage)}
                className={`flex flex-col items-center justify-center w-24 h-14 rounded-lg transition-all relative group ${
                  currentStage === stage ? 'text-white' : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <div className={`mb-1 transition-transform group-hover:scale-110 ${currentStage === stage ? 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`}>
                  {icon}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
                {currentStage === stage && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" />
                )}
              </button>
            ))}
          </div>
        </footer>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen overflow-hidden text-white selection:bg-blue-500/30">
      {viewMode === 'DASHBOARD' ? renderDashboard() : renderProduction()}
    </div>
  );
};

export default App;
