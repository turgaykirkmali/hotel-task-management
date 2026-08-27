import { Home, ClipboardList, FileText, Settings, PlusCircle, LogOut, Building2, SmilePlus, ShoppingBag, Trophy, BarChart3, PlugZap, MessageSquareText, Package, Warehouse, Sparkles, ChevronRight, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Hotel } from '@shared/schema';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  notificationCount: number;
  currentUser: string;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onLogout?: () => void;
  hotelName?: string;
  userRole?: string;
  hotelId?: number;
  onHotelChange?: (hotelId: string) => void;
}

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  notificationCount, 
  currentUser,
  isOpen,
  setIsOpen,
  onLogout,
  hotelName,
  userRole = 'staff',
  hotelId,
  onHotelChange
}: SidebarProps) {
  const [, setLocation] = useLocation();
  
  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    
    // Close mobile menu after tab change on small screens
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  };
  
  // Otelleri getir (sadece superadmin için)
  const { data: hotels = [], isLoading: hotelsLoading } = useQuery<Hotel[]>({
    queryKey: ['/api/hotels'],
    enabled: userRole === 'superadmin',
  });
  
  // Otel değişiklik olayını işle
  const handleHotelChange = (value: string) => {
    console.log("Otel seçildi, ID:", value);
    if (onHotelChange) {
      onHotelChange(value);
    }
  };
  
  return (
    <aside className={`bg-white w-72 flex-shrink-0 border-r border-slate-200/80 shadow-[4px_0_24px_rgba(15,23,42,0.04)] lg:relative h-full fixed inset-y-0 left-0 z-30 lg:translate-x-0 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="h-full flex flex-col">
        {/* App Logo */}
        <div className="px-5 py-5 border-b border-slate-100 bg-gradient-to-br from-white via-slate-50/60 to-primary/[0.04]">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary to-primary/75 text-white flex items-center justify-center shadow-lg shadow-primary/20">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-bold tracking-tight text-slate-900">Hotel Operations</h1>
              <p className="text-[11px] font-medium text-slate-500 tracking-wide">TASK MANAGEMENT</p>
            </div>
          </div>
          {hotelName && !userRole?.includes('superadmin') && (
            <div className="mt-3 px-3 py-2 rounded-xl bg-white border border-slate-200/80 text-xs font-semibold text-slate-600 truncate shadow-sm">{hotelName}</div>
          )}
        </div>
        
        {/* User Profile */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center p-2 rounded-2xl bg-slate-50/80 border border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center text-primary font-bold ring-1 ring-primary/10">
              {currentUser.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="font-medium">{currentUser}</p>
              <p className="text-sm text-gray-500 capitalize">
                {userRole === 'superadmin' ? 'Sistem Yöneticisi' : 
                 userRole === 'admin' ? 'Otel Yöneticisi' : 'Personel'}
              </p>
            </div>
          </div>
        </div>
        
        {/* Superadmin için otel seçici */}
        {userRole === 'superadmin' && (
          <div className="p-4 border-b border-gray-200">
            <div className="space-y-2">
              <div className="flex items-center text-sm text-gray-600 mb-1">
                <Building2 className="h-4 w-4 mr-2" />
                <span>Yönetilecek Oteli Seçin</span>
              </div>
              
              <Select
                disabled={hotelsLoading}
                value={hotelId?.toString() || ""}
                onValueChange={handleHotelChange}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tüm Oteller" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Tüm Oteller</SelectItem>
                  {hotels.map((hotel) => (
                    <SelectItem key={hotel.id} value={hotel.id.toString()}>
                      {hotel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        
        {/* Navigation Links */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Operasyon</div>
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "dashboard" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("dashboard")}
          >
            <Home className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            Gösterge Paneli
          </button>
          
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "requests" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("requests")}
          >
            <ClipboardList className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            İstek Listesi
            {notificationCount > 0 && (
              <span className="ml-auto bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
                {notificationCount}
              </span>
            )}
          </button>
          
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "new-request" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("new-request")}
          >
            <PlusCircle className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            Yeni İstek Oluştur
          </button>
          
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "operations" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("operations")}
          >
            <BarChart3 className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            Operasyon Merkezi
          </button>

          <button className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "integrations" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`} onClick={() => handleTabClick("integrations")}><PlugZap className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />Entegrasyonlar</button>
          <button className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "reviews" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`} onClick={() => handleTabClick("reviews")}><MessageSquareText className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />Review Tracker</button>
          <button className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "inventory" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`} onClick={() => handleTabClick("inventory")}><Package className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />Stok Yönetimi</button>

          <div className="px-2 pt-5 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Analiz & Yönetim</div>
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "reports" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("reports")}
          >
            <FileText className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            Raporlar
          </button>
          
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "mood-board" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("mood-board")}
          >
            <SmilePlus className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            Duygu Durumu
          </button>
          
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "badges" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("badges")}
          >
            <Trophy className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            Rozetler
          </button>
          
          <div className="px-2 pt-5 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Deneyim & Sistem</div>
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "closet-ar" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => {
              // Wouter'ın useLocation hook'unu kullanarak sayfa yönlendirmesi yap
              setLocation("/closet-ar");
              
              // Mobil menüyü kapat
              if (window.innerWidth < 1024) {
                setIsOpen(false);
              }
            }}
          >
            <ShoppingBag className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            ClosetAR
          </button>
          
          <button 
            className={`group flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${activeTab === "settings" ? "bg-primary text-primary-foreground shadow-md shadow-primary/15" : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
            onClick={() => handleTabClick("settings")}
          >
            <Settings className="h-[18px] w-[18px] mr-3 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            Ayarlar
          </button>
        </nav>
        {/* Logout Button */}
        <div className="p-4 border-t border-gray-200 mt-auto">
          <Button
            variant="outline"
            className="w-full h-10 rounded-xl flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Çıkış Yap
          </Button>
        </div>
      </div>
    </aside>
  );
}
