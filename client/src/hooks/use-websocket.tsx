import { useState, useEffect, useCallback } from 'react';
import { notificationService, processWebSocketNotification } from '@/lib/notifications';
import { queryClient } from '@/lib/queryClient';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

export function useWebSocket() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [notifications, setNotifications] = useState<WebSocketMessage[]>([]);
  // Kullanıcı bilgilerini localStorage'dan alıyoruz
  const [user, setUser] = useState<{id: number, hotelId: number, role: string} | null>(null);
  
  // LocalStorage'dan kullanıcı verilerini al
  useEffect(() => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || 'null');
      if (userData) {
        setUser({
          id: userData.id || 1,
          hotelId: userData.hotelId || 1,
          role: userData.role || 'staff'
        });
      }
    } catch (error) {
      console.error('Error parsing user data from localStorage:', error);
    }
  }, []);

  // Connect to the WebSocket server
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_DELAY_MS = 3000; // 3 seconds
    
    // Function to create and setup the WebSocket connection
    const connectWebSocket = () => {
      // Clear any existing reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      
      // Create WebSocket connection
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      ws = new WebSocket(wsUrl);
      
      // Connection opened
      ws.addEventListener('open', () => {
        console.log('WebSocket connection established');
        setIsConnected(true);
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // Send authentication message with user info
        if (user) {
          try {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'auth',
                userId: user.id,
                hotelId: user.hotelId,
                role: user.role
              }));
              console.log('Authentication message sent');
            }
          } catch (error) {
            console.error('Error sending authentication message:', error);
          }
        }
      });
      
      // Listen for messages
      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          // Telegram buton aksiyonları sonrası gelen anlık güncelleme
          if (data.type === 'request_update') {
            // React Query cache'ini invalidate et — liste anında yenilensin
            queryClient.invalidateQueries({ queryKey: ['/api/requests'] });
            // Bildirimi de göster
            try {
              processWebSocketNotification({ ...data, type: 'status_update' });
            } catch (_) {}
          }
          
          // Handle notifications
          if (['new_request', 'status_update', 'priority_update', 'deadline_update'].includes(data.type)) {
            setNotifications(prev => [...prev, data]);
            
            // Process for browser notification
            try {
              processWebSocketNotification(data);
            } catch (notificationError) {
              console.error('Error processing browser notification:', notificationError);
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });
      
      // Connection closed
      ws.addEventListener('close', (event) => {
        console.log('WebSocket connection closed', event.code, event.reason);
        setIsConnected(false);
        
        // Only attempt to reconnect if not cleanly closed and not exceeding max attempts
        if (!event.wasClean && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
          reconnectAttempts++;
          reconnectTimeout = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.log('Maximum reconnection attempts reached. Giving up.');
        }
      });
      
      // Connection error
      ws.addEventListener('error', (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      });
      
      setSocket(ws);
    };
    
    // Initial connection
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [user]);
  
  // Reconnect if user changes
  useEffect(() => {
    if (socket && isConnected && user) {
      // Kısa bir gecikme ekleyerek WebSocket bağlantısının hazır olmasını garantileyelim
      const authDelay = setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({
              type: 'auth',
              userId: user.id,
              hotelId: user.hotelId,
              role: user.role
            }));
            console.log('Reconnection authentication message sent');
          } catch (error) {
            console.error('Error sending reconnection authentication message:', error);
          }
        } else {
          console.warn('WebSocket not ready for auth message, state:', socket.readyState);
        }
      }, 500); // 500ms gecikme
      
      return () => clearTimeout(authDelay);
    }
  }, [socket, isConnected, user]);
  
  // Listen for custom message sending events from other components
  useEffect(() => {
    const handleSendMessageEvent = (event: Event) => {
      const customEvent = event as CustomEvent<WebSocketMessage>;
      if (socket && socket.readyState === WebSocket.OPEN && customEvent.detail) {
        try {
          socket.send(JSON.stringify(customEvent.detail));
          console.log('Message sent via custom event:', customEvent.detail);
          return true;
        } catch (error) {
          console.error('Error sending message via custom event:', error);
        }
      } else {
        console.warn('WebSocket not connected or message invalid', 
          socket ? `readyState: ${socket.readyState}` : 'no socket',
          customEvent.detail || 'no detail');
      }
      return false;
    };

    // Add event listener for custom message sending
    document.addEventListener('ws-send-message', handleSendMessageEvent);

    // Cleanup
    return () => {
      document.removeEventListener('ws-send-message', handleSendMessageEvent);
    };
  }, [socket]);

  // Send message to server
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, [socket]);
  
  // Clear notification
  const clearNotification = useCallback((id: number) => {
    setNotifications(prev => prev.filter(notification => 
      !(notification.request && notification.request.id === id)
    ));
  }, []);
  
  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);
  
  return {
    socket,
    isConnected,
    lastMessage,
    notifications,
    notificationCount: notifications.length,
    sendMessage,
    clearNotification,
    clearAllNotifications
  };
}