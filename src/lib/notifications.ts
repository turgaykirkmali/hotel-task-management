// Bildirim servisi
type NotificationType = 'new_request' | 'status_update' | 'priority_update' | 'deadline_update';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: any;
  requestId?: number;
}

class NotificationService {
  private hasPermission = false;
  private audioContext: AudioContext | null = null;
  private isMobile = false;
  private isSupportedBrowser = true;

  constructor() {
    // Mobil cihaz kontrolü
    this.isMobile = this.checkIfMobile();
    
    // Chrome tarayıcısı kontrolü
    const isChrome = this.isChromeBrowser();
    
    // Tarayıcı bildirimleri destekliyor mu kontrol et
    if (!('Notification' in window)) {
      console.warn('Bu tarayıcı masaüstü bildirimlerini desteklemiyor');
      this.isSupportedBrowser = false;
      
      // Chrome mobil tarayıcısı özel durumu
      if (this.isMobile && isChrome) {
        console.log('Chrome mobil tarayıcısı tespit edildi, uygulama içi bildirimler kullanılacak');
        this.isSupportedBrowser = true; // Uygulama içi bildirimleri etkinleştir
      }
      return;
    }

    // İzin durumunu kontrol et
    if (Notification.permission === 'granted') {
      this.hasPermission = true;
    } 
    
    // Chrome tarayıcısında otomatik bildirim izni isteme
    if (isChrome && Notification.permission === 'default') {
      // Sayfa yüklendikten sonra otomatik olarak izin iste (Chrome için önemli)
      setTimeout(() => {
        this.requestPermission().then(granted => {
          this.hasPermission = granted;
        });
      }, 1000);
    }
  }

  // Mobil cihaz mı kontrolü
  public checkIfMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  
  // Chrome tarayıcısı kontrolü (mobil veya masaüstü)
  public isChromeBrowser(): boolean {
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    const isMobileChrome = /Android.*Chrome\/[.0-9]*/.test(navigator.userAgent);
    
    console.log("Tarayıcı tespiti:", { 
      isChrome, 
      isMobileChrome, 
      userAgent: navigator.userAgent 
    });
    
    return isChrome || isMobileChrome;
  }

  // Cihaz türüne göre bildirim desteğini kontrol et
  public isNotificationsSupported(): boolean {
    // Chrome ve Android Chrome tarayıcısı özel kontrolü
    const isChrome = this.isChromeBrowser();
    
    if (isChrome) {
      // Chrome tarayıcısında her zaman true döndür, 
      // çünkü desteklemese bile uygulama içi bildirim göstereceğiz
      return true;
    }
    
    // Mobil tarayıcılarda desteklemese bile uygulama içi bildirim göstereceğiz
    if (this.isMobile) {
      return true;
    }
    
    // Diğer tarayıcılar için genel destek kontrolü
    return this.isSupportedBrowser;
  }

