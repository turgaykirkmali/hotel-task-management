// WhatsApp bildirim testi için basit bir test betiği
const { sendTaskAssignmentNotification } = require('./server/whatsapp');

// Görev atama bildirimini test et
async function testWhatsAppNotification() {
  console.log('WhatsApp mesaj testi başlatılıyor...');
  
  try {
    const result = await sendTaskAssignmentNotification(
      '+905551112233',  // Test telefon numarası
      '305',            // Oda numarası
      'Televizyon kumandası çalışmıyor', // Talep detayı
      'Teknik Servis',  // Departman
      new Date(Date.now() + 60 * 60 * 1000) // 1 saat sonra için deadline
    );
    
    console.log('WhatsApp bildirimi sonucu:', result);
  } catch (error) {
    console.error('WhatsApp mesajı gönderilirken hata oluştu:', error);
  }
}

// Testi çalıştır
testWhatsAppNotification();