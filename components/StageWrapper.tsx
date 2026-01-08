
import React from 'react';

interface StageWrapperProps {
  children: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}

export const StageWrapper: React.FC<StageWrapperProps> = ({ children, title, actions }) => {
  return (
    <div className="flex flex-col h-full bg-[#121212]">
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#1a1a1a]">
        <h2 className="text-lg font-semibold tracking-tight text-white/90 uppercase">{title}</h2>
        <div className="flex items-center gap-4">
          {actions}
        </div>
      </header>
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
};
