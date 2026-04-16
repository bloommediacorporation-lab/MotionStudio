import React, { useState, useRef, useEffect, useCallback } from 'react';
import Titlebar from './components/Titlebar';
import { SmartZoomEngine, MouseEventRecord } from './lib/SmartZoomEngine';
import { motion } from 'motion/react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  Play, Pause, SkipBack, SkipForward, Settings, 
  MousePointer2, ZoomIn, Layout, Image as ImageIcon, 
  Download, Layers, MonitorPlay, Scissors, Video, Square, Save, Loader2,
  Trash2, Type, Smartphone, Monitor, Instagram, Wand2
} from 'lucide-react';

export default function App() {
  // UI State
  const [activeTab, setActiveTab] = useState<'templates' | 'visual' | 'zoom' | 'background'>('templates');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // Video Properties State
  const [aspectRatio, setAspectRatio] = useState('16/9');
  const [padding, setPadding] = useState(32);
  const [radius, setRadius] = useState(16);
  const [zoom, setZoom] = useState(100);
  const [bgGradient, setBgGradient] = useState('linear-gradient(135deg, #4f46e5 0%, #ec4899 100%)');
  const [motionPreset, setMotionPreset] = useState('medium');

  // Smart Zoom & Keyframes State
  const [focusPoints, setFocusPoints] = useState<{time: number, x: number, y: number, scale: number}[]>([
    { time: 0, x: 50, y: 50, scale: 100 }
  ]);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Smart Zoom Engine Ref
  const zoomEngineRef = useRef(new SmartZoomEngine());
  const recordingStartTimeRef = useRef(0);

  // --- RECORDING LOGIC ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { displaySurface: "monitor" }, 
        audio: true 
      });
      
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setVideoURL(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
        
        // Stop global mouse tracking
        try {
          await invoke('stop_mouse_tracking');
        } catch (e) {
          console.error("Failed to stop mouse tracking", e);
        }
        
        // Generate Smart Zoom keyframes automatically
        const approxDuration = (Date.now() - recordingStartTimeRef.current) / 1000;
        zoomEngineRef.current.setDuration(approxDuration);
        const autoKeyframes = zoomEngineRef.current.generateKeyframes();
        setFocusPoints(autoKeyframes);
      };

      recorder.start();
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now();
      zoomEngineRef.current.clear();
      
      // Start global mouse tracking
      try {
        await invoke('start_mouse_tracking');
      } catch (e) {
        console.error("Failed to start mouse tracking", e);
      }

      stream.getVideoTracks()[0].onended = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };
    } catch (err) {
      console.error("Error accessing display media.", err);
      alert("Nu am putut accesa ecranul. Asigură-te că ai acordat permisiunile necesare.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // --- MOUSE TRACKING FOR SMART ZOOM ---
  useEffect(() => {
    if (!isRecording) return;

    let unlistenMove: () => void;
    let unlistenClick: () => void;

    const setupListeners = async () => {
      try {
        unlistenMove = await listen<{x: number, y: number}>('global-mouse-move', (event) => {
          const time = (Date.now() - recordingStartTimeRef.current) / 1000;
          // Convert absolute coordinates to percentages (assuming primary monitor for now)
          // In a real app, you'd get the actual screen dimensions from Tauri
          const screenW = window.screen.width;
          const screenH = window.screen.height;
          const x = (event.payload.x / screenW) * 100;
          const y = (event.payload.y / screenH) * 100;
          zoomEngineRef.current.addEvent({ time, x, y, type: 'move' });
        });

        unlistenClick = await listen<{x: number, y: number, button: string}>('global-mouse-click', (event) => {
          if (event.payload.button !== 'left') return;
          const time = (Date.now() - recordingStartTimeRef.current) / 1000;
          const screenW = window.screen.width;
          const screenH = window.screen.height;
          const x = (event.payload.x / screenW) * 100;
          const y = (event.payload.y / screenH) * 100;
          zoomEngineRef.current.addEvent({ time, x, y, type: 'click' });
        });
      } catch (e) {
        console.error("Error setting up Tauri listeners", e);
      }
    };

    setupListeners();

    return () => {
      if (unlistenMove) unlistenMove();
      if (unlistenClick) unlistenClick();
    };
  }, [isRecording]);

  // --- PLAYBACK LOGIC ---
  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const skip = (amount: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + amount, duration));
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * duration;
  };

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return "00:00";
    const m = Math.floor(timeInSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // --- SMART ZOOM LOGIC ---
  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoURL || isPlaying) return; // Only add keyframes when paused for precision
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Auto-zoom to 150% if currently at 100%, otherwise use current zoom slider value
    const newScale = zoom === 100 ? 150 : zoom;
    
    const newPoint = { time: currentTime, x, y, scale: newScale };
    
    setFocusPoints(prev => {
      // Remove points that are too close to the current time to avoid clutter
      const filtered = prev.filter(p => Math.abs(p.time - currentTime) > 0.2);
      return [...filtered, newPoint].sort((a, b) => a.time - b.time);
    });
    
    setZoom(newScale);
  };

  // Calculate current active focus point based on playback time
  const activeFocus = focusPoints.slice().reverse().find(p => p.time <= currentTime) || focusPoints[0] || { x: 50, y: 50, scale: 100 };

  // --- EXPORT & SAVE LOGIC ---
  const saveProject = () => {
    const projectData = { aspectRatio, padding, radius, zoom, bgGradient, motionPreset, focusPoints };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'motionstudio-project.json';
    a.click();
  };

  const exportVideo = async () => {
    if (!videoURL) return;
    setIsExporting(true);
    setExportProgress(0);

    for (let i = 0; i <= 100; i += 2) {
      await new Promise(r => setTimeout(r, 50));
      setExportProgress(i);
    }

    const a = document.createElement('a');
    a.href = videoURL;
    a.download = 'motionstudio-export.webm';
    a.click();
    
    setIsExporting(false);
    setExportProgress(0);
  };

  // --- EFFECTS ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoURL]);

  // Sync zoom slider with active focus point during playback
  useEffect(() => {
    if (isPlaying) {
      setZoom(activeFocus.scale);
    }
  }, [activeFocus.scale, isPlaying]);

  return (
    <div className="h-screen w-full bg-neutral-950 text-neutral-200 flex flex-col font-sans overflow-hidden">
      <Titlebar />
      {/* Top Navigation */}
      <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-4 bg-neutral-900 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <MonitorPlay size={18} className="text-white" />
          </div>
          <span className="font-medium text-sm text-neutral-100">MotionStudio Web</span>
        </div>
        
        <div className="flex items-center gap-3">
          {isRecording ? (
            <button 
              onClick={stopRecording}
              className="px-4 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-md flex items-center gap-2 transition-colors shadow-lg shadow-red-500/20 animate-pulse"
            >
              <Square size={14} className="fill-white" />
              Stop Recording
            </button>
          ) : (
            <button 
              onClick={startRecording}
              className="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Video size={14} />
              Record Screen
            </button>
          )}
          
          <div className="w-px h-4 bg-neutral-700 mx-1"></div>

          <button 
            onClick={saveProject}
            className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors flex items-center gap-2"
          >
            <Save size={14} />
            Save Project
          </button>
          <button 
            onClick={exportVideo}
            disabled={!videoURL || isExporting}
            className="px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white rounded-md flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar - Tools */}
        <aside className="w-16 border-r border-neutral-800 bg-neutral-900 flex flex-col items-center py-4 gap-4 z-10">
          <ToolButton icon={<Layers size={20} />} label="Templates" active={activeTab === 'templates'} onClick={() => setActiveTab('templates')} />
          <ToolButton icon={<Layout size={20} />} label="Visual Polish" active={activeTab === 'visual'} onClick={() => setActiveTab('visual')} />
          <ToolButton icon={<ZoomIn size={20} />} label="Smart Zoom" active={activeTab === 'zoom'} onClick={() => setActiveTab('zoom')} />
          <ToolButton icon={<ImageIcon size={20} />} label="Background" active={activeTab === 'background'} onClick={() => setActiveTab('background')} />
        </aside>

        {/* Center - Canvas / Preview */}
        <main className="flex-1 bg-neutral-950 relative flex flex-col overflow-hidden">
          {/* Export Overlay */}
          {isExporting && (
            <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
              <Loader2 size={48} className="text-indigo-500 animate-spin mb-4" />
              <h2 className="text-xl font-medium text-white mb-2">Rendering Video...</h2>
              <div className="w-64 h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${exportProgress}%` }}></div>
              </div>
              <p className="text-neutral-400 text-sm mt-2">{exportProgress}% Complete</p>
            </div>
          )}

          {/* Canvas Area */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
            {/* Checkerboard background */}
            <div className="absolute inset-0 opacity-5" 
                 style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>
            
            {!videoURL && !isRecording && (
              <div className="flex flex-col items-center gap-4 z-10">
                <div className="w-20 h-20 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800 shadow-2xl">
                  <Video size={32} className="text-neutral-500" />
                </div>
                <p className="text-neutral-400 text-sm">Click "Record Screen" to start capturing.</p>
              </div>
            )}

            {isRecording && (
              <div className="flex flex-col items-center gap-4 z-10">
                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.3)] animate-pulse">
                  <div className="w-8 h-8 bg-red-500 rounded-sm"></div>
                </div>
                <p className="text-red-400 text-sm font-medium">Recording in progress...</p>
                <p className="text-neutral-500 text-xs">Use the browser controls or the Stop button above to finish.</p>
              </div>
            )}

            {/* The "Video" Container */}
            {videoURL && (
              <div 
                className="relative transition-all duration-500 ease-out flex items-center justify-center overflow-hidden"
                style={{ 
                  height: aspectRatio === '9/16' || aspectRatio === '4/5' ? '90%' : 'auto',
                  width: aspectRatio === '16/9' ? '80%' : 'auto',
                  aspectRatio: aspectRatio,
                  background: bgGradient,
                  padding: `${padding}px`,
                }}
              >
                <div 
                  className="w-full h-full bg-black shadow-2xl overflow-hidden relative flex items-center justify-center cursor-crosshair group"
                  style={{ 
                    borderRadius: `${radius}px`,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                  }}
                  onClick={handleVideoClick}
                  title={isPlaying ? "Pause to add focus points" : "Click to add a Smart Zoom focus point"}
                >
                  <motion.video 
                    ref={videoRef}
                    src={videoURL} 
                    className="w-full h-full object-cover"
                    animate={{
                      scale: activeFocus.scale / 100,
                      transformOrigin: `${activeFocus.x}% ${activeFocus.y}%`
                    }}
                    transition={{
                      type: "spring",
                      stiffness: motionPreset === 'fast' ? 150 : motionPreset === 'subtle' ? 50 : 90,
                      damping: motionPreset === 'fast' ? 20 : motionPreset === 'subtle' ? 15 : 18,
                      mass: 1
                    }}
                  />
                  
                  {/* Hover indicator for adding keyframes */}
                  {!isPlaying && (
                    <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                      <div className="bg-black/70 text-white px-3 py-1.5 rounded-full text-xs backdrop-blur-sm">
                        Click to Focus Here
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Playback Controls */}
          <div className="h-14 border-t border-neutral-800 bg-neutral-900 flex items-center justify-center gap-4 z-10 relative">
            <span className="absolute left-4 text-xs font-mono text-neutral-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <button onClick={() => skip(-5)} className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white disabled:opacity-50" disabled={!videoURL}>
              <SkipBack size={18} />
            </button>
            <button 
              onClick={togglePlayback}
              disabled={!videoURL}
              className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:bg-neutral-700 disabled:text-neutral-500"
            >
              {isPlaying ? <Pause size={20} className="fill-black" /> : <Play size={20} className="fill-black ml-1" />}
            </button>
            <button onClick={() => skip(5)} className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white disabled:opacity-50" disabled={!videoURL}>
              <SkipForward size={18} />
            </button>
          </div>
        </main>

        {/* Right Sidebar - Properties */}
        <aside className="w-72 border-l border-neutral-800 bg-neutral-900 flex flex-col z-10">
          <div className="p-4 border-b border-neutral-800 flex items-center gap-2">
            <Settings size={16} className="text-neutral-400" />
            <h2 className="text-sm font-medium">
              {activeTab === 'templates' && 'Templates'}
              {activeTab === 'visual' && 'Visual Polish'}
              {activeTab === 'zoom' && 'Smart Zoom'}
              {activeTab === 'background' && 'Background'}
            </h2>
          </div>
          
          <div className="p-4 flex flex-col gap-6 overflow-y-auto">
            
            {/* TAB: TEMPLATES */}
            {activeTab === 'templates' && (
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Canvas Size</h3>
                <div className="grid grid-cols-2 gap-2">
                  <TemplateButton icon={<Monitor size={16} />} label="YouTube" ratio="16/9" current={aspectRatio} onClick={setAspectRatio} />
                  <TemplateButton icon={<Smartphone size={16} />} label="TikTok" ratio="9/16" current={aspectRatio} onClick={setAspectRatio} />
                  <TemplateButton icon={<Instagram size={16} />} label="Square" ratio="1/1" current={aspectRatio} onClick={setAspectRatio} />
                  <TemplateButton icon={<Layout size={16} />} label="Portrait" ratio="4/5" current={aspectRatio} onClick={setAspectRatio} />
                </div>
              </div>
            )}

            {/* TAB: VISUAL POLISH */}
            {activeTab === 'visual' && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-400">Padding</span>
                    <span className="text-neutral-200">{padding}px</span>
                  </div>
                  <input 
                    type="range" min="0" max="100" value={padding}
                    onChange={(e) => setPadding(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-400">Corner Radius</span>
                    <span className="text-neutral-200">{radius}px</span>
                  </div>
                  <input 
                    type="range" min="0" max="40" value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>
            )}

            {/* TAB: ZOOM & MOTION */}
            {activeTab === 'zoom' && (
              <div className="flex flex-col gap-6">
                <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg">
                  <p className="text-xs text-indigo-300 leading-relaxed">
                    <strong>How to use:</strong> Pause the video, then click anywhere on the canvas to add a focus point. The camera will smoothly zoom there.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-400">Current Scale</span>
                    <span className="text-neutral-200">{zoom}%</span>
                  </div>
                  <input 
                    type="range" min="50" max="250" value={zoom}
                    onChange={(e) => {
                      setZoom(Number(e.target.value));
                      // Update the active focus point scale
                      if (!isPlaying && focusPoints.length > 0) {
                        const updated = [...focusPoints];
                        const activeIdx = updated.indexOf(activeFocus);
                        if (activeIdx !== -1) {
                          updated[activeIdx].scale = Number(e.target.value);
                          setFocusPoints(updated);
                        }
                      }
                    }}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Easing Preset</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <PresetButton label="Subtle" current={motionPreset} value="subtle" onClick={setMotionPreset} />
                    <PresetButton label="Medium" current={motionPreset} value="medium" onClick={setMotionPreset} />
                    <PresetButton label="Fast" current={motionPreset} value="fast" onClick={setMotionPreset} />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: BACKGROUND */}
            {activeTab === 'background' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2 flex-wrap">
                  <BgButton gradient="linear-gradient(135deg, #4f46e5 0%, #ec4899 100%)" current={bgGradient} onClick={setBgGradient} />
                  <BgButton gradient="linear-gradient(135deg, #10b981 0%, #06b6d4 100%)" current={bgGradient} onClick={setBgGradient} />
                  <BgButton gradient="linear-gradient(135deg, #f97316 0%, #e11d48 100%)" current={bgGradient} onClick={setBgGradient} />
                  <BgButton gradient="linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)" current={bgGradient} onClick={setBgGradient} />
                  <BgButton gradient="#171717" current={bgGradient} onClick={setBgGradient} />
                  <BgButton gradient="#ffffff" current={bgGradient} onClick={setBgGradient} />
                </div>
              </div>
            )}

          </div>
        </aside>
      </div>

      {/* Bottom Timeline */}
      <div className="h-56 border-t border-neutral-800 bg-neutral-950 flex flex-col">
        {/* Timeline Tools */}
        <div className="h-10 border-b border-neutral-800 bg-neutral-900 flex items-center px-4 gap-2">
          <button className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors" title="Split Clip">
            <Scissors size={14} />
          </button>
          <button className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors" title="Delete">
            <Trash2 size={14} />
          </button>
          <div className="w-px h-4 bg-neutral-700 mx-1"></div>
          <button className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors" title="Add Text">
            <Type size={14} />
          </button>
          <button className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors" title="Add Shape">
            <Square size={14} />
          </button>
          <div className="w-px h-4 bg-neutral-700 mx-1"></div>
          <button 
            className="px-2 py-1 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded text-xs font-medium transition-colors flex items-center gap-1"
            onClick={() => {
              setFocusPoints([{ time: 0, x: 50, y: 50, scale: 100 }]);
              setZoom(100);
            }}
            title="Remove all zoom keyframes"
          >
            <Wand2 size={12} /> Reset Camera
          </button>
        </div>
        
        <div className="flex-1 relative overflow-hidden p-4">
          {/* Tracks Container */}
          <div 
            className="absolute inset-0 p-4 cursor-pointer"
            onClick={handleTimelineClick}
          >
            {/* Playhead */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none transition-all duration-75"
              style={{ left: `calc(1rem + ${(currentTime / (duration || 1)) * 100}% - 1rem)` }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-sm"></div>
            </div>

            <div className="flex flex-col gap-2 mt-2 pointer-events-none">
              {/* Video Track */}
              <div className="flex items-center gap-4">
                <div className="w-16 text-xs text-neutral-500 text-right">Video</div>
                <div className="flex-1 h-14 bg-neutral-800 rounded-md border border-neutral-700 relative overflow-hidden flex">
                  {videoURL ? (
                    <div className="w-full h-full bg-indigo-600/40 border-r border-indigo-500/30 relative pointer-events-auto">
                      {/* Render Smart Zoom Keyframes */}
                      {focusPoints.map((fp, i) => (
                        <div 
                          key={i}
                          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 cursor-pointer z-10 transition-colors ${
                            fp === activeFocus ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'bg-white/70 hover:bg-white'
                          }`}
                          style={{ left: `calc(${(fp.time / (duration || 1)) * 100}% - 6px)` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            videoRef.current!.currentTime = fp.time;
                            setZoom(fp.scale);
                          }}
                          title={`Zoom: ${fp.scale}%`}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600">No media</div>
                  )}
                </div>
              </div>
              
              {/* Audio Track */}
              <div className="flex items-center gap-4">
                <div className="w-16 text-xs text-neutral-500 text-right">Audio</div>
                <div className="flex-1 h-8 bg-neutral-800/50 rounded-md border border-neutral-700/50 flex items-center px-2 overflow-hidden">
                  {videoURL && (
                    <div className="w-full h-4 flex items-center gap-[2px] opacity-30">
                      {Array.from({ length: 100 }).map((_, i) => (
                        <div key={i} className="flex-1 bg-emerald-400 rounded-full" style={{ height: `${Math.max(20, Math.random() * 100)}%` }}></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- HELPER COMPONENTS ---

function TemplateButton({ icon, label, ratio, current, onClick }: { icon: React.ReactNode, label: string, ratio: string, current: string, onClick: (r: string) => void }) {
  const isActive = current === ratio;
  return (
    <button 
      onClick={() => onClick(ratio)}
      className={`p-3 rounded-lg flex flex-col items-center gap-2 transition-all border ${
        isActive ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function PresetButton({ label, current, value, onClick }: { label: string, current: string, value: string, onClick: (v: string) => void }) {
  const isActive = current === value;
  return (
    <button 
      onClick={() => onClick(value)}
      className={`py-2 rounded text-xs font-medium transition-colors ${
        isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300'
      }`}
    >
      {label}
    </button>
  );
}

function BgButton({ gradient, current, onClick }: { gradient: string, current: string, onClick: (g: string) => void }) {
  const isActive = current === gradient;
  return (
    <div 
      onClick={() => onClick(gradient)}
      className={`w-8 h-8 rounded-full cursor-pointer transition-all ${isActive ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900' : 'opacity-50 hover:opacity-100'}`}
      style={{ background: gradient }}
    />
  );
}

function ToolButton({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all group relative
        ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}
      `}
    >
      {icon}
      <div className="absolute left-full ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
        {label}
      </div>
    </button>
  );
}
