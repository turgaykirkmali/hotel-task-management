// WebSocket util functions for client side
import { processWebSocketNotification } from './notifications';

let socket: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let reconnectTimeout: any = null;
let lastAuthInfo: { userId: number; hotelId: number; role: string } | null = null;

// Initialize WebSocket connection
export function initWebSocket() {
  if (socket) {
    // Eğer mevcut bir soket varsa ve açıksa, onu kullan
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      return socket;
    }
    // Soket kapalı veya kapanıyorsa, referansı temizle
    socket = null;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  try {
    socket = new WebSocket(wsUrl);
    
    // Gelen mesajları dinle
    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Bildirim servisine mesajı ilet
        processWebSocketNotification(data);
      } catch (e) {
        console.error('WebSocket message parsing error:', e);
      }
    });
    
    // Connection error handler
    socket.addEventListener('error', (event) => {
      console.error('WebSocket connection error:', event);
    });
    
    // Connection close handler
    socket.addEventListener('close', (event) => {
      console.log(`WebSocket connection closed with code ${event.code} and reason: ${event.reason}`);
      socket = null; // Clear socket reference
      
      // Yeniden bağlantı denemeleri
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
        
        // Giderek artan gecikmelerle yeniden bağlantı dene
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
        
        // Önceki timeout'u temizle
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        
        reconnectTimeout = setTimeout(() => {
          console.log('Reconnecting to WebSocket...');
          const newSocket = initWebSocket();
          
          if (!newSocket) {
            console.error('Failed to create new WebSocket connection');
            return;
          }
          
          console.log('New WebSocket instance created, waiting for open event');
        }, delay);
      } else {
        console.warn('Maximum reconnection attempts reached. WebSocket disconnected.');
      }
    });
    
    // Connection open handler
    socket.addEventListener('open', () => {
      console.log('WebSocket connection established');
      // Bağlantı başarılı olduğunda yeniden deneme sayacını sıfırla
      reconnectAttempts = 0;
      
      // Yeniden bağlantıyı başarılı olunca son kimlik doğrulama bilgilerini kullan
      // Bağlantının tam olarak hazır olduğunu onaylamak için küçük bir gecikme ekle
      if (lastAuthInfo) {
        // WebSocket'in gerçekten OPEN durumuna gelmesi için küçük bir gecikme
        setTimeout(() => {
          if (socket && socket.readyState === WebSocket.OPEN && lastAuthInfo) {
            console.log('Authentication message sent');
            authenticateWebSocket(lastAuthInfo.userId, lastAuthInfo.hotelId, lastAuthInfo.role);
          } else {
            console.warn('WebSocket not ready for auth message, state:', socket?.readyState);
          }
        }, 300); // 300ms gecikme ekle
      }
    });
    
    return socket;
  } catch (error) {
    console.error('Error creating WebSocket:', error);
    return null;
  }
}

// Send authentication message
export function authenticateWebSocket(userId: number, hotelId: number, role: string) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected');
    return false;
  }
  
  // Kimlik doğrulama bilgilerini sakla (yeniden bağlantılar için)
  lastAuthInfo = { userId, hotelId, role };
  
  const authMessage = {
    type: 'auth',
    userId,
    hotelId,
    role
  };
  
  try {
    socket.send(JSON.stringify(authMessage));
    return true;
  } catch (e) {
    console.error('Failed to send authentication message:', e);
    return false;
  }
}

// Send a message to the WebSocket server
export function sendWebSocketMessage(messageData: any) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.error('WebSocket not connected');
    return false;
  }
  
  try {
    socket.send(JSON.stringify(messageData));
    return true;
  } catch (e) {
    console.error('Failed to send message:', e);
    return false;
  }
}

// Close WebSocket connection
export function closeWebSocket() {
  if (socket) {
    socket.close();
    socket = null;
  }
}