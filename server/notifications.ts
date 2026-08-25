import { MailService } from '@sendgrid/mail';
import { Request } from '@shared/schema';
import { storage } from './storage';
import { dispatchConfiguredNotifications } from './enterprise';

// SendGrid e-posta servisi
let mailService: MailService | null = null;

// SendGrid yapılandırması (API anahtarı olduğunda)
export function configureSendGrid() {
  if (process.env.SENDGRID_API_KEY) {
    mailService = new MailService();
    mailService.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('SendGrid servisi başarıyla yapılandırıldı');
    return true;
  }
  
  console.log('SendGrid API anahtarı bulunamadı, e-posta bildirimleri devre dışı');
  return false;
}

// E-posta gönderme fonksiyonu
export async function sendEmail(to: string, subject: string, htmlContent: string, textContent?: string): Promise<boolean> {
  if (!mailService) {
    console.log('SendGrid yapılandırılmadı, e-posta gönderilemiyor');
    return false;
  }

  try {
    await mailService.send({
      to,
      from: 'bildirim@otelyonetimsistemi.com', // Bu adresi kendi doğrulanmış adresinizle değiştirin
      subject,
      html: htmlContent,
      text: textContent || htmlContent.replace(/<[^>]*>/g, '')
    });
    console.log(`E-posta gönderildi: ${to}`);
    return true;
  } catch (error) {
    console.error('E-posta gönderme hatası:', error);
    return false;
  }
}

// Bildirim türlerini tanımlayan interface
export interface NotificationPreferences {
  newRequest: boolean;
  statusUpdate: boolean;
  overdue: boolean;
  email?: string;
  phone?: string;
}

// Kullanıcı bildirim tercihlerini alır
export async function getUserNotificationPreferences(userId: number): Promise<NotificationPreferences> {
  const user = await storage.getUser(userId);
  
  if (!user || !user.settings) {
    // Varsayılan bildirim tercihleri
    return {
      newRequest: true,
      statusUpdate: true,
      overdue: true
    };
  }

  try {
    const settings = JSON.parse(user.settings);
    return {
      newRequest: settings.notifications?.newRequest ?? true,
      statusUpdate: settings.notifications?.statusUpdate ?? true,
      overdue: settings.notifications?.overdue ?? true,
      email: user.email || undefined,
      phone: user.phone || undefined
    };
  } catch (error) {
    console.error('Bildirim tercihleri alınırken hata:', error);
    return {
      newRequest: true,
      statusUpdate: true,
      overdue: true
    };
  }
}

// Kullanıcı listesine bildirim gönderir
export async function sendNotificationsToUsers(users: Array<any>, subject: string, htmlContent: string): Promise<void> {
  for (const user of users) {
    if (!user.id) continue;
    
    const preferences = await getUserNotificationPreferences(user.id);
    
    if (preferences.email) {
      await sendEmail(preferences.email, subject, htmlContent);
    }
  }
}

// Departman yöneticilerine bildirimleri gönderir
export async function notifyDepartmentManagers(hotelId: number, department: string, subject: string, htmlContent: string): Promise<void> {
  // İlgili departmandaki yöneticileri getir
  const users = await storage.getUsersByHotelId(hotelId);
  
  // Sadece aynı departmandaki ve bildirim tercihlerine sahip kullanıcıları filtrele
  const departmentUsers = users.filter(user => 
    user.department === department ||
    user.role === 'admin' ||
    user.role === 'superadmin'
  );
  
  await sendNotificationsToUsers(departmentUsers, subject, htmlContent);
}

// Yeni istek bildirimi
export async function notifyNewRequest(request: Request): Promise<void> {
  if (!request.hotelId) return;
  
  const subject = `Yeni İstek: ${request.roomNumber} - ${request.department}`;
  const htmlContent = `
    <h2>Yeni bir servis isteği oluşturuldu</h2>
    <p><strong>Oda:</strong> ${request.roomNumber}</p>
    <p><strong>Departman:</strong> ${request.department}</p>
    <p><strong>İstek:</strong> ${request.request}</p>
    <p><strong>Tarih:</strong> ${new Date(request.createdAt).toLocaleString('tr-TR')}</p>
    <p>Lütfen en kısa sürede ilgilenin.</p>
  `;
  
  await notifyDepartmentManagers(request.hotelId, request.department, subject, htmlContent);
  const users = (await storage.getUsersByHotelId(request.hotelId)).filter((u:any) => u.department === request.department || u.role === 'admin' || u.role === 'superadmin');
  await dispatchConfiguredNotifications(request.hotelId, users, subject, `${request.roomNumber} / ${request.department}: ${request.request}`, htmlContent);
}


// Durum değişikliği bildirimi
export async function notifyStatusUpdate(request: Request, oldStatus: string): Promise<void> {
  if (!request.hotelId) return;
  
  const subject = `İstek Durumu Güncellendi: ${request.roomNumber} - ${request.status}`;
  const htmlContent = `
    <h2>Servis isteği durumu güncellendi</h2>
    <p><strong>Oda:</strong> ${request.roomNumber}</p>
    <p><strong>Departman:</strong> ${request.department}</p>
    <p><strong>İstek:</strong> ${request.request}</p>
    <p><strong>Eski Durum:</strong> ${oldStatus}</p>
    <p><strong>Yeni Durum:</strong> ${request.status}</p>
    <p><strong>Tarih:</strong> ${new Date().toLocaleString('tr-TR')}</p>
  `;
  
  await notifyDepartmentManagers(request.hotelId, request.department, subject, htmlContent);
  const users = (await storage.getUsersByHotelId(request.hotelId)).filter((u:any) => u.department === request.department || u.role === 'admin' || u.role === 'superadmin');
  await dispatchConfiguredNotifications(request.hotelId, users, subject, `${request.roomNumber} / ${request.department}: ${request.status}`, htmlContent);
}

// Geciken istek bildirimi
export async function notifyOverdueRequest(request: Request): Promise<void> {
  if (!request.hotelId) return;
  
  const subject = `GECİKEN İSTEK: ${request.roomNumber} - ${request.department}`;
  const htmlContent = `
    <h2>⚠️ BİR İSTEK GECİKMEYE GİRDİ</h2>
    <p><strong>Oda:</strong> ${request.roomNumber}</p>
    <p><strong>Departman:</strong> ${request.department}</p>
    <p><strong>İstek:</strong> ${request.request}</p>
    <p><strong>Oluşturulma Tarihi:</strong> ${new Date(request.createdAt).toLocaleString('tr-TR')}</p>
    <p style="color: red; font-weight: bold">Bu istek belirlenen süre içinde tamamlanamadı ve şimdi GECİKEN durumunda.</p>
    <p>Lütfen acilen ilgilenin.</p>
  `;
  
  // Geciken istekler, departman yöneticilerine VE otel yöneticilerine gönderilir
  await notifyDepartmentManagers(request.hotelId, request.department, subject, htmlContent);
  
  // Oteldeki tüm admin rolündeki kullanıcılara da bildirim gönder
  const adminUsers = (await storage.getUsersByHotelId(request.hotelId))
    .filter(user => user.role === 'admin' || user.role === 'superadmin');
  
  await sendNotificationsToUsers(adminUsers, subject, htmlContent);
  const allUsers = (await storage.getUsersByHotelId(request.hotelId)).filter((u:any) => u.department === request.department || u.role === 'admin' || u.role === 'superadmin');
  await dispatchConfiguredNotifications(request.hotelId, allUsers, subject, `GECİKEN: ${request.roomNumber} / ${request.department}: ${request.request}`, htmlContent);
}