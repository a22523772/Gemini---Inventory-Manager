import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { 
  ArrowLeft, 
  Zap, 
  ZapOff, 
  Camera, 
  Keyboard, 
  RotateCcw, 
  Search, 
  X, 
  Package, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export default function ScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { products } = useStore();
  const productsRef = useRef(products);
  const returnTo = searchParams.get('returnTo') || '';

  // Keep products ref up to date to avoid effect re-runs
  useEffect(() => {
    productsRef.current = products;
  }, [products]);
  
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [supportsZoom, setSupportsZoom] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRoutingRef = useRef(false);

  const isCameraReadyRef = useRef(false);
  const startingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Filter products for manual input autocomplete
  const filteredProducts = React.useMemo(() => {
    if (!manualCode.trim()) return products.slice(0, 8);
    const q = manualCode.trim().toLowerCase();
    return products.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.product_id && p.product_id.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [products, manualCode]);

  useEffect(() => {
    isMountedRef.current = true;
    
    const qrCodeSuccessCallback = (decodedText: string) => {
      processText(decodedText);
    };

    const config = { 
      fps: 15,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const size = Math.min(viewfinderWidth, viewfinderHeight) * 0.75;
        return { width: Math.max(size, 240), height: Math.max(size * 0.55, 140) };
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
        facingMode: { ideal: "environment" },
        // @ts-ignore
        focusMode: "continuous"
      }
    };

    const initScanner = async () => {
      if (startingRef.current || !isMountedRef.current) return;
      startingRef.current = true;
      setIsCameraReady(false);
      isCameraReadyRef.current = false;
      setErrorMsg(null);

      try {
        // Wait for DOM container
        let attempts = 0;
        while (attempts < 15 && (!document.getElementById("qr-reader") || document.getElementById("qr-reader")?.clientWidth === 0)) {
           await new Promise(r => setTimeout(r, 150));
           attempts++;
        }

        if (!isMountedRef.current) {
          startingRef.current = false;
          return;
        }

        // Initialize AFTER DOM is ready
        if (!html5QrCodeRef.current) {
          html5QrCodeRef.current = new Html5Qrcode("qr-reader");
        }
        const html5QrCode = html5QrCodeRef.current;

        // Ensure any previous scan is stopped safely
        if (html5QrCode.isScanning) {
          try {
            await html5QrCode.stop();
            await new Promise(r => setTimeout(r, 300));
          } catch (e) {
            console.warn("Pre-init stop failed", e);
          }
        }

        let started = false;
        const shouldContinue = () => isMountedRef.current && !started;

        // Strategy 1: Camera enumeration
        if (shouldContinue()) {
          try {
            const cameras = await Html5Qrcode.getCameras().catch(() => []);
            if (cameras && cameras.length > 0 && isMountedRef.current) {
              const backCam = cameras.find(c => /back|rear|environment|外置|後置|0/i.test(c.label));
              const camId = backCam ? backCam.id : cameras[cameras.length - 1].id;
              
              await html5QrCode.start(camId, config, qrCodeSuccessCallback, () => {});
              started = true;
            }
          } catch (e) {
            console.warn("getCameras strategy notice:", e);
          }
        }

        // Strategy 2: facingMode environment
        if (shouldContinue()) {
          try {
            await html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback, () => {});
            started = true;
          } catch (e) {
            console.warn("Environment facingMode notice:", e);
          }
        }

        // Strategy 3: user facingMode / generic camera
        if (shouldContinue()) {
          try {
            await html5QrCode.start({ facingMode: "user" }, config, qrCodeSuccessCallback, () => {});
            started = true;
          } catch (e) {
            console.warn("User facingMode notice:", e);
          }
        }

        // Strategy 4: default video true
        if (shouldContinue()) {
          try {
            // @ts-ignore
            await html5QrCode.start(true, config, qrCodeSuccessCallback, () => {});
            started = true;
          } catch (e) {
            console.warn("Generic camera start notice:", e);
          }
        }

        if (!started && isMountedRef.current) {
          setErrorMsg("未能啟動即時相機。可能是權限未授權、無相機設備或處於受限預覽環境。您仍可透過「拍照辨識」或「手動輸入」進行操作。");
          return;
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
          if (capabilities && capabilities.zoom) {
            setSupportsZoom(true);
            setMaxZoom(capabilities.zoom.max || 1);
            setZoom(capabilities.zoom.min || 1);
          }
        } catch (e) {
          console.warn("Could not detect zoom capabilities", e);
        }
      } catch (err: any) {
        console.warn("Scanner initialization notice:", err?.message || err);
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
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, [navigate, returnTo, retryCount]);

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
    const cleanText = text.trim();
    if (!cleanText) return;

    isRoutingRef.current = true;
    setScannedResult(cleanText);
    
    const stopAndNavigate = async () => {
      if (html5QrCodeRef.current?.isScanning) {
        await html5QrCodeRef.current.stop().catch(() => {});
      }
      
      let pid = cleanText;
      const product = productsRef.current.find(p => String(p.barcode) === cleanText || String(p.product_id) === cleanText);
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
    if (!file) return;

    setIsProcessingFile(true);
    
    try {
      // Strategy 1: Try Native BarcodeDetector (Best for photos)
      // @ts-ignore
      if ('BarcodeDetector' in window) {
        try {
          // @ts-ignore
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code']
          });
          const bitmap = await createImageBitmap(file);
          const barcodes = await detector.detect(bitmap);
          
          if (barcodes.length > 0) {
            processText(barcodes[0].rawValue);
            setIsProcessingFile(false);
            return;
          }
        } catch (detectorErr) {
          console.warn("BarcodeDetector failed, falling back", detectorErr);
        }
      }

      // Strategy 2: Optimize Image (Resize) for JS-based scanner
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode("qr-reader");
      }
      const optimizedFile = await optimizeImageForScanning(file);
      const decodedText = await html5QrCodeRef.current.scanFile(optimizedFile, false);
      processText(decodedText);
    } catch (err) {
      console.warn("Native capture scan notice:", err);
      alert("無法從此照片辨識出清晰條碼。建議：\n1. 靠近條碼垂直平放拍攝\n2. 確保光線充足、無嚴重反光\n3. 或使用「手動輸入」直接指定商品");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Helper to resize image before scanning
  const optimizeImageForScanning = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.9);
        } else {
          resolve(file);
        }
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve(file);
    });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setShowManualModal(false);
    processText(manualCode.trim());
  };

  const handleSelectProduct = (p: typeof products[0]) => {
    setShowManualModal(false);
    processText(p.barcode || p.product_id);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-white overflow-hidden relative">
      {/* Hidden file input for native camera capture */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        onChange={handleNativeCapture}
        className="hidden"
        ref={fileInputRef}
      />

      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-slate-950/80 backdrop-blur-md border-b border-white/10 z-30">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 -ml-2 text-white/80 hover:text-white rounded-full active:bg-white/10"
            title="返回"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">條碼掃描</h1>
            <p className="text-[11px] text-white/50">支援 EAN-13, QR Code, Code 128</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isCameraReady && (
            <button 
              onClick={toggleTorch}
              className={`p-2.5 rounded-full transition-colors ${torchOn ? 'bg-yellow-400/20 text-yellow-400' : 'bg-white/10 text-white/80'}`}
              title="開關補光燈"
            >
              {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}

          <button 
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur-md border border-white/10"
            title="手動輸入條碼"
          >
            <Keyboard className="w-4 h-4 text-emerald-400" />
            <span>手動輸入</span>
          </button>
        </div>
      </header>
      
      {/* Viewfinder Canvas Area */}
      <div className="flex-1 relative bg-black flex flex-col items-center justify-center overflow-hidden">
        <div id="qr-reader" className="absolute inset-0 w-full h-full z-0"></div>
        
        {/* Active Viewfinder Framing Overlay */}
        {isCameraReady && !scannedResult && !errorMsg && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
            <div className="w-[78vw] max-w-[340px] h-[45vw] max-h-[200px] border-2 border-emerald-400/80 rounded-2xl relative shadow-[0_0_0_100vmax_rgba(0,0,0,0.65)]">
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl"></div>
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl"></div>
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl"></div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl"></div>
              
              {/* Scanning laser line animation */}
              <div className="absolute left-2 right-2 h-0.5 bg-emerald-400 opacity-80 shadow-[0_0_10px_#34d399] animate-scan-line"></div>
            </div>
            <p className="mt-8 text-white/90 text-xs font-semibold px-4 py-1.5 bg-black/60 rounded-full backdrop-blur-md border border-white/10 tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              將條碼對準綠色框線
            </p>
          </div>
        )}

        {/* Zoom Controls */}
        {isCameraReady && supportsZoom && (
          <div className="absolute bottom-36 left-0 right-0 px-8 z-20">
            <div className="max-w-xs mx-auto flex items-center gap-3 bg-black/60 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10">
              <span className="text-white/60 text-xs font-bold">1x</span>
              <input 
                type="range"
                min="1"
                max={maxZoom}
                step="0.1"
                value={zoom}
                onChange={handleZoomChange}
                className="flex-1 accent-emerald-400 h-1.5 rounded-lg"
              />
              <span className="text-white/60 text-xs font-bold">{Math.round(maxZoom)}x</span>
            </div>
          </div>
        )}
 
        {/* Processing Uploaded Image Spinner */}
        {isProcessingFile && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 z-[60] backdrop-blur-md">
             <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/10 border-t-emerald-400 mb-4"></div>
             <p className="text-white font-bold text-base">正在分析條碼圖片...</p>
             <p className="text-white/50 text-xs mt-1">請稍候</p>
          </div>
        )}

        {/* Camera Starting Spinner */}
        {!isCameraReady && !scannedResult && !errorMsg && !isProcessingFile && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-20 p-6 text-center">
             <div className="animate-spin rounded-full h-12 w-12 border-4 border-white/10 border-t-emerald-400 mb-4"></div>
             <p className="text-white font-semibold text-sm">相機啟動中...</p>
             <p className="text-white/40 text-xs mt-1.5">正在連接視訊鏡頭</p>
             
             <div className="mt-8 flex flex-col gap-2 w-full max-w-xs">
               <button 
                 onClick={() => fileInputRef.current?.click()}
                 className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2"
               >
                 <Camera className="w-4 h-4" />
                 改用拍照 / 圖片辨識
               </button>
               <button 
                 onClick={() => setShowManualModal(true)}
                 className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs flex items-center justify-center gap-2"
               >
                 <Keyboard className="w-4 h-4 text-emerald-400" />
                 直接手動輸入條碼
               </button>
             </div>
          </div>
        )}

        {/* Camera Error / Fallback View */}
        {errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 z-30 p-6 text-center">
             <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mb-4 text-amber-400">
                <AlertCircle className="w-7 h-7" />
             </div>
             <h3 className="text-white text-base font-bold mb-1.5">即時鏡頭未啟動</h3>
             <p className="text-white/60 text-xs max-w-xs leading-relaxed mb-6">
               {errorMsg}
             </p>

             <div className="flex flex-col gap-3 w-full max-w-xs">
                {/* 1. Primary fallback: Native Photo Capture / File Picker */}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  📷 拍照或選擇條碼照片辨識
                </button>

                {/* 2. Manual Input */}
                <button 
                  onClick={() => setShowManualModal(true)}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl text-sm border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  <Keyboard className="w-4 h-4 text-emerald-400" />
                  ⌨️ 手動輸入條碼 / 商品編號
                </button>

                {/* 3. Retry Camera */}
                <button 
                  onClick={() => {
                    setErrorMsg(null);
                    setRetryCount(c => c + 1);
                  }}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-xs flex items-center justify-center gap-1.5 border border-white/5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  重試開啟相機鏡頭
                </button>
             </div>
          </div>
        )}

        {/* Scan Success Toast */}
        {scannedResult && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-emerald-500 text-slate-950 font-bold px-6 py-3 rounded-full shadow-2xl z-30 flex items-center gap-2 animate-in fade-in zoom-in">
             <CheckCircle2 className="w-5 h-5" />
             <span>成功辨識: {scannedResult}</span>
          </div>
        )}
        
        {/* Bottom Actions Toolbar */}
        {isCameraReady && !errorMsg && (
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 z-20 px-6">
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="w-full max-w-xs py-3 bg-slate-900/90 hover:bg-slate-800 text-white font-semibold rounded-xl border border-white/15 backdrop-blur-md active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg text-sm"
             >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>拍照上傳辨識</span>
             </button>
          </div>
        )}
      </div>

      {/* Manual Input Dialog Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <Keyboard className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">輸入條碼或商品編號</h3>
              </div>
              <button 
                onClick={() => setShowManualModal(false)}
                className="p-1.5 text-white/50 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="mt-4">
              <div className="relative">
                <input 
                  type="text"
                  autoFocus
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="請輸入條碼、商品 ID 或名稱關鍵字..."
                  className="w-full bg-slate-950 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-emerald-400 text-sm font-mono"
                />
                <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-3.5" />
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-bold rounded-xl text-sm transition-colors"
                >
                  確認帶入
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm"
                >
                  取消
                </button>
              </div>
            </form>

            {/* Quick Product Suggestions */}
            <div className="mt-4 flex-1 overflow-y-auto min-h-0 border-t border-white/10 pt-3">
              <p className="text-[11px] text-white/50 font-semibold mb-2 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" />
                <span>現有庫存商品快速選擇 ({filteredProducts.length})：</span>
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {filteredProducts.map(p => (
                  <button
                    key={p.product_id}
                    type="button"
                    onClick={() => handleSelectProduct(p)}
                    className="w-full text-left p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex items-center justify-between group"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="text-xs font-bold text-white truncate group-hover:text-emerald-400">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-white/50 font-mono mt-0.5 truncate">
                        ID: {p.product_id} {p.barcode ? `| 條碼: ${p.barcode}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-md font-semibold shrink-0">
                      選擇
                    </span>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <p className="text-center py-4 text-xs text-white/40">查無相符商品，可直接點擊確認帶入自訂編號</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-line {
          0% { top: 4% }
          50% { top: 92% }
          100% { top: 4% }
        }
        .animate-scan-line {
          animation: scan-line 2.2s ease-in-out infinite;
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
