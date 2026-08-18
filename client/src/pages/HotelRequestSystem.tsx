import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from "wouter";
import { useWebSocket } from '@/hooks/use-websocket';
import { Loader2 } from 'lucide-react';

import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import OperationsCenter from '@/components/OperationsCenter';
import RequestsList from '@/components/RequestsList';
import NewRequest from '@/components/NewRequest';
import Reports from '@/components/Reports';
import Settings from '@/components/Settings';
import SimpleSettings from '@/components/SimpleSettings';
import MoodBoard from '@/components/MoodBoard';
import Badges from '@/components/Badges';
import BadgeManagement from '@/components/BadgeManagement';
import NotificationPopover from '@/components/NotificationPopover';
import { Request, ReportType, StatusType } from '@shared/schema';

export default function HotelRequestSystem() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [currentUser, setCurrentUser] = useState<string>("Admin");
  const [currentHotel, setCurrentHotel] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("staff");
  const [selectedHotelId, setSelectedHotelId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | StatusType>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Initialize WebSocket connection
  const { isConnected, lastMessage, notifications: wsNotifications } = useWebSocket();
  
  // Get user from localStorage
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user) {
      setCurrentUser(user.username || 'Kullanıcı');
      setUserRole(user.role || 'staff');
    } else {
      setLocation('/auth');
    }
  }, [setLocation]);

  // Fetch user info
  const { data: userData } = useQuery({
    queryKey: ['/api/user']
  });

  // Fetch hotel details when userData changes
  useEffect(() => {
    if (userData) {
      setUserRole(userData.role || 'staff');
      
      // If the user has a hotelId or we have a selected hotel (for superadmin), fetch hotel details
      const hotelIdToUse = selectedHotelId || userData.hotelId;
      
      if (hotelIdToUse) {
        fetch(`/api/hotels/${hotelIdToUse}`)
          .then(res => res.json())
          .then(hotelData => {
            if (hotelData && hotelData.name) {
              console.log("Fetched hotel name:", hotelData.name);
              setCurrentHotel(hotelData.name);
            }
          })
          .catch(err => console.error("Error fetching hotel:", err));
      } else if (userData.role === 'superadmin') {
        // Superadmin tüm otellere baktığında
        setCurrentHotel("Tüm Oteller");
      }
    }
  }, [userData, selectedHotelId]);
  
  // Handle hotel selection change for superadmin
  const handleHotelChange = (hotelIdStr: string) => {
    console.log("HotelRequestSystem - Otel seçildi:", hotelIdStr);
    const hotelId = parseInt(hotelIdStr, 10);
    
    // "0" değeri tüm otelleri göstermek için kullanılır (null olarak işlenir)
    const selectedId = hotelId === 0 ? null : hotelId;
    
    console.log("Seçilen otel ID:", selectedId);
    setSelectedHotelId(selectedId);
    
    // WebSocket'e yeni otel seçimini bildir
    if (userData && userData.id) {
      try {
        const message = {
          type: 'auth',
          userId: userData.id,
          hotelId: selectedId,
          role: userData.role
        };
        // WebSocket yeniden bağlantı ve kimlik doğrulama
        document.dispatchEvent(new CustomEvent('ws-send-message', { detail: message }));
        console.log('Hotel selection changed, notified WebSocket', message);
      } catch (error) {
        console.error('Error notifying WebSocket about hotel change:', error);
      }
    }
  };

  // Fetch requests - If superadmin with selected hotel, filter requests by that hotel
  const requestsQueryKey = selectedHotelId 
    ? ['/api/requests', selectedHotelId]  // Seçili otel varsa, o otele özgü istekleri al
    : ['/api/requests'];                 // Yoksa tüm istekleri al
  
  const { data: requests = [], isLoading: requestsLoading } = useQuery<Request[]>({
    queryKey: requestsQueryKey,
    queryFn: async ({ queryKey }) => {
      const url = selectedHotelId 
        ? `/api/requests?hotelId=${selectedHotelId}` 
        : '/api/requests';
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      console.log('Fetched requests:', data);
      return data as Request[];
    }
  });

  // Calculate notifications (pending requests)
  const pendingRequests = requests?.filter((req) => req.status !== "tamamlandı") || [];

  // Update request status mutation
  const updateRequestStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: StatusType }) => {
      return apiRequest('PATCH', `/api/requests/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
      toast({
        title: "İstek güncellendi",
        description: "İstek durumu başarıyla güncellendi.",
      });
    },
    onError: (error) => {
      toast({
        title: "Hata",
        description: `İstek güncellenirken bir hata oluştu: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Get filtered requests
  const getFilteredRequests = () => {
    if (!requests) return [];
    
    let filtered = [...requests];
    
    if (filterStatus !== "all") {
      filtered = filtered.filter((req: Request) => req.status === filterStatus);
    }
    
    if (filterDepartment !== "all") {
      filtered = filtered.filter((req: Request) => req.department === filterDepartment);
    }
    
    // Sort by creation date, newest first
    return filtered.sort((a: Request, b: Request) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  // Get page title based on active tab
  const getPageTitle = () => {
    const titleMap: Record<string, string> = {
      dashboard: 'Gösterge Paneli',
      requests: 'İstek Listesi',
      'new-request': 'Yeni İstek Oluştur',
      reports: 'Raporlar',
      operations: 'Operasyon Merkezi',
      'mood-board': 'Duygu Durumu Panosu',
      badges: 'Rozetler',
      settings: 'Ayarlar'
    };
    
    return titleMap[activeTab] || 'Otel İstek Sistemi';
  };

  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* Mobile menu toggle */}
      <button 
        onClick={toggleMobileMenu}
        className="lg:hidden fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground p-3 rounded-full shadow-lg"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        notificationCount={pendingRequests.length}
        currentUser={currentUser}
        isOpen={isMobileMenuOpen}
        setIsOpen={setIsMobileMenuOpen}
        hotelName={currentHotel}
        userRole={userRole}
        hotelId={selectedHotelId || undefined}
        onHotelChange={handleHotelChange}
        onLogout={() => {
          // Clear localStorage
          localStorage.removeItem('user');
          // Clear queryClient cache
          queryClient.clear();
          // Redirect to login page
          setLocation('/auth');
          
          toast({
            title: "Çıkış yapıldı",
            description: "Başarıyla çıkış yaptınız. Yönlendiriliyorsunuz...",
          });
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        {/* Top Navigation Bar */}
        <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">
            {getPageTitle()}
            {currentHotel && <span className="ml-2 text-sm font-normal text-gray-500">- {currentHotel}</span>}
          </h2>
          
          <div className="flex items-center space-x-4">
            {/* WebSocket connection status indicator */}
            <div className="flex items-center">
              <div className={`h-2 w-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-xs text-gray-500">{isConnected ? 'Online' : 'Offline'}</span>
            </div>
            
            {/* Notifications Popover */}
            <NotificationPopover 
              requests={requests} 
              notificationCount={pendingRequests.length}
              onSelectRequest={(id) => {
                setFilterStatus("all");
                setActiveTab("requests");
                
                // Highlight the selected request by scrolling to it
                setTimeout(() => {
                  const element = document.getElementById(`request-${id}`);
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.classList.add('bg-blue-50');
                    setTimeout(() => {
                      element.classList.remove('bg-blue-50');
                    }, 3000);
                  }
                }, 100);
              }}
            />
          </div>
        </header>

        {/* Page Content */}
        <div>
          {activeTab === "dashboard" && (
            <Dashboard 
              requests={requests} 
              loading={requestsLoading} 
              onFilterChange={(status) => {
                setFilterStatus(status);
                setActiveTab("requests");
              }}
            />
          )}
          
          {activeTab === "requests" && (
            <RequestsList 
              requests={getFilteredRequests()} 
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              filterDepartment={filterDepartment}
              setFilterDepartment={setFilterDepartment}
              updateRequestStatus={updateRequestStatus}
              loading={requestsLoading}
            />
          )}
          
          {activeTab === "new-request" && (
            <NewRequest onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
              setActiveTab("requests");
            }} />
          )}
          
          {activeTab === "operations" && (
            <OperationsCenter hotelId={selectedHotelId || userData?.hotelId || undefined} />
          )}

          {activeTab === "reports" && (
            <Reports 
              requests={requests} 
              reportType={reportType} 
              setReportType={setReportType} 
              loading={requestsLoading}
            />
          )}
          
          {activeTab === "mood-board" && (
            <div className="p-6">
              <MoodBoard
                userId={userData?.id || 0}
                hotelId={selectedHotelId || userData?.hotelId || 0}
                userRole={userRole}
              />
            </div>
          )}
          
          {activeTab === "badges" && (
            <div className="p-6">
              {userRole === 'superadmin' || userRole === 'admin' ? (
                <BadgeManagement 
                  currentUserId={userData?.id || 0}
                  userRole={userRole}
                  hotelId={selectedHotelId || userData?.hotelId || 0}
                />
              ) : (
                <Badges 
                  userId={userData?.id || 0}
                  userName={currentUser}
                  userRole={userRole}
                />
              )}
            </div>
          )}
          
          {activeTab === "settings" && (
            <div className="p-6">
              {requestsLoading ? (
                <div className="flex items-center justify-center h-[500px]">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-2 text-gray-600">Ayarlar yükleniyor...</span>
                </div>
              ) : (
                <Settings 
                  key={`settings-${selectedHotelId || 0}-${Date.now()}`}
                  currentHotelId={selectedHotelId} 
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
