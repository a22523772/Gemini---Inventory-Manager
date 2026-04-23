import { useEffect, useState, useRef } from 'react';
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
  const [isCameraReady, setIsCameraReady] = useState(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isRoutingRef = useRef(false);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCodeRef.current = html5QrCode;

    const qrCodeSuccessCallback = (decodedText: string) => {
      if (isRoutingRef.current) return;
      isRoutingRef.current = true;
      setScannedResult(decodedText);
      let pid = decodedText;
      
      const product = products.find(p => String(p.barcode) === decodedText || String(p.product_id) === decodedText);
      if (product) pid = product.product_id;

      let targetPath = returnTo;
      if (!targetPath || targetPath === '/') {
        targetPath = product ? '/products' : '/add-product';
      }
      
      const separator = targetPath.includes('?') ? '&' : '?';
      const finalUrl = `${targetPath}${separator}pid=${encodeURIComponent(pid)}`;

      html5QrCode.stop().then(() => {
        navigate(finalUrl, { replace: true });
      }).catch(() => {
        navigate(finalUrl, { replace: true });
      });
    };

    const config = { 
      fps: 20, // Increased FPS for faster detection
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.7);
        return { width: qrboxSize, height: qrboxSize * 0.6 }; // Wider box for barcodes
      },
      aspectRatio: 1.0,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
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
      ]
    };

    // Try using environment facing logic rather than explicitly selecting by ID which can cause Not Found error.
    html5QrCode.start(
      { facingMode: "environment" }, 
      config, 
      qrCodeSuccessCallback,
      undefined
    ).then(() => {
      setIsCameraReady(true);
    }).catch(err => {
      console.error("Unable to start environment camera, falling back to user", err);
      // Fallback: try user (front) camera if environment failed
      html5QrCode.start(
        { facingMode: "user" }, 
        config, 
        qrCodeSuccessCallback,
        undefined
      ).then(() => {
        setIsCameraReady(true);
      }).catch(fallbackErr => {
         console.error("Fallback start failed", fallbackErr);
         const msg = (fallbackErr instanceof Error) ? fallbackErr.message : String(fallbackErr);
         alert("無法啟動相機：" + msg + "。請確認已授予相機權限。");
      });
    });

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(e => console.error(e));
      }
    };
  }, [navigate, returnTo, products]);

  const toggleTorch = async () => {
    if (html5QrCodeRef.current && isCameraReady) {
      try {
        const newTorchState = !torchOn;
        await html5QrCodeRef.current.applyVideoConstraints({
          // @ts-ignore - html5-qrcode types might not include torch yet
          advanced: [{ torch: newTorchState }]
        });
        setTorchOn(newTorchState);
      } catch (err) {
        console.error("Error toggling torch", err);
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-black">
      <header className="flex items-center p-4 glass-panel border-x-0 border-t-0 z-10 bg-black/60 backdrop-blur-md">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-white rounded-full hover:bg-white/10">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="ml-2 text-xl font-bold text-white">掃描條碼</h1>
        {isCameraReady && (
          <button 
            onClick={toggleTorch}
            className="ml-auto p-2 text-white rounded-full hover:bg-white/10"
          >
            {torchOn ? <Zap className="w-6 h-6 text-yellow-400" /> : <ZapOff className="w-6 h-6" />}
          </button>
        )}
      </header>
      
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        <div id="qr-reader" className="w-full h-full"></div>
        
        {/* Overlay scanning guide */}
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            <div className="w-[70vw] h-[42vw] border-2 border-[var(--color-accent-blue)] rounded-xl relative shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-[var(--color-accent-blue)] rounded-tl-lg"></div>
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-[var(--color-accent-blue)] rounded-tr-lg"></div>
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-[var(--color-accent-blue)] rounded-bl-lg"></div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-[var(--color-accent-blue)] rounded-br-lg"></div>
                
                {/* Scanning line animation */}
                <div className="absolute left-0 right-0 h-0.5 bg-[var(--color-accent-blue)] opacity-50 shadow-[0_0_8px_var(--color-accent-blue)] animate-scan-line"></div>
            </div>
            <p className="mt-8 text-white/80 text-sm font-medium px-4 py-2 bg-black/40 rounded-full backdrop-blur-sm">
                請將條碼對準藍色框內
            </p>
        </div>

        {scannedResult && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-[var(--color-accent-green)] text-black font-bold px-6 py-3 rounded-full shadow-xl">
             結果: {scannedResult}
          </div>
        )}
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
        }
      `}</style>
    </div>
  );
}
