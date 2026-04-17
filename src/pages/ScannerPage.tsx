import { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft } from 'lucide-react';

export default function ScannerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { products } = useStore();
  const returnTo = searchParams.get('returnTo') || '/';
  
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Config
    scannerRef.current = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: {width: 250, height: 250}, supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] },
      /* verbose= */ false
    );
    
    scannerRef.current.render(
      (decodedText) => {
        setScannedResult(decodedText);
        let pid = decodedText;
        
        // Try to match barcode to product_id
        const product = products.find(p => p.barcode === decodedText || p.product_id === decodedText);
        if (product) pid = product.product_id;

        // Cleanup and navigate
        if(scannerRef.current) {
            scannerRef.current.clear().catch(e => console.error(e));
        }
        
        const separator = returnTo.includes('?') ? '&' : '?';
        navigate(`${returnTo}${separator}pid=${encodeURIComponent(pid)}`, { replace: true });
      },
      (error) => {
        // usually ignore
      }
    );

    return () => {
      if(scannerRef.current) {
          scannerRef.current.clear().catch(e => console.error(e));
      }
    };
  }, [navigate, returnTo, products]);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center p-4 glass-panel border-x-0 border-t-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-[var(--color-text-dim)] rounded-full hover:bg-white/10">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="ml-2 text-xl font-bold text-[var(--color-text-main)]">掃描條碼</h1>
      </header>
      <div className="flex-1 flex flex-col p-4 justify-center">
         <div id="qr-reader" className="w-full glass-panel rounded-2xl overflow-hidden p-2"></div>
         {scannedResult && (
           <p className="text-center mt-4 text-[var(--color-accent-green)] font-bold">{scannedResult}</p>
         )}
         <p className="text-center mt-8 text-[var(--color-text-dim)] text-sm">請將條碼對準框內進行掃描。</p>
      </div>
    </div>
  );
}
