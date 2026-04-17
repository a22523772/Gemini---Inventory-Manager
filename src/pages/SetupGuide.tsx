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
               <h3 className="font-bold text-[var(--color-accent-blue)]">Important Notice about PWA vs Flutter</h3>
               <p className="mt-1 text-white/90">
                 As requested, this system provides offline functionality, barcode scanning, and fast local search. Because this is a Web development platform, we have built this as a <strong>PWA (Progressive Web App)</strong>. 
               </p>
               <ul className="list-disc pl-5 mt-2 space-y-1 text-white/90">
                 <li><strong>iOS Usage:</strong> Open this URL in Safari, tap "Share", and select <strong>"Add to Home Screen"</strong>. It will function identically to a native app and work offline.</li>
                 <li><strong>Flutter Requirement:</strong> If you strictly need to compile a Flutter app, the guidelines are provided below.</li>
               </ul>
             </div>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)]">1. Google Sheets Setup</h3>
                <p className="text-[var(--color-text-dim)] mt-1">Create a new Google Sheet and add these tabs:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-white/80 font-mono text-xs">
                  <li><strong>products</strong>: product_id, barcode, name, category, unit, cost_price, vendor_id, has_expiry, created_at</li>
                  <li><strong>vendors</strong>: vendor_id, vendor_name, contact, phone</li>
                  <li><strong>stock</strong>: stock_id, product_id, location, floor, area, quantity, expiry_date, last_update</li>
                  <li><strong>transactions</strong>: transaction_id, product_id, type, quantity, location, floor, area, cost_price, vendor_id, date, note, operator</li>
                </ul>
             </section>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)] mt-6">2. Google Apps Script API</h3>
                <p className="text-[var(--color-text-dim)] mt-1">In your Google Sheet, go to Extensions &gt; Apps Script. Paste this code and deploy as a Web App (Anyone with link):</p>
                <pre className="bg-black/40 border border-white/10 text-[var(--color-text-dim)] p-4 rounded-xl mt-3 overflow-x-auto text-xs font-mono">
{`function doPost(e) {
  var action = e.parameter.action;
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'addProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (!prodSheet) prodSheet = ss.insertSheet('products');
    if (prodSheet.getLastRow() === 0) {
      prodSheet.appendRow(['product_id', 'barcode', 'name', 'category', 'unit', 'cost_price', 'vendor_id', 'has_expiry', 'created_at']);
    }
    prodSheet.appendRow([data.product_id, data.barcode, data.name, data.category, data.unit, data.cost_price, data.vendor_id, data.has_expiry, data.created_at]);
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'stockIn') {
    var stockSheet = ss.getSheetByName('stock');
    if (!stockSheet) stockSheet = ss.insertSheet('stock');
    var transSheet = ss.getSheetByName('transactions');
    if (!transSheet) transSheet = ss.insertSheet('transactions');
    
    var stockId = data.product_id + '_' + data.location + '_' + data.floor + '_' + data.area;
    
    // Find or create in stock
    var lastRow = stockSheet.getLastRow();
    var found = false;
    
    if (lastRow > 0) {
      var values = stockSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
         if (values[i][0] == stockId) {
            stockSheet.getRange(i+1, 6).setValue(Number(values[i][5]) + Number(data.quantity));
            stockSheet.getRange(i+1, 8).setValue(new Date().toISOString());
            found = true;
            break;
         }
      }
    } else {
      // Initialize headers if empty
      stockSheet.appendRow(['stock_id', 'product_id', 'location', 'floor', 'area', 'quantity', 'expiry_date', 'last_update']);
    }
    
    if (!found) {
       stockSheet.appendRow([stockId, data.product_id, data.location, data.floor, data.area, data.quantity, '', new Date().toISOString()]);
    }
    
    if(transSheet.getLastRow() === 0) transSheet.appendRow(['transaction_id', 'product_id', 'type', 'quantity', 'location', 'floor', 'area', 'cost_price', 'vendor_id', 'date', 'note', 'operator']);
    
    // Append transaction
    transSheet.appendRow([Utilities.getUuid(), data.product_id, 'stock_in', data.quantity, data.location, data.floor, data.area, data.cost_price, data.vendor_id, new Date().toISOString(), '', data.operator]);
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if(action === 'stockOut') {
    var stockSheet = ss.getSheetByName('stock');
    var transSheet = ss.getSheetByName('transactions');
    var stockId = data.product_id + '_' + data.location + '_' + data.floor + '_' + data.area;
    
    if(stockSheet && stockSheet.getLastRow() > 0) {
      var values = stockSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
         if (values[i][0] == stockId) {
            var newQ = Number(values[i][5]) - Number(data.quantity);
            stockSheet.getRange(i+1, 6).setValue(newQ < 0 ? 0 : newQ);
            stockSheet.getRange(i+1, 8).setValue(new Date().toISOString());
            break;
         }
      }
    }
    transSheet.appendRow([Utilities.getUuid(), data.product_id, 'stock_out', data.quantity, data.location, data.floor, data.area, '', '', new Date().toISOString(), '', data.operator]);
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if(action === 'adjustStock') {
      var stockSheet = ss.getSheetByName('stock');
      var transSheet = ss.getSheetByName('transactions');
      var stockId = data.product_id + '_' + data.location + '_' + data.floor + '_' + data.area;
      
      if(stockSheet && stockSheet.getLastRow() > 0) {
        var values = stockSheet.getDataRange().getValues();
        for (var i = 1; i < values.length; i++) {
           if (values[i][0] == stockId) {
              stockSheet.getRange(i+1, 6).setValue(Number(data.quantity));
              stockSheet.getRange(i+1, 8).setValue(new Date().toISOString());
              break;
           }
        }
      }
      transSheet.appendRow([Utilities.getUuid(), data.product_id, 'adjust', data.quantity, data.location, data.floor, data.area, '', '', new Date().toISOString(), data.note, data.operator]);
      return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action === 'getProducts') {
    var sheet = ss.getSheetByName('products');
    if(!sheet || sheet.getLastRow() === 0) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getDataRange().getValues();
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
    if(!sheet || sheet.getLastRow() === 0) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var data = sheet.getDataRange().getValues();
    var keys = data[0];
    var result = [];
    for(var i=1; i<data.length; i++){
      var obj = {};
      for(var j=0; j<keys.length; j++){ obj[keys[j]] = data[i][j]; }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
}`}
                </pre>
             </section>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)] mt-8">3. Native Flutter App (Optional)</h3>
                <p className="text-[var(--color-text-dim)] mt-1">If you specifically want to compile a native App instead of using this Web App (PWA), here is the main logic you need using <code>mobile_scanner</code> and <code>sqflite</code>:</p>
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
