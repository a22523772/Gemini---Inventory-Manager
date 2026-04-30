import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Save, Check, RefreshCw, FileCode2 } from 'lucide-react';

export default function SetupGuide() {
  const { gasApiUrl, setGasApiUrl, syncData, syncQueue, operator, setOperator, isLoading } = useStore();
  const [url, setUrl] = useState(gasApiUrl);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'settings' | 'docs'>('settings');

  useEffect(() => {
    setUrl(gasApiUrl);
  }, [gasApiUrl]);

  const handleSave = async () => {
    await setGasApiUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full flex flex-col pb-12">
      <div className="glass-panel border-x-0 border-t-0 px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)] mb-4">設定與同步</h1>
        <div className="flex space-x-4 border-b border-white/10">
          <button 
            className={`pb-2 text-sm font-bold transition-colors ${tab === 'settings' ? 'text-[var(--color-accent-blue)] border-b-2 border-[var(--color-accent-blue)]' : 'text-[var(--color-text-dim)] hover:text-white'}`}
            onClick={() => setTab('settings')}
          >
            系統設定
          </button>
          <button 
            className={`pb-2 text-sm font-bold transition-colors ${tab === 'docs' ? 'text-[var(--color-accent-blue)] border-b-2 border-[var(--color-accent-blue)]' : 'text-[var(--color-text-dim)] hover:text-white'}`}
            onClick={() => setTab('docs')}
          >
            後端代碼與文件
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {tab === 'settings' && (
          <>
            <div className="glass-panel p-4 rounded-2xl">
              <h2 className="text-base font-bold text-[var(--color-text-main)] mb-4">操作角色</h2>
              <div className="flex gap-2">
                 {(['staff', 'admin'] as const).map(role => (
                   <button
                     key={role}
                     onClick={() => setOperator(role)}
                     className={`px-4 py-2 rounded-xl text-sm font-bold capitalize flex-1 transition-colors ${operator === role ? 'bg-[var(--color-accent-blue)] text-[#0f172a] shadow-[0_0_15px_rgba(56,189,248,0.4)]' : 'glass-panel text-[var(--color-text-dim)] hover:text-white'}`}
                   >
                     {role}
                   </button>
                 ))}
              </div>
              <p className="text-xs text-[var(--color-text-dim)] mt-3">管理員可調整庫存，一般員工僅能進出貨。</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl">
              <h2 className="text-base font-bold text-[var(--color-text-main)] mb-4">功能開關與警示控制</h2>
              
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-main)]">補貨警示功能</h3>
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">開啟後，庫存低於設定值時會顯示警示標章 (預設 5 個)。</p>
                </div>
                <button
                  onClick={() => useStore.getState().setLowStockAlertEnabled(!useStore.getState().lowStockAlertEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${useStore.getState().lowStockAlertEnabled ? 'bg-[var(--color-accent-blue)]' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useStore.getState().lowStockAlertEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-[var(--color-text-main)]">即將到期提醒天數</h3>
                  <span className="text-[var(--color-accent-blue)] font-bold text-lg">{useStore.getState().expiryThreshold} 天</span>
                </div>
                <p className="text-xs text-[var(--color-text-dim)] mb-3">設定商品在到期前幾天標記為「即將到期」。</p>
                <input 
                  type="range"
                  min="3"
                  max="180"
                  step="1"
                  value={useStore.getState().expiryThreshold}
                  onChange={(e) => useStore.getState().setExpiryThreshold(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[var(--color-accent-blue)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--color-text-dim)] mt-1 uppercase font-bold tracking-widest">
                  <span>3 天</span>
                  <span>90 天</span>
                  <span>180 天</span>
                </div>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl">
              <h2 className="text-base font-bold text-[var(--color-text-main)] mb-4">Google Apps Script 網址</h2>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none"
              />
              <button
                onClick={handleSave}
                className="mt-4 w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold text-[#0f172a] bg-[var(--color-accent-blue)] hover:opacity-90 active:scale-95 transition-all"
              >
                {saved ? <Check className="w-5 h-5 mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                {saved ? '已儲存！' : '儲存網址'}
              </button>
            </div>

            <div className="glass-panel p-4 rounded-2xl">
              <div className="flex justify-between items-center mb-4">
                 <h2 className="text-base font-bold text-[var(--color-text-main)]">同步狀態</h2>
                 <span className="bg-[var(--color-accent-orange)]/20 text-orange-200 border border-[var(--color-accent-orange)]/50 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    {syncQueue.length} 待同步
                 </span>
              </div>
              <button
                onClick={syncData}
                disabled={isLoading || !gasApiUrl}
                className={`w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold active:scale-95 transition-all outline-none ${
                  isLoading || !gasApiUrl ? 'bg-white/5 text-[var(--color-text-dim)] cursor-not-allowed' : 'glass-panel text-white hover:bg-white/10'
                }`}
              >
                <RefreshCw className={`w-5 h-5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? '同步中...' : '立即同步'}
              </button>
            </div>

            <div className="glass-panel p-4 rounded-2xl border-orange-500/20 bg-orange-500/5">
              <h2 className="text-base font-bold text-orange-200 mb-2">資料庫維護工具</h2>
              <p className="text-xs text-orange-200/60 mb-4">若您手動在 Google Sheets 新增了多行資料，請執行此功能以自動生成缺失的 ID 並確保格式正確。</p>
              <button
                onClick={() => useStore.getState().reformatDatabase()}
                disabled={isLoading || !gasApiUrl}
                className={`w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold active:scale-95 transition-all outline-none border border-orange-500/30 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50`}
              >
                整理資料庫格式與補齊 ID
              </button>
            </div>
          </>
        )}

        {tab === 'docs' && (
           <div className="glass-panel p-4 rounded-2xl text-sm space-y-4">
             <div className="p-4 bg-[var(--color-accent-blue)]/10 border border-[var(--color-accent-blue)]/30 rounded-xl text-blue-100">
               <FileCode2 className="w-6 h-6 mb-2 text-[var(--color-accent-blue)]" />
               <h3 className="font-bold text-[var(--color-accent-blue)]">關於 PWA (漸進式網頁應用) 的重要提醒</h3>
               <p className="mt-1 text-white/90">
                 此系統提供離線操作、條碼掃描以及快速的本地搜尋功能。為了讓您能在各平台順暢使用，我們已將其建置為 <strong>PWA (漸進式網頁應用程式)</strong>。
               </p>
               <ul className="list-disc pl-5 mt-2 space-y-1 text-white/90">
                 <li><strong>iOS 使用方式：</strong> 請在 Safari 開啟此網址，點擊「分享」圖示，然後選擇 <strong>「加入主畫面」</strong>。它的運作會與一般的原生 App 一模一樣且支援離線。</li>
                 <li><strong>Android/電腦版：</strong> 請使用 Chrome 開啟，根據提示選擇「安裝應用程式」。</li>
               </ul>
             </div>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)]">1. Google Sheets 結構設定</h3>
                <p className="text-[var(--color-text-dim)] mt-1">請建立一個新的 Google Sheet，並確保下方有這四個工作表 (區分大小寫)：</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-white/80 font-mono text-xs">
                  <li><strong>products</strong> (商品表): product_id, barcode, name, category, brand, unit, cost_price, vendor_id, has_expiry, specification, min_stock, created_at</li>
                  <li><strong>vendors</strong> (供應商): vendor_id, vendor_name, contact, phone</li>
                  <li><strong>stock</strong> (庫存表): stock_id, product_id, name, location, floor, area, quantity, expiry_date, specification, last_update</li>
                  <li><strong>transactions</strong> (交易紀錄): transaction_id, product_id, type, quantity, location, floor, area, specification, cost_price, vendor_id, date, note, operator</li>
                </ul>
             </section>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)] mt-6">2. Google Apps Script 伺服器代碼</h3>
                <p className="text-[var(--color-text-dim)] mt-1">在您的 Google Sheet 中，點選選單的 「擴充功能 &gt; Apps Script」。將以下代碼完全貼上，並部署為「網頁應用程式 (任何人皆可存取)」：</p>
                <pre className="bg-black/40 border border-white/10 text-[var(--color-text-dim)] p-4 rounded-xl mt-3 overflow-x-auto text-xs font-mono">
{`function doPost(e) {
  var action = e.parameter.action;
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'addProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (!prodSheet) prodSheet = ss.insertSheet('products');
    
    var headers = [];
    if (prodSheet.getLastRow() === 0) {
      headers = ['product_id', 'barcode', 'name', 'category', 'unit', 'cost_price', 'vendor_id', 'has_expiry', 'created_at', 'brand', 'specification', 'min_stock'];
      prodSheet.appendRow(headers);
    } else {
      headers = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('brand') === -1) { headers.push('brand'); prodSheet.getRange(1, headers.length).setValue('brand'); }
      if (headers.indexOf('specification') === -1) { headers.push('specification'); prodSheet.getRange(1, headers.length).setValue('specification'); }
      if (headers.indexOf('min_stock') === -1) { headers.push('min_stock'); prodSheet.getRange(1, headers.length).setValue('min_stock'); }
    }
    
    // Automatic ID generation (Pattern B: P000001)
    if (!data.product_id || data.product_id === '') {
      var lastIdNum = 0;
      if (prodSheet.getLastRow() > 1) {
        var idValues = prodSheet.getRange(2, headers.indexOf('product_id') + 1, prodSheet.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < idValues.length; i++) {
          var currentId = String(idValues[i][0]);
          if (currentId.indexOf('P') === 0) {
            var num = parseInt(currentId.substring(1));
            if (!isNaN(num) && num > lastIdNum) lastIdNum = num;
          }
        }
      }
      var nextId = 'P' + String(lastIdNum + 1).padStart(6, '0');
      data.product_id = nextId;
    }

    var rowData = [];
    for (var j = 0; j < headers.length; j++) {
      var val = data[headers[j]];
      rowData.push(val !== undefined ? val : '');
    }
    prodSheet.appendRow(rowData);
    return ContentService.createTextOutput(JSON.stringify({success:true, product_id: data.product_id})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'reformatDatabase') {
    // 1. Refresh Products table
    var prodSheet = ss.getSheetByName('products');
    if (prodSheet && prodSheet.getLastRow() > 0) {
       var headers = ['product_id', 'barcode', 'name', 'category', 'unit', 'cost_price', 'vendor_id', 'has_expiry', 'created_at', 'brand', 'specification', 'min_stock'];
       var existingHeaders = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
       var values = prodSheet.getDataRange().getValues();
       var idIdx = existingHeaders.indexOf('product_id');
       var lastIdNum = 0;
       
       // Pass 1: Find max ID
       for(var i=1; i<values.length; i++) {
         var cid = String(values[i][idIdx] || '');
         if(cid.indexOf('P') === 0) {
           var n = parseInt(cid.substring(1));
           if(!isNaN(n) && n > lastIdNum) lastIdNum = n;
         }
       }
       
       // Pass 2: Assign IDs to empty rows
       for(var i=1; i<values.length; i++) {
         if(!values[i][idIdx] || values[i][idIdx] === '') {
           lastIdNum++;
           var nid = 'P' + String(lastIdNum).padStart(6, '0');
           prodSheet.getRange(i+1, idIdx + 1).setValue(nid);
         }
       }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true, message: 'Database reformatted and IDs assigned'})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'editProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (prodSheet && prodSheet.getLastRow() > 1) {
      var headers = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('brand') === -1) { headers.push('brand'); prodSheet.getRange(1, headers.length).setValue('brand'); }
      if (headers.indexOf('specification') === -1) { headers.push('specification'); prodSheet.getRange(1, headers.length).setValue('specification'); }
      if (headers.indexOf('min_stock') === -1) { headers.push('min_stock'); prodSheet.getRange(1, headers.length).setValue('min_stock'); }

      var values = prodSheet.getDataRange().getValues();
      var idIndex = headers.indexOf('product_id');

      for (var i = 1; i < values.length; i++) {
        if (values[i][idIndex] == data.product_id) {
          var rowData = [];
          for (var j = 0; j < headers.length; j++) {
            var val = data[headers[j]];
            rowData.push(val !== undefined ? val : values[i][j]);
          }
          prodSheet.getRange(i+1, 1, 1, headers.length).setValues([rowData]);
          break;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'deleteProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (prodSheet && prodSheet.getLastRow() > 1) {
      var values = prodSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][0] == data.product_id) {
          prodSheet.deleteRow(i+1);
          break;
        }
      }
    }
    
    // Also delete stock entries for this product
    var stockSheet = ss.getSheetByName('stock');
    if(stockSheet && stockSheet.getLastRow() > 1) {
      var sValues = stockSheet.getDataRange().getValues();
      for(var j = sValues.length - 1; j >= 1; j--) {
        if(sValues[j][1] == data.product_id) {
          stockSheet.deleteRow(j+1);
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'addVendor') {
    var vendorSheet = ss.getSheetByName('vendors');
    if (!vendorSheet) vendorSheet = ss.insertSheet('vendors');
    if (vendorSheet.getLastRow() === 0) {
      vendorSheet.appendRow(['vendor_id', 'vendor_name', 'contact', 'phone']);
    }
    vendorSheet.appendRow([data.vendor_id, data.vendor_name, data.contact || '', data.phone || '']);
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'editVendor') {
    var vendorSheet = ss.getSheetByName('vendors');
    if (vendorSheet && vendorSheet.getLastRow() > 1) {
      var values = vendorSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][0] == data.vendor_id) {
          vendorSheet.getRange(i+1, 2, 1, 3).setValues([[data.vendor_name, data.contact || '', data.phone || '']]);
          break;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'deleteVendor') {
    var vendorSheet = ss.getSheetByName('vendors');
    if (vendorSheet && vendorSheet.getLastRow() > 1) {
      var values = vendorSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][0] == data.vendor_id) {
          vendorSheet.deleteRow(i+1);
          break;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'stockIn') {
    var stockSheet = ss.getSheetByName('stock');
    if (!stockSheet) stockSheet = ss.insertSheet('stock');
    var transSheet = ss.getSheetByName('transactions');
    if (!transSheet) transSheet = ss.insertSheet('transactions');
    
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
    var stockId = data.stock_id || [data.product_id, data.location, data.floor, data.area, data.expiry_date || '', data.specification || ''].join('_').replace(/_+$/, '');
    
    // Manage stock headers dynamically
    var stockHeaders = [];
    if (stockSheet.getLastRow() === 0) {
      stockHeaders = ['stock_id', 'product_id', 'name', 'location', 'floor', 'area', 'quantity', 'expiry_date', 'specification', 'last_update'];
      stockSheet.appendRow(stockHeaders);
    } else {
      stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
      // Ensure specific optional/new columns exist
      var requiredStockCols = ['name', 'specification', 'last_update'];
      requiredStockCols.forEach(function(col) {
        if (stockHeaders.indexOf(col) === -1) {
          stockHeaders.push(col);
          stockSheet.getRange(1, stockHeaders.length).setValue(col);
        }
      });
    }
    
    var values = stockSheet.getDataRange().getValues();
    var stockIdIdx = stockHeaders.indexOf('stock_id');
    var prodIdx = stockHeaders.indexOf('product_id');
    var locIdx = stockHeaders.indexOf('location');
    var floorIdx = stockHeaders.indexOf('floor');
    var areaIdx = stockHeaders.indexOf('area');
    var expiryIdx = stockHeaders.indexOf('expiry_date');
    var specIdx = stockHeaders.indexOf('specification');
    var qtyIdx = stockHeaders.indexOf('quantity');
    var updateIdx = stockHeaders.indexOf('last_update');
    
    var foundIndex = -1;
    if (values.length > 1) {
      for (var i = 1; i < values.length; i++) {
         // Match by ID OR by attributes
         var matchById = (stockIdIdx !== -1 && values[i][stockIdIdx] == stockId);
         var matchByAttrs = (
           values[i][prodIdx] == data.product_id &&
           values[i][locIdx] == data.location &&
           values[i][floorIdx] == data.floor &&
           values[i][areaIdx] == data.area &&
           String(values[i][expiryIdx] || '') == String(data.expiry_date || '') &&
           String(values[i][specIdx] || '') == String(data.specification || '')
         );
         
         if (matchById || matchByAttrs) {
            foundIndex = i;
            break;
         }
      }
    }

    if (foundIndex !== -1) {
       var oldQty = Number(values[foundIndex][qtyIdx]) || 0;
       stockSheet.getRange(foundIndex + 1, qtyIdx + 1).setValue(oldQty + Number(data.quantity));
       if (updateIdx !== -1) stockSheet.getRange(foundIndex + 1, updateIdx + 1).setValue(now);
       // Update name if missing
       var nameIdx = stockHeaders.indexOf('name');
       if (nameIdx !== -1 && data.name && !values[foundIndex][nameIdx]) {
         stockSheet.getRange(foundIndex + 1, nameIdx + 1).setValue(data.name);
       }
    } else {
       var sRow = [];
       for(var m=0; m<stockHeaders.length; m++) {
         var key = stockHeaders[m];
         var val = data[key];
         if (key === 'stock_id') val = stockId;
         if (key === 'last_update') val = now;
         sRow.push(val !== undefined ? val : '');
       }
       stockSheet.appendRow(sRow);
    }
    
    // Transactions logic
    var transHeaders = [];
    if(transSheet.getLastRow() === 0) {
      transHeaders = ['transaction_id', 'product_id', 'type', 'quantity', 'location', 'floor', 'area', 'specification', 'cost_price', 'vendor_id', 'date', 'note', 'operator'];
      transSheet.appendRow(transHeaders);
    } else {
      transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
      var requiredTransCols = ['specification', 'cost_price', 'vendor_id'];
      requiredTransCols.forEach(function(col) {
        if (transHeaders.indexOf(col) === -1) {
          transHeaders.push(col);
          transSheet.getRange(1, transHeaders.length).setValue(col);
        }
      });
    }
    
    data.transaction_id = Utilities.getUuid();
    data.type = 'stock_in';
    data.date = now;
    data.note = data.note || '';
    
    var trRow = [];
    for (var k = 0; k < transHeaders.length; k++) {
      var kName = transHeaders[k];
      trRow.push(data[kName] !== undefined ? data[kName] : '');
    }
    transSheet.appendRow(trRow);
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if(action === 'stockOut') {
    var stockSheet = ss.getSheetByName('stock');
    var transSheet = ss.getSheetByName('transactions');
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
    var stockId = data.stock_id || [data.product_id, data.location, data.floor, data.area, data.expiry_date || '', data.specification || ''].join('_').replace(/_+$/, '');

    if(stockSheet && stockSheet.getLastRow() > 1) {
      var stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
      var values = stockSheet.getDataRange().getValues();
      var idIdx = stockHeaders.indexOf('stock_id');
      var qtyIdx = stockHeaders.indexOf('quantity');
      var updateIdx = stockHeaders.indexOf('last_update');

      for (var i = 1; i < values.length; i++) {
         var matchById = (idIdx !== -1 && values[i][idIdx] == stockId);
         var matchByAttrs = (
           values[i][stockHeaders.indexOf('product_id')] == data.product_id &&
           values[i][stockHeaders.indexOf('location')] == data.location &&
           values[i][stockHeaders.indexOf('floor')] == data.floor &&
           values[i][stockHeaders.indexOf('area')] == data.area &&
           String(values[i][stockHeaders.indexOf('expiry_date')] || '') == String(data.expiry_date || '') &&
           String(values[i][stockHeaders.indexOf('specification')] || '') == String(data.specification || '')
         );

         if (matchById || matchByAttrs) {
            var newQ = (Number(values[i][qtyIdx]) || 0) - Number(data.quantity);
            if (newQ <= 0) {
               stockSheet.deleteRow(i + 1);
            } else {
               stockSheet.getRange(i+1, qtyIdx + 1).setValue(newQ);
               if (updateIdx !== -1) stockSheet.getRange(i+1, updateIdx + 1).setValue(now);
            }
            break;
         }
      }
    }
    
    var transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
    data.transaction_id = Utilities.getUuid();
    data.type = 'stock_out';
    data.date = now;
    data.note = data.note || '';
    data.cost_price = '';
    data.vendor_id = '';
    
    var trRow = [];
    for (var k = 0; k < transHeaders.length; k++) {
      var kName = transHeaders[k];
      trRow.push(data[kName] !== undefined ? data[kName] : '');
    }
    transSheet.appendRow(trRow);
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if(action === 'adjustStock') {
    var stockSheet = ss.getSheetByName('stock');
    var transSheet = ss.getSheetByName('transactions');
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
    var stockId = data.stock_id || [data.product_id, data.location, data.floor, data.area, data.expiry_date || '', data.specification || ''].join('_').replace(/_+$/, '');
    
    if(stockSheet && stockSheet.getLastRow() > 1) {
      var stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
      var values = stockSheet.getDataRange().getValues();
      var idIdx = stockHeaders.indexOf('stock_id');
      var qtyIdx = stockHeaders.indexOf('quantity');
      var updateIdx = stockHeaders.indexOf('last_update');

      for (var i = 1; i < values.length; i++) {
         var matchById = (idIdx !== -1 && values[i][idIdx] == stockId);
         var matchByAttrs = (
           values[i][stockHeaders.indexOf('product_id')] == data.product_id &&
           values[i][stockHeaders.indexOf('location')] == data.location &&
           values[i][stockHeaders.indexOf('floor')] == data.floor &&
           values[i][stockHeaders.indexOf('area')] == data.area &&
           String(values[i][stockHeaders.indexOf('expiry_date')] || '') == String(data.expiry_date || '') &&
           String(values[i][stockHeaders.indexOf('specification')] || '') == String(data.specification || '')
         );

         if (matchById || matchByAttrs) {
            if (Number(data.quantity) <= 0) {
               stockSheet.deleteRow(i + 1);
            } else {
               stockSheet.getRange(i+1, qtyIdx + 1).setValue(Number(data.quantity));
               if (updateIdx !== -1) stockSheet.getRange(i+1, updateIdx + 1).setValue(now);
            }
            break;
         }
      }
    }
    
    var transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
    data.transaction_id = Utilities.getUuid();
    data.type = 'adjust';
    data.date = now;
    data.cost_price = '';
    data.vendor_id = '';
    
    var trRow = [];
    for (var k = 0; k < transHeaders.length; k++) {
      var kName = transHeaders[k];
      trRow.push(data[kName] !== undefined ? data[kName] : '');
    }
    transSheet.appendRow(trRow);

    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'getProducts') {
    var sheet = ss.getSheetByName('products');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Fix: use getDisplayValues to avoid .000Z dates
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    var pidIdx = keys.indexOf('product_id');
    for(var i=1; i<data.length; i++){
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (pidIdx !== -1 && !data[i][pidIdx]) continue; // Skip if no product_id
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'has_expiry') val = (String(val).toUpperCase() === 'TRUE');
        if (keys[j] === 'cost_price' || keys[j] === 'min_stock') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getVendors') {
    var sheet = ss.getSheetByName('vendors');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Option: display values
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    var vidIdx = keys.indexOf('vendor_id');
    for(var i=1; i<data.length; i++){
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (vidIdx !== -1 && !data[i][vidIdx]) continue; // Skip if no vendor_id
      var obj = {};
      for(var j=0; j<keys.length; j++){ obj[keys[j]] = data[i][j]; }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getStock') {
    var sheet = ss.getSheetByName('stock');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Fix: use getDisplayValues
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    var sidIdx = keys.indexOf('stock_id');
    for(var i=1; i<data.length; i++){
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (sidIdx !== -1 && !data[i][sidIdx]) continue; // Skip if no stock_id
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'quantity') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getTransactions') {
    var sheet = ss.getSheetByName('transactions');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Fix: use getDisplayValues
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    var tidIdx = keys.indexOf('transaction_id');
    for(var i=data.length-1; i>=1; i--){ // reverse order for latest first, limited
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (tidIdx !== -1 && !data[i][tidIdx]) continue; // Skip if no transaction_id
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'quantity') val = Number(val) || 0;
        if (keys[j] === 'cost_price') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      result.push(obj);
      if(result.length > 500) break; // Limit records to 500
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
}`}
                </pre>
             </section>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)] mt-8">3. 原生 Flutter App (選填)</h3>
                <p className="text-[var(--color-text-dim)] mt-1">如果您仍希望編譯成原生的手機 App 而非使用上述的 PWA，您可以使用 Flutter，並搭配 <code>mobile_scanner</code> 及 <code>sqflite</code> 開發，以下為核心邏輯參考：</p>
                <pre className="bg-black/40 border border-white/10 text-[var(--color-text-dim)] p-4 rounded-xl mt-3 overflow-x-auto text-xs font-mono">
{`// Example Flutter Main Logic (Reference)
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

// ... Setup sqflite DB and Provider/Bloc for offline sync ...
// See the Web version implementation for API data structure.

class ScannerScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Custom Barcode')),
      body: MobileScanner(
        onDetect: (capture) {
          final List<Barcode> barcodes = capture.barcodes;
          for (final barcode in barcodes) {
            final String? code = barcode.rawValue;
            if (code != null) {
              Navigator.pop(context, code);
              break;
            }
          }
        },
      ),
    );
  }
}`}
                </pre>
             </section>
           </div>
        )}
      </div>
    </div>
  );
}
