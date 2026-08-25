import { Home, ClipboardList, FileText, Settings, Bell, PlusCircle, LogOut, Building2, ChevronDown, SmilePlus, ShoppingBag, Trophy, BarChart3, PlugZap, MessageSquareText, Package } from 'lucide-react';
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
    <aside className={`bg-white w-64 flex-shrink-0 border-r border-gray-200 shadow-sm lg:relative h-full fixed inset-y-0 left-0 z-30 lg:translate-x-0 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="h-full flex flex-col">
        {/* App Logo */}
        <div className="flex flex-col items-center justify-center h-auto py-3 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-primary">Otel İstek Sistemi</h1>
          {hotelName && !userRole?.includes('superadmin') && (
            <div className="text-sm font-medium text-gray-600 mt-1">{hotelName}</div>
          )}
        </div>
        
        {/* User Profile */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
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
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "dashboard" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("dashboard")}
          >
            <Home className="h-5 w-5 mr-3" />
            Gösterge Paneli
          </button>
          
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "requests" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("requests")}
          >
            <ClipboardList className="h-5 w-5 mr-3" />
            İstek Listesi
            {notificationCount > 0 && (
              <span className="ml-auto bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
                {notificationCount}
              </span>
            )}
          </button>
          
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "new-request" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("new-request")}
          >
            <PlusCircle className="h-5 w-5 mr-3" />
            Yeni İstek Oluştur
          </button>
          
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "operations" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("operations")}
          >
            <BarChart3 className="h-5 w-5 mr-3" />
            Operasyon Merkezi
          </button>

          <button className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "integrations" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`} onClick={() => handleTabClick("integrations")}><PlugZap className="h-5 w-5 mr-3" />Entegrasyonlar</button>
          <button className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "reviews" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`} onClick={() => handleTabClick("reviews")}><MessageSquareText className="h-5 w-5 mr-3" />Review Tracker</button>
          <button className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "inventory" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`} onClick={() => handleTabClick("inventory")}><Package className="h-5 w-5 mr-3" />Stok Yönetimi</button>

          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "reports" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("reports")}
          >
            <FileText className="h-5 w-5 mr-3" />
            Raporlar
          </button>
          
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "mood-board" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("mood-board")}
          >
            <SmilePlus className="h-5 w-5 mr-3" />
            Duygu Durumu
          </button>
          
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "badges" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("badges")}
          >
            <Trophy className="h-5 w-5 mr-3" />
            Rozetler
          </button>
          
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "closet-ar" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => {
              // Wouter'ın useLocation hook'unu kullanarak sayfa yönlendirmesi yap
              setLocation("/closet-ar");
              
              // Mobil menüyü kapat
              if (window.innerWidth < 1024) {
                setIsOpen(false);
              }
            }}
          >
            <ShoppingBag className="h-5 w-5 mr-3" />
            ClosetAR
          </button>
          
          <button 
            className={`flex items-center w-full px-4 py-2 text-sm font-medium rounded-md ${activeTab === "settings" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
            onClick={() => handleTabClick("settings")}
          >
            <Settings className="h-5 w-5 mr-3" />
            Ayarlar
          </button>
        </nav>
        {/* Logout Button */}
        <div className="p-4 border-t border-gray-200 mt-auto">
          <Button
            variant="outline"
            className="w-full flex items-center justify-center text-gray-600 hover:text-gray-900"
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
