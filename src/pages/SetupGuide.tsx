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
                  <li><strong>products</strong> (商品表): product_id, barcode, name, category, brand, unit, cost_price, vendor_id, has_expiry, expiry_date, created_at</li>
                  <li><strong>vendors</strong> (供應商): vendor_id, vendor_name, contact, phone</li>
                  <li><strong>stock</strong> (庫存表): stock_id, product_id, location, floor, area, quantity, expiry_date, last_update</li>
                  <li><strong>transactions</strong> (交易紀錄): transaction_id, product_id, type, quantity, location, floor, area, cost_price, vendor_id, date, note, operator</li>
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
      headers = ['product_id', 'barcode', 'name', 'category', 'unit', 'cost_price', 'vendor_id', 'has_expiry', 'created_at', 'brand', 'expiry_date'];
      prodSheet.appendRow(headers);
    } else {
      headers = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('brand') === -1) { headers.push('brand'); prodSheet.getRange(1, headers.length).setValue('brand'); }
      if (headers.indexOf('expiry_date') === -1) { headers.push('expiry_date'); prodSheet.getRange(1, headers.length).setValue('expiry_date'); }
    }
    
    var rowData = [];
    for (var j = 0; j < headers.length; j++) {
      var val = data[headers[j]];
      rowData.push(val !== undefined ? val : '');
    }
    prodSheet.appendRow(rowData);
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'editProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (prodSheet && prodSheet.getLastRow() > 1) {
      var headers = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('brand') === -1) { headers.push('brand'); prodSheet.getRange(1, headers.length).setValue('brand'); }
      if (headers.indexOf('expiry_date') === -1) { headers.push('expiry_date'); prodSheet.getRange(1, headers.length).setValue('expiry_date'); }

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

    var stockId = data.product_id + '_' + data.location + '_' + data.floor + '_' + data.area;
    
    // Find or create in stock
    var lastRow = stockSheet.getLastRow();
    var found = false;
    
    if (lastRow > 0) {
      var values = stockSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
         if (values[i][0] == stockId) {
            stockSheet.getRange(i+1, 6).setValue(Number(values[i][5]) + Number(data.quantity));
            stockSheet.getRange(i+1, 8).setValue(now);
            found = true;
            break;
         }
      }
    } else {
      // Initialize headers if empty
      stockSheet.appendRow(['stock_id', 'product_id', 'location', 'floor', 'area', 'quantity', 'expiry_date', 'last_update']);
    }
    
    if (!found) {
       stockSheet.appendRow([stockId, data.product_id, data.location, data.floor, data.area, data.quantity, data.expiry_date || '', now]);
    }
    
    var transHeaders = ['transaction_id', 'product_id', 'type', 'quantity', 'location', 'floor', 'area', 'cost_price', 'vendor_id', 'date', 'note', 'operator'];
    if(transSheet.getLastRow() === 0) {
      transSheet.appendRow(transHeaders);
    } else {
      transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
      if (transHeaders.indexOf('cost_price') === -1) { transHeaders.push('cost_price'); transSheet.getRange(1, transHeaders.length).setValue('cost_price'); }
      if (transHeaders.indexOf('vendor_id') === -1) { transHeaders.push('vendor_id'); transSheet.getRange(1, transHeaders.length).setValue('vendor_id'); }
    }
    
    var trData = {
      transaction_id: Utilities.getUuid(), product_id: data.product_id, type: 'stock_in',
      quantity: data.quantity, location: data.location, floor: data.floor, area: data.area,
      cost_price: data.cost_price, vendor_id: data.vendor_id, date: now, note: '', operator: data.operator
    };
    
    var trRow = [];
    for (var k = 0; k < transHeaders.length; k++) {
      trRow.push(trData[transHeaders[k]] !== undefined ? trData[transHeaders[k]] : '');
    }
    transSheet.appendRow(trRow);
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if(action === 'stockOut') {
    var stockSheet = ss.getSheetByName('stock');
    var transSheet = ss.getSheetByName('transactions');
    var stockId = data.product_id + '_' + data.location + '_' + data.floor + '_' + data.area;
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");

    if(stockSheet && stockSheet.getLastRow() > 0) {
      var values = stockSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
         if (values[i][0] == stockId) {
            var newQ = Number(values[i][5]) - Number(data.quantity);
            stockSheet.getRange(i+1, 6).setValue(newQ < 0 ? 0 : newQ);
            stockSheet.getRange(i+1, 8).setValue(now);
            break;
         }
      }
    }
    
    var transHeaders = ['transaction_id', 'product_id', 'type', 'quantity', 'location', 'floor', 'area', 'cost_price', 'vendor_id', 'date', 'note', 'operator'];
    if(transSheet.getLastRow() === 0) {
      transSheet.appendRow(transHeaders);
    } else {
      transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
      if (transHeaders.indexOf('cost_price') === -1) { transHeaders.push('cost_price'); transSheet.getRange(1, transHeaders.length).setValue('cost_price'); }
      if (transHeaders.indexOf('vendor_id') === -1) { transHeaders.push('vendor_id'); transSheet.getRange(1, transHeaders.length).setValue('vendor_id'); }
    }
    
    var trData = {
      transaction_id: Utilities.getUuid(), product_id: data.product_id, type: 'stock_out',
      quantity: data.quantity, location: data.location, floor: data.floor, area: data.area,
      cost_price: '', vendor_id: '', date: now, note: '', operator: data.operator
    };
    
    var trRow = [];
    for (var k = 0; k < transHeaders.length; k++) {
      trRow.push(trData[transHeaders[k]] !== undefined ? trData[transHeaders[k]] : '');
    }
    transSheet.appendRow(trRow);
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if(action === 'adjustStock') {
      var stockSheet = ss.getSheetByName('stock');
      var transSheet = ss.getSheetByName('transactions');
      var stockId = data.product_id + '_' + data.location + '_' + data.floor + '_' + data.area;
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
      
      if(stockSheet && stockSheet.getLastRow() > 0) {
        var values = stockSheet.getDataRange().getValues();
        for (var i = 1; i < values.length; i++) {
           if (values[i][0] == stockId) {
              stockSheet.getRange(i+1, 6).setValue(Number(data.quantity));
              stockSheet.getRange(i+1, 8).setValue(now);
              break;
           }
        }
      }
      
      var transHeaders = ['transaction_id', 'product_id', 'type', 'quantity', 'location', 'floor', 'area', 'cost_price', 'vendor_id', 'date', 'note', 'operator'];
      if(transSheet.getLastRow() === 0) {
        transSheet.appendRow(transHeaders);
      } else {
        transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
        if (transHeaders.indexOf('cost_price') === -1) { transHeaders.push('cost_price'); transSheet.getRange(1, transHeaders.length).setValue('cost_price'); }
        if (transHeaders.indexOf('vendor_id') === -1) { transHeaders.push('vendor_id'); transSheet.getRange(1, transHeaders.length).setValue('vendor_id'); }
      }
      
      var trData = {
        transaction_id: Utilities.getUuid(), product_id: data.product_id, type: 'adjust',
        quantity: data.quantity, location: data.location, floor: data.floor, area: data.area,
        cost_price: '', vendor_id: '', date: now, note: data.note, operator: data.operator
      };
      
      var trRow = [];
      for (var k = 0; k < transHeaders.length; k++) {
        trRow.push(trData[transHeaders[k]] !== undefined ? trData[transHeaders[k]] : '');
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
    for(var i=1; i<data.length; i++){
      var obj = {};
      for(var j=0; j<keys.length; j++){ obj[keys[j]] = data[i][j]; }
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
    for(var i=1; i<data.length; i++){
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
    for(var i=1; i<data.length; i++){
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
    for(var i=data.length-1; i>=1; i--){ // reverse order for latest first, limited
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'quantity') val = Number(val) || 0;
        if (keys[j] === 'cost_price') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      result.push(obj);
      if(result.length > 300) break; // Limit records to 300
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
