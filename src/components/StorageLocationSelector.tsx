import React, { useState } from 'react';
import { ChevronDown, Edit2, List } from 'lucide-react';

interface StorageLocationSelectorProps {
  location: string;
  floor: string;
  area: string;
  onChange: (fields: { location?: string; floor?: string; area?: string }) => void;
  availableLocations: string[];
  availableFloors: string[];
  availableAreas: string[];
}

export default function StorageLocationSelector({
  location,
  floor,
  area,
  onChange,
  availableLocations,
  availableFloors,
  availableAreas
}: StorageLocationSelectorProps) {
  const [isCustomLocation, setIsCustomLocation] = useState(!availableLocations.includes(location) && !!location);
  const [isCustomFloor, setIsCustomFloor] = useState(!availableFloors.includes(floor) && !!floor);
  const [isCustomArea, setIsCustomArea] = useState(!availableAreas.includes(area) && !!area);

  return (
    <div className="grid grid-cols-3 gap-1 min-w-[210px]">
      {/* 1. Location / Warehouse */}
      <div>
        {!isCustomLocation ? (
          <div className="relative">
            <select
              value={location}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__CUSTOM__') {
                  setIsCustomLocation(true);
                  return;
                }
                onChange({ location: val });
              }}
              className="w-full bg-[#1e293b] border border-white/10 hover:border-white/20 rounded px-1.5 py-1 text-[11px] text-white appearance-none pr-5 cursor-pointer"
              title="選擇存放倉庫/地點"
            >
              <option value="">-- 地點 --</option>
              {availableLocations.map(loc => (
                <option key={loc} value={loc} className="bg-slate-900 text-white">
                  {loc}
                </option>
              ))}
              <option value="__CUSTOM__" className="bg-slate-900 text-indigo-300 font-bold">
                + 自訂新地點...
              </option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <div className="relative flex items-center">
            <input
              type="text"
              autoFocus
              value={location}
              onChange={(e) => onChange({ location: e.target.value })}
              placeholder="新地點"
              className="w-full bg-[#1e293b] border border-indigo-500/60 rounded px-1 py-1 text-[11px] text-white pr-5 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setIsCustomLocation(false)}
              className="absolute right-1 text-slate-400 hover:text-sky-300 p-0.5"
              title="切換回下拉選單"
            >
              <List className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 2. Floor */}
      <div>
        {!isCustomFloor ? (
          <div className="relative">
            <select
              value={floor}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__CUSTOM__') {
                  setIsCustomFloor(true);
                  return;
                }
                onChange({ floor: val });
              }}
              className="w-full bg-[#1e293b] border border-white/10 hover:border-white/20 rounded px-1.5 py-1 text-[11px] text-white appearance-none pr-5 cursor-pointer"
              title="選擇樓層"
            >
              <option value="">-- 樓層 --</option>
              {availableFloors.map(fl => (
                <option key={fl} value={fl} className="bg-slate-900 text-white">
                  {fl}
                </option>
              ))}
              <option value="__CUSTOM__" className="bg-slate-900 text-indigo-300 font-bold">
                + 自訂樓層...
              </option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <div className="relative flex items-center">
            <input
              type="text"
              autoFocus
              value={floor}
              onChange={(e) => onChange({ floor: e.target.value })}
              placeholder="新樓層"
              className="w-full bg-[#1e293b] border border-indigo-500/60 rounded px-1 py-1 text-[11px] text-white pr-5 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setIsCustomFloor(false)}
              className="absolute right-1 text-slate-400 hover:text-sky-300 p-0.5"
              title="切換回下拉選單"
            >
              <List className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Area */}
      <div>
        {!isCustomArea ? (
          <div className="relative">
            <select
              value={area}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__CUSTOM__') {
                  setIsCustomArea(true);
                  return;
                }
                onChange({ area: val });
              }}
              className="w-full bg-[#1e293b] border border-white/10 hover:border-white/20 rounded px-1.5 py-1 text-[11px] text-white appearance-none pr-5 cursor-pointer"
              title="選擇分區"
            >
              <option value="">-- 分區 --</option>
              {availableAreas.map(ar => (
                <option key={ar} value={ar} className="bg-slate-900 text-white">
                  {ar}
                </option>
              ))}
              <option value="__CUSTOM__" className="bg-slate-900 text-indigo-300 font-bold">
                + 自訂分區...
              </option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <div className="relative flex items-center">
            <input
              type="text"
              autoFocus
              value={area}
              onChange={(e) => onChange({ area: e.target.value })}
              placeholder="新分區"
              className="w-full bg-[#1e293b] border border-indigo-500/60 rounded px-1 py-1 text-[11px] text-white pr-5 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setIsCustomArea(false)}
              className="absolute right-1 text-slate-400 hover:text-sky-300 p-0.5"
              title="切換回下拉選單"
            >
              <List className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
