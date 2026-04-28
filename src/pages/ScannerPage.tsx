import React, { useEffect, useState, useRef, ChangeEvent } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft, Zap, ZapOff } from 'lucide-react';

export default function ScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { products } = useStore();
  const returnTo = searchParams.get('returnTo') || '';
  
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRoutingRef = useRef(false);

  const isCameraReadyRef = useRef(false);
  const startingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    // Create scanner only if it doesn't exist
    if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
    }
    const html5QrCode = html5QrCodeRef.current;
    
    const qrCodeSuccessCallback = (decodedText: string) => {
      processText(decodedText);
    };

    const config = { 
      fps: 15,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.7;
        return { width: Math.max(size, 250), height: Math.max(size * 0.5, 150) };
      },
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: false
      },
      formatsToSupport: [ 
        Html5QrcodeSupportedFormats.QR_CODE, 
        Html5QrcodeSupportedFormats.EAN_13, 
        Html5QrcodeSupportedFormats.EAN_8, 
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF
      ],
      videoConstraints: {
        facingMode: "environment",
        // @ts-ignore
        focusMode: "continuous"
      }
    };

    const initScanner = async () => {
      // Ensure any previous scan is stopped before starting a new one
      if (html5QrCode.isScanning) {
        try {
          await html5QrCode.stop();
        } catch (e) {
          console.warn("Pre-init stop failed", e);
        }
      }

      if (startingRef.current || !isMountedRef.current) return;
      startingRef.current = true;
      setIsCameraReady(false);
      isCameraReadyRef.current = false;
      setErrorMsg(null);

      try {
        // Wait for DOM
        let attempts = 0;
        while (attempts < 10 && (!document.getElementById("qr-reader") || document.getElementById("qr-reader")?.clientWidth === 0)) {
           await new Promise(r => setTimeout(r, 200));
           attempts++;
        }

        if (!isMountedRef.current) {
          startingRef.current = false;
          return;
        }

        let started = false;
        const shouldContinue = () => isMountedRef.current && !started;

        // Try to trigger permission prompt explicitly
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            stream.getTracks().forEach(track => track.stop());
          } catch (e) {
            console.warn("Manual getUserMedia trigger failed:", e);
            if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) {
              throw new Error("相機權限未開啟。");
            }
          }
        }

        // Strategy 1: facingMode environment
        if (shouldContinue()) {
          try {
            await html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback, () => {});
            started = true;
          } catch (e) {
            console.warn("Environment facingMode failed", e);
          }
        }

        // Strategy 2: Enumeration
        if (shouldContinue()) {
          try {
            const cameras = await Html5Qrcode.getCameras();
            if (cameras && cameras.length > 0 && isMountedRef.current) {
              const backCam = cameras.find(c => /back|rear|environment|外置|後置/i.test(c.label));
              const camId = backCam ? backCam.id : cameras[cameras.length - 1].id;
              
              await html5QrCode.start(camId, config, qrCodeSuccessCallback, () => {});
              started = true;
            }
          } catch (e) {
            console.warn("getCameras failed", e);
          }
        }

        // Strategy 3: user facingMode
        if (shouldContinue()) {
          try {
            await html5QrCode.start({ facingMode: "user" }, config, qrCodeSuccessCallback, () => {});
            started = true;
          } catch (e) {
            console.warn("User facingMode failed", e);
          }
        }

        if (!started && isMountedRef.current) {
          throw new Error("無法啟動相機。可能權限遭拒或設備已被占用。");
        }

        if (!isMountedRef.current) {
          if (html5QrCode.isScanning) {
            await html5QrCode.stop().catch(() => {});
          }
          startingRef.current = false;
          return;
        }

        setIsCameraReady(true);
        isCameraReadyRef.current = true;

        // Check for zoom capabilities
        try {
          const track = html5QrCode.getRunningTrack();
          const capabilities = track.getCapabilities() as any;
          if (capabilities.zoom) {
            setSupportsZoom(true);
            setMaxZoom(capabilities.zoom.max || 1);
            setZoom(capabilities.zoom.min || 1);
          }
        } catch (e) {
          console.warn("Could not detect zoom capabilities", e);
        }
      } catch (err) {
        console.error("Final scanner error", err);
        if (isMountedRef.current) {
           setErrorMsg(err instanceof Error ? err.message : "相機啟動異常");
        }
      } finally {
        startingRef.current = false;
      }
    };

    initScanner();

    return () => {
      isMountedRef.current = false;
      if (html5QrCode.isScanning) {
        // Stop it without blocking the effect cleanup if possible, but reliably
        html5QrCode.stop().catch(() => {});
      }
    };
  }, [navigate, returnTo, products]);

  const toggleTorch = async () => {
    if (html5QrCodeRef.current && isCameraReady) {
      try {
        const newTorchState = !torchOn;
        await html5QrCodeRef.current.applyVideoConstraints({
          // @ts-ignore
          advanced: [{ torch: newTorchState }]
        });
        setTorchOn(newTorchState);
      } catch (err) {
        console.error("Error toggling torch", err);
      }
    }
  };

  const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setZoom(value);
    if (html5QrCodeRef.current && isCameraReady) {
      try {
        await html5QrCodeRef.current.applyVideoConstraints({
          // @ts-ignore
          advanced: [{ zoom: value }]
        });
      } catch (err) {
        console.error("Error applying zoom", err);
      }
    }
  };

  const processText = (text: string) => {
    if (isRoutingRef.current || !isMountedRef.current) return;
    isRoutingRef.current = true;
    setScannedResult(text);
    
    const stopAndNavigate = async () => {
      if (html5QrCodeRef.current?.isScanning) {
        await html5QrCodeRef.current.stop().catch(() => {});
      }
      
      let pid = text;
      const product = products.find(p => String(p.barcode) === text || String(p.product_id) === text);
      if (product) pid = product.product_id;

      let targetPath = returnTo;
      if (!targetPath || targetPath === '/') {
        targetPath = product ? '/products' : '/add-product';
      }
      
      const separator = targetPath.includes('?') ? '&' : '?';
      const finalUrl = `${targetPath}${separator}pid=${encodeURIComponent(pid)}`;
      
      if (isMountedRef.current) {
        navigate(finalUrl, { replace: true });
      }
    };

    stopAndNavigate();
  };

  const handleNativeCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !html5QrCodeRef.current) return;

    setIsCameraReady(false); // Show loading
    try {
      const decodedText = await html5QrCodeRef.current.scanFile(file, true);
      processText(decodedText);
    } catch (err) {
      console.error("Native capture scan error", err);
      alert("無法辨識照片中的條碼，請嘗試重新拍照或手動輸入。");
      setIsCameraReady(true);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-black overflow-hidden relative">
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        onChange={handleNativeCapture}
        className="hidden"
        ref={fileInputRef}
      />
      <header className="flex items-center p-4 bg-black/60 backdrop-blur-md border-b border-white/10 z-30">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-white rounded-full active:bg-white/20">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="ml-2 text-lg font-bold text-white">掃描條碼</h1>
        {isCameraReady && (
          <button 
            onClick={toggleTorch}
            className="ml-auto p-3 text-white rounded-full active:bg-white/20"
          >
            {torchOn ? <Zap className="w-6 h-6 text-yellow-400" /> : <ZapOff className="w-6 h-6" />}
          </button>
        )}
      </header>
      
      <div className="flex-1 relative bg-black flex flex-col items-center justify-center">
        <div id="qr-reader" className="absolute inset-0 w-full h-full z-0"></div>
        
        {/* Overlay scanning guide */}
        {!scannedResult && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
              <div className="w-[80vw] h-[40vw] border-2 border-[var(--color-accent-blue)] rounded-2xl relative shadow-[0_0_0_100vmax_rgba(0,0,0,0.7)]">
                  <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-[var(--color-accent-blue)] rounded-tl-xl"></div>
                  <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-[var(--color-accent-blue)] rounded-tr-xl"></div>
                  <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-[var(--color-accent-blue)] rounded-bl-xl"></div>
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-[var(--color-accent-blue)] rounded-br-xl"></div>
                  
                  {/* Scanning line animation */}
                  <div className="absolute left-1 right-1 h-0.5 bg-[var(--color-accent-blue)] opacity-60 shadow-[0_0_8px_var(--color-accent-blue)] animate-scan-line"></div>
              </div>
              <p className="mt-10 text-white/90 text-sm font-medium px-5 py-2 bg-black/40 rounded-full backdrop-blur-sm border border-white/10 uppercase tracking-widest">
                  請將條碼置於框內
              </p>
          </div>
        )}

        {/* Zoom Controls */}
        {isCameraReady && supportsZoom && (
          <div className="absolute bottom-40 left-0 right-0 px-10 z-20">
            <div className="flex items-center gap-4 bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/10">
              <span className="text-white/60 text-xs font-bold">1x</span>
              <input 
                type="range"
                min="1"
                max={maxZoom}
                step="0.1"
                value={zoom}
                onChange={handleZoomChange}
                className="flex-1 accent-[var(--color-accent-blue)] h-1 rounded-lg"
              />
              <span className="text-white/60 text-xs font-bold">{Math.round(maxZoom)}x</span>
            </div>
          </div>
        )}
 
        {!isCameraReady && !scannedResult && !errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-40">
             <div className="animate-spin rounded-full h-14 w-14 border-4 border-white/10 border-t-[var(--color-accent-blue)] mb-6"></div>
             <p className="text-white font-medium">相機初始化中...</p>
             <p className="text-white/40 text-xs mt-2">首次開啟可能需要較長時間</p>
             <button 
               onClick={() => window.location.reload()} 
               className="mt-10 px-5 py-2 bg-white/5 text-white/60 rounded-full text-xs border border-white/10"
             >
               重新整理
             </button>
          </div>
        )}

        {errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-50 p-8 text-center">
             <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                <ArrowLeft className="w-8 h-8 text-red-500 rotate-180" />
             </div>
             <h3 className="text-white text-lg font-bold mb-2">相機無法使用</h3>
             <p className="text-white/60 text-sm mb-10 leading-relaxed">
               {errorMsg}<br/>
               請確認已允許相機存取權限，並儘量使用手機原生瀏覽器開啟。
             </p>
             <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
               <button 
                 onClick={() => window.location.reload()} 
                 className="w-full py-4 bg-[var(--color-accent-blue)] text-white font-black rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-transform"
               >
                 重新整理
               </button>
               <button 
                 onClick={() => navigate(-1)} 
                 className="w-full py-4 bg-white/10 text-white font-bold rounded-xl active:scale-95 transition-transform"
               >
                 返回上一頁
               </button>
             </div>
          </div>
        )}

        {scannedResult && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[var(--color-accent-green)] text-black font-black px-8 py-4 rounded-full shadow-2xl z-30 animate-in fade-in zoom-in slide-in-from-bottom-4">
             成功掃描: {scannedResult}
          </div>
        )}
        
        {/* Manual Input Fallback */}
        <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-4 z-20 px-6">
           <button 
             onClick={() => fileInputRef.current?.click()}
             className="w-full max-w-sm py-3 bg-[var(--color-accent-blue)] text-black font-black rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
           >
              <Zap className="w-5 h-5 fill-current" />
              使用系統相機 (支援自動變焦)
           </button>

           <button 
             onClick={() => {
               const code = prompt("請輸入條碼或產品ID:");
               if (code) {
                  // Simulate success
                  setScannedResult(code);
                  const product = products.find(p => String(p.barcode) === code || String(p.product_id) === code);
                  const pid = product ? product.product_id : code;
                  const targetPath = returnTo || (product ? '/products' : '/add-product');
                  const separator = targetPath.includes('?') ? '&' : '?';
                  navigate(`${targetPath}${separator}pid=${encodeURIComponent(pid)}`, { replace: true });
               }
             }}
             className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white/70 text-sm rounded-full backdrop-blur-md border border-white/5 active:scale-95 transition-all"
           >
             找不到條碼？點此手動輸入
           </button>
        </div>
      </div>

      <style>{`
        @keyframes scan-line {
          0% { top: 0% }
          100% { top: 100% }
        }
        .animate-scan-line {
          animation: scan-line 2s linear infinite;
        }
        #qr-reader video {
          object-fit: cover !important;
          width: 100% !important;
          height: 100% !important;
          position: absolute;
          top: 0;
          left: 0;
        }
      `}</style>
    </div>
  );
}
