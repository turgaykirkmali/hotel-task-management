import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell } from 'lucide-react';
import { StatusType, Request } from '@shared/schema';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/hooks/use-websocket';

interface NotificationPopoverProps {
  requests: Request[];
  notificationCount: number;
  onSelectRequest: (requestId: number) => void;
}

export default function NotificationPopover({ 
  requests, 
  notificationCount,
  onSelectRequest
}: NotificationPopoverProps) {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Request[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [newNotifications, setNewNotifications] = useState<number[]>([]);
  const { notifications: wsNotifications, clearNotification, isConnected } = useWebSocket();
  
  // Update status mutation
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
    }
  });

  // Process websocket notifications
  useEffect(() => {
    if (wsNotifications.length > 0) {
      // Get the latest notification
      const latestNotification = wsNotifications[wsNotifications.length - 1];
      
      // Show different toast message based on notification type
      if (latestNotification.type === 'new_request' && !isOpen) {
        toast({
          title: "Yeni İstek",
          description: `Oda ${latestNotification.request.roomNumber}: ${latestNotification.request.request}`,
          variant: "default",
        });
      } else if (latestNotification.type === 'status_update' && !isOpen) {
        toast({
          title: "Durum Değişikliği",
          description: `Oda ${latestNotification.request.roomNumber} isteği ${latestNotification.request.status} olarak güncellendi`,
          variant: "default",
        });
      }
      
      // Force a refresh of data - we could also merge the notifications into the existing state
      queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
    }
  }, [wsNotifications, toast, isOpen, queryClient]);

  // Set up notifications whenever requests or WebSocket notifications change
  useEffect(() => {
    // Get pending and in progress requests
    const pendingRequests = requests.filter(
      req => req.status === "beklemede" || req.status === "işlemde"
    );
    
    // Sort by creation date, newest first
    const sortedRequests = [...pendingRequests].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // When there are WebSocket notifications, check if they are already in the requests list
    // If not (like when they're brand new), we could add them to the notifications list
    // For simplicity, we'll just invalidate the requests query, but in a real app
    // we might want to add them directly to the notifications list for better UX
    
    setNotifications(sortedRequests);
    
    // Check for new requests since last time component rendered
    const storedRequestIds = JSON.parse(localStorage.getItem('viewedNotifications') || '[]');
    const newNotificationIds = sortedRequests
      .filter(req => !storedRequestIds.includes(req.id))
      .map(req => req.id);
    
    if (newNotificationIds.length > 0) {
      setNewNotifications(newNotificationIds);
      // Notify user about new requests if popover is not open
      if (!isOpen && newNotificationIds.length > 0) {
        toast({
          title: `${newNotificationIds.length} Yeni İstek`,
          description: "Yeni istek(ler) geldi. İncelemek için bildirim ikonuna tıklayın.",
          variant: "default",
        });
      }
    }
  }, [requests, wsNotifications, isOpen, toast]);
  
  // Mark notifications as read when popover opens
  const handlePopoverOpen = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Handle regular notifications
      if (newNotifications.length > 0) {
        // Mark all notifications as viewed
        const storedIds = JSON.parse(localStorage.getItem('viewedNotifications') || '[]');
        const allIds = Array.from(new Set([...storedIds, ...newNotifications]));
        localStorage.setItem('viewedNotifications', JSON.stringify(allIds));
        setNewNotifications([]);
      }
      
      // Also clear any WebSocket notifications when the popover is opened
      if (wsNotifications.length > 0) {
        // Clear WebSocket notifications
        wsNotifications.forEach(notification => {
          if (notification.request && notification.request.id) {
            clearNotification(notification.request.id);
          }
        });
      }
    }
  };
  
  // Get status badge color
  const getStatusColor = (status: StatusType) => {
    switch (status) {
      case 'beklemede':
        return 'bg-yellow-100 text-yellow-800';
      case 'işlemde':
        return 'bg-blue-100 text-blue-800';
      case 'tamamlandı':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Format date
  const formatDate = (date: string | Date) => {
    return format(new Date(date), 'dd MMM, HH:mm', { locale: tr });
  };

  return (
    <Popover open={isOpen} onOpenChange={handlePopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-6 w-6" />
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
              {notificationCount}
            </span>
          )}
          {/* Online status indicator */}
          <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Bildirimler</h3>
          <p className="text-sm text-gray-500">
            {notificationCount > 0 
              ? `${notificationCount} bekleyen istek var` 
              : 'Bekleyen istek yok'}
          </p>
        </div>
        <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-200">
          {notifications.length > 0 ? (
            notifications.map((notification) => (
              <div 
                key={notification.id} 
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                  newNotifications.includes(notification.id) ? 'bg-blue-50' : ''
                }`}
                onClick={() => onSelectRequest(notification.id)}
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="font-medium">Oda {notification.roomNumber}</p>
                  <Badge variant="outline" className={getStatusColor(notification.status as StatusType)}>
                    {notification.status === 'beklemede' && 'Beklemede'}
                    {notification.status === 'işlemde' && 'İşlemde'}
                    {notification.status === 'tamamlandı' && 'Tamamlandı'}
                  </Badge>
                </div>
                <p className="text-sm line-clamp-2 mb-1">{notification.request}</p>
                <div className="flex justify-between items-center text-xs text-gray-500 mt-2">
                  <span>{notification.department}</span>
                  <span>{formatDate(notification.createdAt)}</span>
                </div>
                {newNotifications.includes(notification.id) && (
                  <div className="mt-2 text-xs text-blue-600 font-medium">Yeni istek</div>
                )}
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              Bildirim yok
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}