  // Bildirim izni iste
  public requestPermission(): Promise<boolean> {
    // Chrome tarayıcısı ve desteklenmeyen tarayıcılar için özel işlem
    if (!('Notification' in window)) {
      // Chrome mobil tarayıcısı ise doğrudan true döndür, uygulama içi bildirim göstereceğiz
      if (this.isMobile && this.isChromeBrowser()) {
        return Promise.resolve(true);
      }
      
      return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          this.hasPermission = true;
          resolve(true);
        } else {
          // Chrome mobil tarayıcısı ve reddedilmiş izin durumunda
          // yine de uygulama içi bildirim göstereceğiz, bu nedenle true döndür
          if (this.isMobile && this.isChromeBrowser()) {
            resolve(true);
          } else {
            resolve(false);
          }
        }
      });
    });
  }

  // Bildirim gönder
  public async showNotification(options: NotificationOptions): Promise<void> {
    // Önce ses çal - mobil cihazlarda da çalışır
    this.playNotificationSound();
    
    const isChromeAndMobile = this.isMobile && this.isChromeBrowser();
    
    // Eğer Chrome mobil tarayıcısı ise doğrudan uygulama içi bildirim göster
    if (isChromeAndMobile) {
      this.showInAppNotification(options);
      return;
    }
    
    // Tarayıcı bildirimleri desteklenmiyorsa veya mobil cihazsa
    // uygulama içi bildirim göster
    if (!('Notification' in window) || (this.isMobile && !this.hasPermission)) {
      this.showInAppNotification(options);
      return;
    }
    
    // İzin yoksa ve kullanıcı izni vermiyorsa
    if (!this.hasPermission && !(await this.requestPermission())) {
      console.warn('Bildirim izni reddedildi');
      // Alternatif olarak uygulama içi bildirim göster
      this.showInAppNotification(options);
      return;
    }

    try {
      // Web bildirim API ile masaüstü bildirimi göster
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag || 'hotel-request',
        data: options.data || {},
      });

      // Bildirime tıklandığında
      notification.onclick = () => {
        window.focus();
        if (options.requestId) {
          // İsteğe odaklanmak için element ID'sine git
          const requestElement = document.getElementById(`request-${options.requestId}`);
          if (requestElement) {
            requestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Görsel vurgu için kısa bir animasyon (CSS'te tanımlanmalı)
            requestElement.classList.add('highlight-request');
            setTimeout(() => {
              requestElement.classList.remove('highlight-request');
            }, 2000);
          }
        }
        notification.close();
      };
    } catch (error) {
      console.error('Bildirim gösterilirken hata oluştu:', error);
      // Hata durumunda da uygulama içi bildirim göster
      this.showInAppNotification(options);
    }
  }
  
  // Uygulama içi bildirim göster (tarayıcı bildirimleri desteklenmeyen cihazlar için)
  public showInAppNotification(options: NotificationOptions): void {
    // DOM'da bildirim göstermek için bir element oluştur
    const notificationElement = document.createElement('div');
    notificationElement.className = 'in-app-notification';
    notificationElement.innerHTML = `
      <div class="notification-content">
        <h4>${options.title}</h4>
        <p>${options.body}</p>
      </div>
      <button class="notification-close">&times;</button>
    `;
    
    // Stillerle zenginleştir
    Object.assign(notificationElement.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '9999',
      backgroundColor: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      padding: '12px',
      maxWidth: '320px',
      border: '1px solid #e2e8f0',
      animation: 'slideIn 0.3s ease-out'
    });
    
    // Kapatma butonu işlevi
    const closeButton = notificationElement.querySelector('.notification-close');
    if (closeButton) {
      // Kapatma butonu stili
      Object.assign((closeButton as HTMLElement).style, {
        background: 'transparent',
        border: 'none',
        position: 'absolute',
        top: '8px',
        right: '8px',
        cursor: 'pointer',
        fontSize: '16px'
      });
      
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.removeChild(notificationElement);
      });
    }
    
    // Bildirime tıklandığında isteğe git
    notificationElement.addEventListener('click', (e) => {
      if (e.target !== closeButton) {
        if (options.requestId) {
          const requestElement = document.getElementById(`request-${options.requestId}`);
          if (requestElement) {
            requestElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            requestElement.classList.add('highlight-request');
            setTimeout(() => {
              requestElement.classList.remove('highlight-request');
            }, 2000);
          }
        }
        document.body.removeChild(notificationElement);
      }
    });
    
    // CSS animasyonu ekle
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .highlight-request {
        animation: highlight 2s;
      }
      @keyframes highlight {
        0% { background-color: rgba(59, 130, 246, 0.3); }
        100% { background-color: transparent; }
      }
    `;
    document.head.appendChild(style);
    
    // Bildirimi DOM'a ekle
    document.body.appendChild(notificationElement);
    
    // 5 saniye sonra otomatik kapat
    setTimeout(() => {
      if (document.body.contains(notificationElement)) {
        // Çıkış animasyonu
        notificationElement.style.animation = 'slideOut 0.3s ease-in forwards';
        
        // Animasyon tamamlandıktan sonra kaldır
        setTimeout(() => {
          if (document.body.contains(notificationElement)) {
            document.body.removeChild(notificationElement);
          }
        }, 300);
      }
    }, 5000);
  }

  // Bildirim sesi çal
  public playNotificationSound(): void {
    try {
      // Mobil cihazlarda AudioContext kullanımı için kullanıcı etkileşimi gereklidir
      const isMobile = this.checkIfMobile();
      
      // AudioContext kullanımı (masaüstü ve bazı mobil tarayıcılar için)
      if (!this.audioContext) {
        try {
          this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (e) {
          console.warn('AudioContext oluşturulamadı, alternatif ses çalma yöntemi kullanılacak', e);
        }
      }
      
      if (this.audioContext) {
        // Osilatör oluştur
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Ses dalga tipi ve frekans ayarla
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // La notası (A5)
        
        // Ses azaltma ayarla
        gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 1);
        
        // Bağlantıları kur
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        // Sesi çal
        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 1);
      } 
      // AudioContext yoksa veya mobil cihazda kullanılamıyorsa basit bir ses çal
      else if (isMobile) {
        // Mobil cihazlarda <audio> elementi kullanarak ses çal
        // Ses dosyası kaynağı kullanıcının bir şeye tıklaması ile tetiklenmeli 
        // (mobil tarayıcılar için gerekli)
        const audio = new Audio();
        // Şu anda çalışmak için kullanıcı etkileşimine ihtiyaç var
        // ses dosyasını import etmek yerine inline yaratıyoruz
        audio.src = 'data:audio/wav;base64,UklGRl9JAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAAABMYXZjNTguMTkuMTAxAGRhdGE7SQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
        try {
          // Kullanıcı etkileşimi olmadan bazı mobil tarayıcılarda çalışmayabilir
          const playPromise = audio.play();
          
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              console.warn('Mobil cihazda ses otomatik olarak çalınamadı (kullanıcı etkileşimi olmadığından):', e);
            });
          }
        } catch (e) {
          console.warn('Ses dosyası çalınamadı:', e);
        }
      }
    } catch (error) {
      console.error('Bildirim sesi çalınamadı:', error);
    }
  }

  // Bildirim sesi durumunu ayarla
  public enableSound(enable: boolean): void {
    if (enable) {
      // Ses etkinleştirildiğinde AudioContext'i başlat veya devam ettir
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
    } else {
      // Ses devre dışı bırakıldığında AudioContext'i duraklat
      if (this.audioContext && this.audioContext.state === 'running') {
        this.audioContext.suspend();
      }
    }
  }
}

export const notificationService = new NotificationService();

export function processWebSocketNotification(data: any): void {
  if (!data) return;

  const { type, request } = data;
  
  if (!type || !request) return;

  let notificationOptions: NotificationOptions = {
    title: '',
    body: '',
    requestId: request.id,
    data: { requestId: request.id }
  };

  switch (type) {
    case 'new_request':
      notificationOptions.title = 'Yeni İstek Geldi';
      notificationOptions.body = `Oda ${request.roomNumber}: ${request.request.substring(0, 50)}${request.request.length > 50 ? '...' : ''}`;
      break;
    
    case 'status_update':
      notificationOptions.title = 'İstek Durumu Güncellendi';
      notificationOptions.body = `Oda ${request.roomNumber} isteği "${request.status}" durumuna güncellendi`;
      break;
      
    case 'priority_update':
      notificationOptions.title = 'İstek Önceliği Güncellendi';
      notificationOptions.body = `Oda ${request.roomNumber} isteği ${request.priority} öncelik seviyesine güncellendi`;
      break;
      
    case 'deadline_update':
      const deadline = new Date(request.deadline);
      notificationOptions.title = 'İstek Son Tarihi Güncellendi';
      notificationOptions.body = `Oda ${request.roomNumber} isteği için son tarih: ${deadline.toLocaleString('tr-TR')}`;
      break;
      
    default:
      return; // Tanımlanmamış bildirim tiplerini işleme
  }

  // Bildirimi göster
  notificationService.showNotification(notificationOptions);
}