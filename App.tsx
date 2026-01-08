
import React, { useState, useMemo } from 'react';
import { ProductionStage, Status, Project } from './types';
import { STAGE_CONFIG, MOCK_PROJECTS } from './constants';
import { StageWrapper } from './components/StageWrapper';
import { ScriptEditor } from './components/ScriptEditor';
import { DeliverReview } from './components/DeliverReview';
import { StoryboardEditor } from './components/StoryboardEditor';
import { AnimationEditor } from './components/AnimationEditor';
import { AudioEditor } from './components/AudioEditor';
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
  Play
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
  
  const [filterType, setFilterType] = useState<'ALL' | 'NOVEL' | 'COMIC'>('ALL');

  // 进入项目
  const enterProject = (project: Project) => {
    setSelectedProject(project);
    setViewMode('PRODUCTION');
    setCurrentStage(ProductionStage.SCRIPT);
  };

  const filteredProjects = useMemo(() => {
    if (filterType === 'ALL') return MOCK_PROJECTS;
    return MOCK_PROJECTS.filter(p => p.originalWorkType === filterType);
  }, [filterType]);

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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
            <input className="bg-white/5 border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-64" placeholder="搜索书名、作者..." />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-500 transition-all">
            <PlusCircle size={16} /> 导入新作品
          </button>
        </div>
      </nav>

      {/* 媒体库内容区 */}
      <div className="flex-1 overflow-y-auto p-12">
        <div className="max-w-7xl mx-auto">
          <header className="mb-10">
            <h2 className="text-3xl font-bold text-white mb-2">欢迎回来</h2>
            <p className="text-white/30 text-sm">你有 3 个项目正在等待审核反馈</p>
          </header>

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
                      <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/20 hover:bg-white/20">
                        <MoreVertical size={20} />
                      </div>
                    </div>
                  </div>
                  {/* 状态标 */}
                  <div className="absolute top-4 left-4 flex flex-col gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase text-white tracking-widest">
                      {p.originalWorkType}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${
                      p.productionStatus === 'IN_PROGRESS' ? 'bg-blue-600/40 border-blue-500 text-blue-100' : 'bg-green-600/40 border-green-500 text-green-100'
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
        </div>
      </div>
    </div>
  );

  const renderProduction = () => {
    if (!selectedProject) return null;

    const renderContent = () => {
      const episode = selectedProject.episodes[0];
      switch (currentStage) {
        case ProductionStage.SCRIPT:
          return episode ? <ScriptEditor episode={episode} /> : <div className="p-20 text-center text-white/20">暂无剧本</div>;
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
