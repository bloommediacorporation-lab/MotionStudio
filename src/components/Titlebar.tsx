import { Minus, Square, X } from 'lucide-react';

export default function Titlebar() {
  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("Not running in Tauri", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.error("Not running in Tauri", e);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (e) {
      console.error("Not running in Tauri", e);
    }
  };

  return (
    <div className="h-8 bg-neutral-900 flex items-center justify-between select-none border-b border-neutral-800 shrink-0">
      <div data-tauri-drag-region className="flex items-center px-3 w-full h-full cursor-default">
        <span className="text-xs font-medium text-neutral-400 pointer-events-none">BloomCapture</span>
      </div>
      
      <div className="flex h-full shrink-0">
        <button 
          onClick={handleMinimize}
          className="h-full px-3 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors flex items-center justify-center"
        >
          <Minus size={14} />
        </button>
        <button 
          onClick={handleMaximize}
          className="h-full px-3 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors flex items-center justify-center"
        >
          <Square size={12} />
        </button>
        <button 
          onClick={handleClose}
          className="h-full px-3 hover:bg-red-500 text-neutral-400 hover:text-white transition-colors flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
